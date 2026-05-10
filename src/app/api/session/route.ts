import { NextResponse } from "next/server";

import {
  fetchPairings,
  fetchStandings,
  hydratePairingGroup,
  type Standing
} from "@/lib/limitless";
import { publishSession } from "@/lib/session-bus";
import { loadSessionPayload } from "@/lib/session-payload";
import { getSession, updateSession } from "@/lib/session-store";
import {
  isHexColor,
  sanitizeMatchKey,
  sanitizeTitle
} from "@/lib/validation";

function getId(request: Request): string {
  return new URL(request.url).searchParams.get("id") ?? "";
}

export async function GET(request: Request) {
  const id = getId(request);

  try {
    const payload = await loadSessionPayload(id, request.url);
    if (!payload) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load overlay session."
      },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  const id = getId(request);

  try {
    const existing = await getSession(id);
    if (!existing) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const selectedMatchKey = sanitizeMatchKey(body.selectedMatchKey);
    const data: {
      title?: string;
      baseColor?: string;
      accentColor?: string;
      selectedMatchKey?: string | null;
      cachedStandings?: Standing[];
      cachedPairingGroup?: typeof existing.cachedPairingGroup;
    } = {};

    if (body.title !== undefined) {
      data.title = sanitizeTitle(body.title, existing.title);
    }

    if (body.baseColor !== undefined) {
      if (!isHexColor(body.baseColor)) {
        return NextResponse.json({ error: "Base color is invalid." }, { status: 400 });
      }
      data.baseColor = body.baseColor;
    }

    if (body.accentColor !== undefined) {
      if (!isHexColor(body.accentColor)) {
        return NextResponse.json({ error: "Accent color is invalid." }, { status: 400 });
      }
      data.accentColor = body.accentColor;
    }

    if (body.selectedMatchKey !== undefined) {
      if (selectedMatchKey === undefined) {
        return NextResponse.json({ error: "Selected match key is invalid." }, { status: 400 });
      }

      data.selectedMatchKey = selectedMatchKey;
    }

    if (body.refreshPairings === true) {
      const [pairings, standings] = await Promise.all([
        fetchPairings(existing.tournamentId),
        fetchStandings(existing.tournamentId)
      ]);
      data.cachedStandings = standings;
      data.cachedPairingGroup = hydratePairingGroup(pairings, standings);

      if (
        existing.selectedMatchKey &&
        !data.cachedPairingGroup.pairings.some(
          (pairing) => pairing.key === existing.selectedMatchKey
        )
      ) {
        data.selectedMatchKey = null;
      }
    }

    const updated = await updateSession(id, data);
    if (!updated) {
      return NextResponse.json({ error: "Session not found." }, { status: 404 });
    }

    const payload = await loadSessionPayload(id, request.url);
    if (payload) {
      publishSession(id, payload);
    }
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to update overlay session."
      },
      { status: 500 }
    );
  }
}
