const LIMITLESS_API_BASE = "https://play.limitlesstcg.com/api";
const LIMITLESS_SITE_BASE = "https://play.limitlesstcg.com";
const LIMITLESS_ONGOING_VGC_URL =
  "https://play.limitlesstcg.com/tournaments/ongoing?game=VGC";

export type TournamentSummary = {
  id: string;
  game: string;
  format: string;
  name: string;
  date: string;
  players: number;
  organizerId?: number;
};

export type TournamentDetails = TournamentSummary & {
  organizer?: {
    id: number;
    name: string;
    logo?: string;
  };
  platform?: string;
  decklists?: boolean;
  isPublic?: boolean;
  isOnline?: boolean;
  phases?: Array<{
    phase: number;
    type: string;
    rounds: number;
    mode: string;
  }>;
};

export type Pokemon = {
  id: string;
  name: string;
  item?: string | null;
  ability?: string | null;
  tera?: string | null;
};

export type Standing = {
  player: string;
  name: string;
  country?: string | null;
  decklist?: Pokemon[];
  drop?: number | null;
};

type RawStanding = {
  player?: string;
  name?: string;
  country?: string | null;
  decklist?: unknown;
  drop?: number | null;
};

type RawPokemon = {
  id?: string;
  name?: string;
  item?: string | null;
  ability?: string | null;
  tera?: string | null;
  attacks?: unknown;
};

function normalizePokemonFromApi(raw: unknown): Pokemon | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const p = raw as RawPokemon;
  if (typeof p.id !== "string" || typeof p.name !== "string") {
    return null;
  }

  return {
    id: p.id,
    name: p.name,
    item: p.item ?? null,
    ability: p.ability ?? null,
    tera: p.tera ?? null
  };
}

function normalizeDecklistFromApi(raw: unknown): Pokemon[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .map(normalizePokemonFromApi)
    .filter((p): p is Pokemon => p !== null)
    .slice(0, 6);
}

/**
 * Normalizes JSON from GET /tournaments/{id}/standings (VGC teamlists live here, not on pairings).
 */
export function parseStandingsResponse(json: unknown): Standing[] {
  if (!Array.isArray(json)) {
    return [];
  }

  const out: Standing[] = [];

  for (const row of json) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const r = row as RawStanding;
    if (typeof r.player !== "string" || typeof r.name !== "string") {
      continue;
    }

    out.push({
      player: r.player,
      name: r.name,
      country: r.country ?? null,
      decklist: normalizeDecklistFromApi(r.decklist),
      drop: r.drop ?? null
    });
  }

  return out;
}

function standingLookupKeys(playerId: string): string[] {
  const trimmed = playerId.trim();
  const keys = new Set<string>([trimmed, trimmed.toLowerCase()]);
  return [...keys];
}

/**
 * Indexes standings by player id for pairing hydration. Includes a lowercase alias so API casing differences still resolve teams from standings.
 */
export function standingsIndexByPlayer(standings: Standing[]): Map<string, Standing> {
  const map = new Map<string, Standing>();

  for (const standing of standings) {
    for (const key of standingLookupKeys(standing.player)) {
      if (!map.has(key)) {
        map.set(key, standing);
      }
    }
  }

  return map;
}

export type Pairing = {
  phase: number;
  round: number;
  table?: number;
  match?: string;
  player1?: string;
  player2?: string;
  winner?: string | number | null;
};

export type HydratedPlayer = {
  id: string;
  name: string;
  team: Pokemon[];
};

export type HydratedPairing = {
  key: string;
  phase: number;
  round: number;
  table?: number;
  match?: string;
  completed: boolean;
  player1: HydratedPlayer;
  player2?: HydratedPlayer;
};

export type PairingGroup = {
  phase: number;
  round: number;
  status: "active" | "completed" | "byes" | "empty";
  pairings: HydratedPairing[];
};

type FetchOptions = RequestInit & {
  next?: {
    revalidate?: number;
  };
};

function limitlessHeaders(): HeadersInit {
  const headers: HeadersInit = {
    accept: "application/json"
  };

  if (process.env.LIMITLESS_API_KEY) {
    headers["X-Access-Key"] = process.env.LIMITLESS_API_KEY;
  }

  return headers;
}

async function fetchJson<T>(path: string, options: FetchOptions = {}): Promise<T> {
  const response = await fetch(`${LIMITLESS_API_BASE}${path}`, {
    ...options,
    headers: {
      ...limitlessHeaders(),
      ...options.headers
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Limitless API ${path} returned ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function fetchHtml(pathOrUrl: string): Promise<string> {
  const url = pathOrUrl.startsWith("http")
    ? pathOrUrl
    : `${LIMITLESS_SITE_BASE}${pathOrUrl}`;
  const response = await fetch(url, {
    headers: {
      accept: "text/html"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Limitless page ${pathOrUrl} returned ${response.status}`);
  }

  return response.text();
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .trim();
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, "").replace(/\s+/g, " "));
}

function getMetaContent(html: string, property: string): string | undefined {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(
    `<meta\\s+(?:name|property)=["']${escaped}["'][^>]*content=["']([^"']*)["']`,
    "i"
  );
  return html.match(regex)?.[1];
}

export function extractTournamentIdsFromOngoingHtml(html: string): string[] {
  const ids = new Set<string>();
  const regex = /\/tournament\/([a-z0-9]+)\/(?:pairings|standings)/gi;
  let match = regex.exec(html);

  while (match) {
    ids.add(match[1]);
    match = regex.exec(html);
  }

  return [...ids];
}

export async function fetchActiveVgcTournamentIds(): Promise<string[]> {
  return extractTournamentIdsFromOngoingHtml(await fetchHtml(LIMITLESS_ONGOING_VGC_URL));
}

export async function fetchTournamentDetails(
  id: string
): Promise<TournamentDetails> {
  try {
    return await fetchJson<TournamentDetails>(`/tournaments/${id}/details`);
  } catch {
    return fetchPublicTournamentDetails(id);
  }
}

export async function fetchActiveVgcTournaments(): Promise<TournamentDetails[]> {
  const ids = await fetchActiveVgcTournamentIds();
  const details = await Promise.allSettled(ids.map((id) => fetchTournamentDetails(id)));

  return details
    .flatMap((result) => (result.status === "fulfilled" ? [result.value] : []))
    .filter((tournament) => tournament.game === "VGC")
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchPairings(tournamentId: string): Promise<Pairing[]> {
  try {
    return await fetchJson<Pairing[]>(`/tournaments/${tournamentId}/pairings`);
  } catch {
    return parsePublicPairingsHtml(
      await fetchHtml(`/tournament/${tournamentId}/pairings`)
    ).pairings;
  }
}

export async function fetchStandings(tournamentId: string): Promise<Standing[]> {
  try {
    const json = await fetchJson<unknown>(`/tournaments/${tournamentId}/standings`);
    return parseStandingsResponse(json);
  } catch {
    try {
      const standings = parsePublicStandingsHtml(
        await fetchHtml(`/tournament/${tournamentId}/standings`)
      );

      if (standings.length > 0) {
        return standings;
      }

      return parsePublicPairingsHtml(
        await fetchHtml(`/tournament/${tournamentId}/pairings`)
      ).standings;
    } catch {
      return [];
    }
  }
}

export function parsePublicTournamentDetailsHtml(
  id: string,
  html: string
): TournamentDetails {
  const titleName =
    html.match(/<title>(?:Pairings|Details|Standings):\s*([\s\S]*?)\s*\|\s*Limitless<\/title>/i)?.[1] ??
    html.match(/<div class="name">([\s\S]*?)<\/div>/i)?.[1] ??
    "Limitless VGC Tournament";
  const description = decodeHtml(getMetaContent(html, "description") ?? "");
  const [dateText, formatText, organizerText] = description
    .split(" - ")
    .map((part) => part.trim());
  const parsedDate = dateText ? new Date(`${dateText} UTC`) : new Date();

  return {
    id,
    game: "VGC",
    name: stripTags(titleName),
    date: Number.isNaN(parsedDate.valueOf())
      ? new Date().toISOString()
      : parsedDate.toISOString(),
    format: formatText || "VGC",
    players: 0,
    organizer: organizerText
      ? {
          id: 0,
          name: organizerText
        }
      : undefined,
    decklists: false,
    isPublic: true
  };
}

async function fetchPublicTournamentDetails(id: string): Promise<TournamentDetails> {
  return parsePublicTournamentDetailsHtml(
    id,
    await fetchHtml(`/tournament/${id}/pairings`)
  );
}

export function parsePublicPairingsHtml(html: string): {
  pairings: Pairing[];
  standings: Standing[];
} {
  const round = Number(html.match(/<table[^>]*data-round=["'](\d+)["']/i)?.[1] ?? 1);
  const rowRegex = /<tr\s+data-match=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/tr>/gi;
  const playerRegex =
    /<td\s+class=["'][^"']*\bplayer\b[^"']*["'][^>]*data-id=["']([^"']+)["'][^>]*>[\s\S]*?<div class=["']name["']>([\s\S]*?)<\/div>/gi;
  const standings = new Map<string, Standing>();
  const pairings: Pairing[] = [];
  let row = rowRegex.exec(html);

  while (row) {
    const match = row[1];
    const attributes = row[2];
    const content = row[3];
    const players: Array<{ id: string; name: string }> = [];
    const table = Number(content.match(/<td>(\d+)<\/td>/i)?.[1] ?? pairings.length + 1);
    const completed =
      attributes.includes('data-completed="1"') ||
      attributes.includes("data-completed='1'");
    const winner = attributes.match(/data-winner=["']([^"']+)["']/i)?.[1];
    playerRegex.lastIndex = 0;
    let player = playerRegex.exec(content);

    while (player) {
      const id = decodeHtml(player[1]);
      const name = stripTags(player[2]);
      players.push({ id, name });
      standings.set(id, {
        player: id,
        name,
        decklist: []
      });
      player = playerRegex.exec(content);
    }

    if (players[0]) {
      pairings.push({
        phase: 1,
        round,
        table,
        match,
        player1: players[0].id,
        player2: players[1]?.id,
        winner: completed ? winner ?? players[0].id : undefined
      });
    }

    row = rowRegex.exec(html);
  }

  return {
    pairings,
    standings: [...standings.values()]
  };
}

/**
 * Scrapes the public standings page for ongoing tournaments where the JSON standings endpoint is gated behind tournament completion. Each row exposes player id via the player profile link and the 6-mon team via `<td class="vgc-team">` entries.
 */
export function parsePublicStandingsHtml(html: string): Standing[] {
  const rowRegex = /<tr\s+data-placing=["']\d+["']([^>]*)>([\s\S]*?)<\/tr>/gi;
  const playerLinkRegex = /\/player\/([^"'/?#]+)/i;
  const teamCellRegex = /<td\s+class=["']vgc-team["'][^>]*>([\s\S]*?)<\/td>/i;
  const teamEntryRegex =
    /\/metagame\/([a-z0-9-]+)["'][^>]*data-tooltip=["']([^"']+)["']/gi;
  const standings: Standing[] = [];
  let row = rowRegex.exec(html);

  while (row) {
    const attributes = row[1];
    const content = row[2];
    const playerId = decodeHtml(content.match(playerLinkRegex)?.[1] ?? "");
    const name = decodeHtml(
      attributes.match(/data-name=["']([^"']+)["']/i)?.[1] ?? ""
    );
    const country = attributes.match(/data-country=["']([^"']+)["']/i)?.[1] ?? null;

    if (!playerId || !name) {
      row = rowRegex.exec(html);
      continue;
    }

    const teamCell = content.match(teamCellRegex)?.[1] ?? "";
    const decklist: Pokemon[] = [];
    teamEntryRegex.lastIndex = 0;
    let entry = teamEntryRegex.exec(teamCell);

    while (entry && decklist.length < 6) {
      decklist.push({
        id: entry[1],
        name: decodeHtml(entry[2]),
        item: null,
        ability: null,
        tera: null
      });
      entry = teamEntryRegex.exec(teamCell);
    }

    standings.push({
      player: playerId,
      name,
      country: country ? decodeHtml(country) : null,
      decklist
    });

    row = rowRegex.exec(html);
  }

  return standings;
}

export function makePairingKey(pairing: Pairing, index = 0): string {
  const slot = pairing.table ?? pairing.match ?? `${pairing.player1 ?? "unknown"}-vs-${pairing.player2 ?? "bye"}`;
  return `${pairing.phase}:${pairing.round}:${slot}:${index}`;
}

function hasWinner(pairing: Pairing): boolean {
  return pairing.winner !== undefined && pairing.winner !== null && pairing.winner !== "";
}

function groupSortValue(pairing: Pick<Pairing, "phase" | "round">): number {
  return pairing.round * 1000 + pairing.phase;
}

export function getLatestRelevantPairings(pairings: Pairing[]): {
  phase: number;
  round: number;
  status: PairingGroup["status"];
  pairings: Array<Pairing & { sourceIndex: number }>;
} {
  if (pairings.length === 0) {
    return {
      phase: 0,
      round: 0,
      status: "empty",
      pairings: []
    };
  }

  const indexed = pairings.map((pairing, sourceIndex) => ({
    ...pairing,
    sourceIndex
  }));
  const normal = indexed.filter((pairing) => pairing.player1 && pairing.player2);
  const unresolved = normal.filter((pairing) => !hasWinner(pairing));
  const source = unresolved.length > 0 ? unresolved : normal.length > 0 ? normal : indexed;
  const latest = source.reduce((current, pairing) =>
    groupSortValue(pairing) > groupSortValue(current) ? pairing : current
  );

  const group = source.filter(
    (pairing) => pairing.phase === latest.phase && pairing.round === latest.round
  );

  return {
    phase: latest.phase,
    round: latest.round,
    status:
      unresolved.length > 0
        ? "active"
        : normal.length > 0
          ? "completed"
          : "byes",
    pairings: group
  };
}

function resolveStandingForPlayerId(
  id: string,
  standingsByPlayer: Map<string, Standing>
): Standing | undefined {
  for (const key of standingLookupKeys(id)) {
    const found = standingsByPlayer.get(key);
    if (found) {
      return found;
    }
  }

  return undefined;
}

function resolvePlayer(
  id: string | undefined,
  standingsByPlayer: Map<string, Standing>
): HydratedPlayer | undefined {
  if (!id) {
    return undefined;
  }

  const standing = resolveStandingForPlayerId(id, standingsByPlayer);
  const teamFromStandings = (standing?.decklist ?? []).slice(0, 6);

  return {
    id,
    name: standing?.name || id,
    team: teamFromStandings
  };
}

export function hydratePairingGroup(
  pairings: Pairing[],
  standings: Standing[]
): PairingGroup {
  const standingsByPlayer = standingsIndexByPlayer(standings);
  const latest = getLatestRelevantPairings(pairings);

  return {
    phase: latest.phase,
    round: latest.round,
    status: latest.status,
    pairings: latest.pairings.flatMap((pairing) => {
      const player1 = resolvePlayer(pairing.player1, standingsByPlayer);
      if (!player1) {
        return [];
      }

      return [
        {
          key: makePairingKey(pairing, pairing.sourceIndex),
          phase: pairing.phase,
          round: pairing.round,
          table: pairing.table,
          match: pairing.match,
          completed: hasWinner(pairing),
          player1,
          player2: resolvePlayer(pairing.player2, standingsByPlayer)
        }
      ];
    })
  };
}

/**
 * Re-applies teamlists from stored standings onto a pairing group after loading from the database (Json round-trip).
 */
export function mergeTeamsIntoPairingGroup(
  group: PairingGroup,
  standings: Standing[]
): PairingGroup {
  const standingsByPlayer = standingsIndexByPlayer(standings);

  return {
    ...group,
    pairings: group.pairings.map((pairing) => ({
      ...pairing,
      player1:
        resolvePlayer(pairing.player1.id, standingsByPlayer) ?? pairing.player1,
      player2: pairing.player2
        ? resolvePlayer(pairing.player2.id, standingsByPlayer) ?? pairing.player2
        : undefined
    }))
  };
}

export async function fetchHydratedLatestPairings(
  tournamentId: string
): Promise<PairingGroup> {
  const [pairings, standings] = await Promise.all([
    fetchPairings(tournamentId),
    fetchStandings(tournamentId)
  ]);

  return hydratePairingGroup(pairings, standings);
}

export function showdownSpriteUrl(pokemonId: string): string {
  return `https://r2.limitlesstcg.net/pokemon/gen9/${pokemonId}.png`;
}
