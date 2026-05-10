"use client";

import { useEffect, useState } from "react";

import {
  showdownSpriteUrl,
  type HydratedPairing,
  type Pokemon
} from "@/lib/limitless";

type SessionRecord = {
  title: string;
  baseColor: string;
  accentColor: string;
  selectedMatchKey: string | null;
};

type OverlayPayload = {
  session: SessionRecord;
  group: {
    pairings: HydratedPairing[];
  };
  selectedPairing: HydratedPairing | null;
};

const LIVE_STATE_PREFIX = "vgc_overlay_live_";
const SESSION_POLL_MS = 2000;

function isHexColor(value: string | null): value is string {
  return Boolean(value && /^#[0-9a-f]{6}$/i.test(value));
}

function readLiveState(id: string) {
  try {
    const raw = window.localStorage.getItem(`${LIVE_STATE_PREFIX}${id}`);
    return raw
      ? (JSON.parse(raw) as {
          title?: string;
          baseColor?: string;
          accentColor?: string;
          selectedMatchKey?: string | null;
        })
      : {};
  } catch {
    return {};
  }
}

function applyLiveState(id: string, data: OverlayPayload): OverlayPayload {
  const liveState = readLiveState(id);
  const selectedMatchKey =
    liveState.selectedMatchKey === undefined
      ? data.session.selectedMatchKey
      : liveState.selectedMatchKey;
  const liveBaseColor = liveState.baseColor ?? null;
  const liveAccentColor = liveState.accentColor ?? null;

  return {
    ...data,
    session: {
      ...data.session,
      title: liveState.title ?? data.session.title,
      baseColor: isHexColor(liveBaseColor)
        ? liveBaseColor
        : data.session.baseColor,
      accentColor: isHexColor(liveAccentColor)
        ? liveAccentColor
        : data.session.accentColor,
      selectedMatchKey
    },
    selectedPairing:
      data.group.pairings.find((pairing) => pairing.key === selectedMatchKey) ??
      null
  };
}

function PokemonSlot({ pokemon }: { pokemon?: Pokemon }) {
  const [failed, setFailed] = useState(false);

  if (!pokemon) {
    return <div className="pokemonSlot placeholder" />;
  }

  if (failed) {
    return <div className="pokemonSlot fallback">{pokemon.name}</div>;
  }

  return (
    <div className="pokemonSlot">
      <img
        src={showdownSpriteUrl(pokemon.id)}
        alt={pokemon.name}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function PlayerSide({
  side,
  player
}: {
  side: "left" | "right";
  player?: HydratedPairing["player1"];
}) {
  const team = player?.team ?? [];

  return (
    <section className={`overlayPlayer ${side}`}>
      <div className="playerName">{player?.name ?? "Player"}</div>
      <div className="teamRow">
        {Array.from({ length: 6 }, (_, index) => (
          <PokemonSlot key={index} pokemon={team[index]} />
        ))}
      </div>
    </section>
  );
}

export function OverlayClient({ id }: { id: string }) {
  const [payload, setPayload] = useState<OverlayPayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!id) {
        setError("Overlay session id is missing.");
        return;
      }

      try {
        const response = await fetch(`/api/session?id=${encodeURIComponent(id)}`, {
          cache: "no-store"
        });
        const data = (await response.json()) as OverlayPayload & { error?: string };

        if (!response.ok) {
          throw new Error(data.error ?? "Overlay session unavailable.");
        }

        if (!cancelled) {
          setPayload(applyLiveState(id, data));
          setError("");
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(requestError instanceof Error ? requestError.message : "Overlay session unavailable.");
        }
      }
    }

    load();
    const poll = window.setInterval(() => {
      if (!cancelled) {
        load();
      }
    }, SESSION_POLL_MS);

    function handleStorage(event: StorageEvent) {
      if (event.key !== `${LIVE_STATE_PREFIX}${id}`) {
        return;
      }

      setPayload((current) => (current ? applyLiveState(id, current) : current));
    }

    window.addEventListener("storage", handleStorage);
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.removeEventListener("storage", handleStorage);
    };
  }, [id]);

  const session = payload?.session;
  const pairing = payload?.selectedPairing;

  return (
    <main
      className="overlayStage"
      style={
        {
          "--base-color": session?.baseColor ?? "#111827",
          "--accent-color": session?.accentColor ?? "#38bdf8"
        } as React.CSSProperties
      }
    >
      {error ? <div className="overlayError">{error}</div> : null}
      <header className="overlayTitle">{session?.title ?? "Tournament"}</header>
      <PlayerSide side="left" player={pairing?.player1} />
      <PlayerSide side="right" player={pairing?.player2} />
    </main>
  );
}
