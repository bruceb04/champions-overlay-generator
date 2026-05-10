"use client";

import { useEffect, useMemo, useState } from "react";

import type {
  HydratedPairing,
  PairingGroup,
  TournamentDetails
} from "@/lib/limitless";

type SessionRecord = {
  id: string;
  tournamentId: string;
  title: string;
  baseColor: string;
  accentColor: string;
  selectedMatchKey: string | null;
};

type SessionPayload = {
  session: SessionRecord;
  tournament: TournamentDetails;
  group: PairingGroup;
  selectedPairing: HydratedPairing | null;
  overlayUrl: string;
};

const DEFAULT_BASE_COLOR = "#111827";
const DEFAULT_ACCENT_COLOR = "#38bdf8";
const STATE_COOKIE = "vgc_overlay_state";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30;
const LIVE_STATE_PREFIX = "vgc_overlay_live_";

type SavedControlState = {
  tournamentId?: string;
  sessionId?: string;
  title?: string;
  baseColor?: string;
  accentColor?: string;
  selectedMatchKey?: string | null;
};

async function readJson<T>(response: Response): Promise<T> {
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? "Request failed.");
  }

  return body;
}

function readSavedState(): SavedControlState {
  if (typeof document === "undefined") {
    return {};
  }

  const cookie = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${STATE_COOKIE}=`));

  if (!cookie) {
    return {};
  }

  try {
    return JSON.parse(decodeURIComponent(cookie.split("=")[1])) as SavedControlState;
  } catch {
    return {};
  }
}

function writeSavedState(state: SavedControlState) {
  if (typeof document === "undefined") {
    return;
  }

  document.cookie = `${STATE_COOKIE}=${encodeURIComponent(
    JSON.stringify(state)
  )}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
}

function withLocalState(
  payload: SessionPayload,
  state: SavedControlState
): SessionPayload {
  const selectedMatchKey =
    state.selectedMatchKey === undefined
      ? payload.session.selectedMatchKey
      : state.selectedMatchKey;

  return {
    ...payload,
    session: {
      ...payload.session,
      title: state.title ?? payload.session.title,
      baseColor: state.baseColor ?? payload.session.baseColor,
      accentColor: state.accentColor ?? payload.session.accentColor,
      selectedMatchKey
    },
    selectedPairing:
      payload.group.pairings.find((pairing) => pairing.key === selectedMatchKey) ??
      null
  };
}

function overlayUrlWithState(
  payload: SessionPayload | null
): string {
  if (!payload) {
    return "";
  }

  return payload.overlayUrl;
}

function publishOverlayState(
  sessionId: string | undefined,
  state: {
    title: string;
    baseColor: string;
    accentColor: string;
    selectedMatchKey: string | null;
  }
) {
  if (!sessionId || typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    `${LIVE_STATE_PREFIX}${sessionId}`,
    JSON.stringify(state)
  );
}

export default function Home() {
  const [tournaments, setTournaments] = useState<TournamentDetails[]>([]);
  const [selectedTournamentId, setSelectedTournamentId] = useState("");
  const [title, setTitle] = useState("");
  const [baseColor, setBaseColor] = useState(DEFAULT_BASE_COLOR);
  const [accentColor, setAccentColor] = useState(DEFAULT_ACCENT_COLOR);
  const [pairingGroup, setPairingGroup] = useState<PairingGroup | null>(null);
  const [sessionPayload, setSessionPayload] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState("Loading active VGC tournaments...");
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState("");

  const selectedTournament = useMemo(
    () => tournaments.find((tournament) => tournament.id === selectedTournamentId),
    [selectedTournamentId, tournaments]
  );

  useEffect(() => {
    let mounted = true;

    async function loadTournaments() {
      try {
        const savedState = readSavedState();
        const data = await readJson<{ tournaments: TournamentDetails[] }>(
          await fetch("/api/tournaments")
        );
        if (!mounted) {
          return;
        }

        setTournaments(data.tournaments);

        if (savedState.sessionId) {
          try {
            const restored = await readJson<SessionPayload>(
              await fetch(`/api/session?id=${encodeURIComponent(savedState.sessionId)}`)
            );

            if (!mounted) {
              return;
            }

            const localPayload = withLocalState(restored, savedState);
            setSessionPayload(localPayload);
            setPairingGroup(localPayload.group);
            setSelectedTournamentId(localPayload.session.tournamentId);
            setTitle(localPayload.session.title);
            setBaseColor(localPayload.session.baseColor);
            setAccentColor(localPayload.session.accentColor);
            setLoading("");
            return;
          } catch {
            writeSavedState({
              tournamentId: savedState.tournamentId
            });
          }
        }

        const savedTournament = data.tournaments.find(
          (tournament) => tournament.id === savedState.tournamentId
        );
        const first = savedTournament ?? data.tournaments[0];
        if (first) {
          setSelectedTournamentId(first.id);
          setTitle(first.name);
          writeSavedState({ tournamentId: first.id });
        }
        setLoading("");
      } catch (requestError) {
        if (mounted) {
          setError(requestError instanceof Error ? requestError.message : "Unable to load tournaments.");
          setLoading("");
        }
      }
    }

    loadTournaments();
    return () => {
      mounted = false;
    };
  }, []);

  function selectTournament(id: string) {
    setSelectedTournamentId(id);
    const tournament = tournaments.find((item) => item.id === id);
    setTitle(tournament?.name ?? "");
    setPairingGroup(null);
    setSessionPayload(null);
    setCopyState("");
    writeSavedState({ tournamentId: id });
  }

  function saveLocalState(update: SavedControlState = {}) {
    writeSavedState({
      tournamentId: selectedTournamentId,
      sessionId: sessionPayload?.session.id,
      title,
      baseColor,
      accentColor,
      selectedMatchKey: sessionPayload?.session.selectedMatchKey ?? null,
      ...update
    });
    publishOverlayState(update.sessionId ?? sessionPayload?.session.id, {
      title: update.title ?? title,
      baseColor: update.baseColor ?? baseColor,
      accentColor: update.accentColor ?? accentColor,
      selectedMatchKey:
        update.selectedMatchKey === undefined
          ? sessionPayload?.session.selectedMatchKey ?? null
          : update.selectedMatchKey
    });
  }

  function changeTournament() {
    const tournament = tournaments.find((item) => item.id === selectedTournamentId);
    setSessionPayload(null);
    setPairingGroup(null);
    setTitle(tournament?.name ?? "");
    setCopyState("");
    writeSavedState({ tournamentId: selectedTournamentId });
  }

  async function refreshPairings(tournamentId = selectedTournamentId) {
    if (!tournamentId) {
      return;
    }

    setLoading("Refreshing pairings...");
    setError("");

    try {
      const data = await readJson<{ group: PairingGroup }>(
        await fetch(`/api/tournament-pairings?id=${encodeURIComponent(tournamentId)}`)
      );
      setPairingGroup(data.group);
      setLoading("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to refresh pairings.");
      setLoading("");
    }
  }

  async function createOverlay() {
    if (!selectedTournamentId) {
      return;
    }

    setLoading("Creating overlay session...");
    setError("");

    try {
      const data = await readJson<SessionPayload>(
        await fetch("/api/sessions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            tournamentId: selectedTournamentId,
            title,
            baseColor,
            accentColor
          })
        })
      );

      setSessionPayload(data);
      setPairingGroup(data.group);
      writeSavedState({
        tournamentId: data.session.tournamentId,
        sessionId: data.session.id,
        title: data.session.title,
        baseColor: data.session.baseColor,
        accentColor: data.session.accentColor,
        selectedMatchKey: null
      });
      publishOverlayState(data.session.id, {
        title: data.session.title,
        baseColor: data.session.baseColor,
        accentColor: data.session.accentColor,
        selectedMatchKey: null
      });
      setLoading("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create overlay.");
      setLoading("");
    }
  }

  async function applyOverlayChanges() {
    if (!sessionPayload) {
      return;
    }

    setError("");
    try {
      const data = await readJson<SessionPayload>(
        await fetch(`/api/session?id=${encodeURIComponent(sessionPayload.session.id)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            title,
            baseColor,
            accentColor
          })
        })
      );

      const selectedPairing =
        data.group.pairings.find((pairing) => pairing.key === data.session.selectedMatchKey) ??
        null;

      setSessionPayload({
        ...data,
        session: {
          ...data.session,
          title,
          baseColor,
          accentColor
        },
        selectedPairing
      });
      setPairingGroup(data.group);
      saveLocalState({ title, baseColor, accentColor });
      publishOverlayState(sessionPayload.session.id, {
        title,
        baseColor,
        accentColor,
        selectedMatchKey: data.session.selectedMatchKey
      });
      setCopyState("URL updated");
      window.setTimeout(() => setCopyState(""), 1600);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save overlay.");
    }
  }

  async function selectPairing(pairing: HydratedPairing) {
    if (!sessionPayload) {
      return;
    }

    setError("");
    try {
      const data = await readJson<SessionPayload>(
        await fetch(`/api/session?id=${encodeURIComponent(sessionPayload.session.id)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            selectedMatchKey: pairing.key
          })
        })
      );

      const selectedPairing =
        data.group.pairings.find((p) => p.key === data.session.selectedMatchKey) ?? null;

      setSessionPayload({
        ...data,
        session: {
          ...data.session,
          title,
          baseColor,
          accentColor,
          selectedMatchKey: data.session.selectedMatchKey
        },
        selectedPairing
      });
      setPairingGroup(data.group);
      publishOverlayState(data.session.id, {
        title,
        baseColor,
        accentColor,
        selectedMatchKey: data.session.selectedMatchKey
      });
      writeSavedState({
        tournamentId: data.session.tournamentId,
        sessionId: data.session.id,
        title,
        baseColor,
        accentColor,
        selectedMatchKey: data.session.selectedMatchKey
      });
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to save match selection.");
    }
  }

  async function refreshSessionPairings() {
    if (!sessionPayload) {
      await refreshPairings();
      return;
    }

    setLoading("Reloading overlay pairings...");
    setError("");

    try {
      const data = await readJson<SessionPayload>(
        await fetch(`/api/session?id=${encodeURIComponent(sessionPayload.session.id)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            refreshPairings: true
          })
        })
      );
      const selectedMatchKey = data.group.pairings.some(
        (pairing) => pairing.key === sessionPayload.session.selectedMatchKey
      )
        ? sessionPayload.session.selectedMatchKey
        : null;
      const selectedPairing =
        data.group.pairings.find((pairing) => pairing.key === selectedMatchKey) ??
        null;
      const nextPayload = {
        ...data,
        session: {
          ...data.session,
          title,
          baseColor,
          accentColor,
          selectedMatchKey
        },
        selectedPairing
      };

      setSessionPayload(nextPayload);
      setPairingGroup(nextPayload.group);
      writeSavedState({
        tournamentId: nextPayload.session.tournamentId,
        sessionId: nextPayload.session.id,
        title,
        baseColor,
        accentColor,
        selectedMatchKey
      });
      publishOverlayState(nextPayload.session.id, {
        title,
        baseColor,
        accentColor,
        selectedMatchKey
      });
      setLoading("");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to reload overlay.");
      setLoading("");
    }
  }

  async function copyOverlayUrl() {
    const url = overlayUrlWithState(sessionPayload);
    if (!url) {
      return;
    }

    await navigator.clipboard.writeText(url);
    setCopyState("Copied");
    window.setTimeout(() => setCopyState(""), 1600);
  }

  const activeGroup = sessionPayload?.group ?? pairingGroup;
  const overlayCreated = Boolean(sessionPayload);
  const currentOverlayUrl = overlayUrlWithState(sessionPayload);
  const selectedTeamCount =
    (sessionPayload?.selectedPairing?.player1.team.length ?? 0) +
    (sessionPayload?.selectedPairing?.player2?.team.length ?? 0);

  return (
    <main className="controlPage">
      <section className="controlShell">
        <div className="topBar">
          <div>
            <p className="eyebrow">Limitless VGC</p>
            <h1>OBS overlay generator</h1>
          </div>
          <div className="statusPill">{loading || "Ready"}</div>
        </div>

        {error ? <div className="alert">{error}</div> : null}

        <div className="workspaceGrid">
          <section className="panel setupPanel">
            <h2>Overlay setup</h2>

            <label className="field">
              <span>Tournament</span>
              <select
                value={selectedTournamentId}
                onChange={(event) => selectTournament(event.target.value)}
                disabled={overlayCreated || tournaments.length === 0}
              >
                {tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Overlay title</span>
              <input
                value={title}
                maxLength={96}
                onChange={(event) => {
                  setTitle(event.target.value);
                  saveLocalState({ title: event.target.value });
                }}
                placeholder={selectedTournament?.name ?? "Tournament title"}
              />
            </label>

            <div className="colorGrid">
              <label className="field">
                <span>Base</span>
                <input
                  type="color"
                  value={baseColor}
                  onChange={(event) => {
                    setBaseColor(event.target.value);
                    saveLocalState({ baseColor: event.target.value });
                  }}
                />
              </label>
              <label className="field">
                <span>Accent</span>
                <input
                  type="color"
                  value={accentColor}
                  onChange={(event) => {
                    setAccentColor(event.target.value);
                    saveLocalState({ accentColor: event.target.value });
                  }}
                />
              </label>
            </div>

            <div className="buttonRow">
              {!overlayCreated ? (
                <button
                  className="primaryButton"
                  onClick={createOverlay}
                  disabled={!selectedTournamentId || Boolean(loading)}
                >
                  Create OBS link
                </button>
              ) : (
                <>
                  <button
                    className="primaryButton"
                    onClick={applyOverlayChanges}
                    disabled={Boolean(loading)}
                  >
                    Apply changes
                  </button>
                  <button className="secondaryButton" onClick={copyOverlayUrl}>
                    {copyState || "Copy OBS URL"}
                  </button>
                  <button className="secondaryButton" onClick={changeTournament}>
                    Change tournament
                  </button>
                </>
              )}
            </div>

            {sessionPayload ? (
              <div className="urlBox">
                <div className="urlBoxHeader">
                  <span>Browser source URL</span>
                  <button
                    type="button"
                    className="secondaryButton urlCopyButton"
                    onClick={() => void copyOverlayUrl()}
                    disabled={!currentOverlayUrl || Boolean(loading)}
                  >
                    {copyState === "Copied" ? "Copied" : "Copy URL"}
                  </button>
                </div>
                <code>{currentOverlayUrl}</code>
                {selectedTeamCount === 0 ? (
                  <p className="urlHint">
                    This tournament is not exposing teamlists yet, so sprite slots will stay empty until team data is available.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>

          <section className="panel pairingsPanel">
            <div className="panelHeader">
              <div>
                <h2>Active pairings</h2>
                {activeGroup ? (
                  <p>
                    Phase {activeGroup.phase}, Round {activeGroup.round} - {activeGroup.status}
                  </p>
                ) : (
                  <p>Select a tournament and load its current round.</p>
                )}
              </div>
              <button
                className="secondaryButton"
                onClick={refreshSessionPairings}
                disabled={!selectedTournamentId || Boolean(loading)}
              >
                Refresh
              </button>
            </div>

            <div className="pairingList">
              {activeGroup?.pairings.map((pairing) => {
                const selected = pairing.key === sessionPayload?.session.selectedMatchKey;

                return (
                  <button
                    key={pairing.key}
                    className={`pairingCard ${selected ? "selected" : ""}`}
                    disabled={!sessionPayload || !pairing.player2}
                    onClick={() => selectPairing(pairing)}
                  >
                    <span className="pairingMeta">
                      {pairing.table ? `Table ${pairing.table}` : pairing.match ?? "Match"}
                    </span>
                    <strong>
                      {pairing.player1.name}
                      <span>vs</span>
                      {pairing.player2?.name ?? "Bye"}
                    </strong>
                    <small>{pairing.completed ? "Completed" : "Current"}</small>
                  </button>
                );
              })}

              {activeGroup && activeGroup.pairings.length === 0 ? (
                <div className="emptyState">No pairings are available yet.</div>
              ) : null}
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
