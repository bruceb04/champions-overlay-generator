import {
  mergeTeamsIntoPairingGroup,
  type HydratedPairing,
  type PairingGroup,
  type Standing,
  type TournamentDetails
} from "@/lib/limitless";
import { getSession, type OverlaySessionRecord } from "@/lib/session-store";

export type SessionPayload = {
  session: Omit<OverlaySessionRecord, "cachedPairingGroup" | "cachedStandings"> & {
    cachedPairingGroup: PairingGroup;
    cachedStandings: Standing[];
  };
  tournament: TournamentDetails;
  group: PairingGroup;
  selectedPairing: HydratedPairing | null;
  overlayUrl: string;
};

export async function loadSessionPayload(
  id: string,
  requestUrl: string
): Promise<SessionPayload | null> {
  const session = await getSession(id);
  if (!session) {
    return null;
  }

  const tournament = session.cachedTournament;
  const group = mergeTeamsIntoPairingGroup(
    session.cachedPairingGroup,
    session.cachedStandings
  );
  const selectedPairing =
    group.pairings.find((pairing) => pairing.key === session.selectedMatchKey) ??
    null;

  return {
    session: {
      ...session,
      cachedPairingGroup: group,
      cachedStandings: session.cachedStandings
    },
    tournament,
    group,
    selectedPairing,
    overlayUrl: new URL(`/overlay?id=${session.id}`, requestUrl).toString()
  };
}
