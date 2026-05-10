import { NextResponse } from "next/server";

import {
  fetchPairings,
  fetchStandings,
  fetchTournamentDetails,
  hydratePairingGroup,
  mergeTeamsIntoPairingGroup
} from "@/lib/limitless";
import { createSession } from "@/lib/session-store";
import { isHexColor, sanitizeTitle } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const tournamentId = typeof body.tournamentId === "string" ? body.tournamentId : "";

    if (!tournamentId) {
      return NextResponse.json({ error: "Tournament is required." }, { status: 400 });
    }

    if (!isHexColor(body.baseColor) || !isHexColor(body.accentColor)) {
      return NextResponse.json({ error: "Valid colors are required." }, { status: 400 });
    }

    const [tournament, pairings, standings] = await Promise.all([
      fetchTournamentDetails(tournamentId),
      fetchPairings(tournamentId),
      fetchStandings(tournamentId)
    ]);
    if (tournament.game !== "VGC") {
      return NextResponse.json({ error: "Only VGC tournaments are supported." }, { status: 400 });
    }

    const initialGroup = hydratePairingGroup(pairings, standings);
    const session = await createSession({
      tournamentId,
      title: sanitizeTitle(body.title, tournament.name),
      baseColor: body.baseColor,
      accentColor: body.accentColor,
      cachedTournament: tournament,
      cachedStandings: standings,
      cachedPairingGroup: initialGroup
    });
    const group = mergeTeamsIntoPairingGroup(
      session.cachedPairingGroup,
      session.cachedStandings
    );
    const overlayUrl = new URL(`/overlay?id=${session.id}`, request.url).toString();

    return NextResponse.json(
      {
        session: {
          ...session,
          cachedPairingGroup: group,
          cachedStandings: session.cachedStandings
        },
        tournament,
        group,
        selectedPairing: null,
        overlayUrl
      },
      { status: 201 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to create overlay session."
      },
      { status: 500 }
    );
  }
}
