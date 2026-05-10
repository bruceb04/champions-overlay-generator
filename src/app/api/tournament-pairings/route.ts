import { NextResponse } from "next/server";

import {
  fetchHydratedLatestPairings,
  fetchTournamentDetails
} from "@/lib/limitless";

export async function GET(request: Request) {
  const id = new URL(request.url).searchParams.get("id") ?? "";

  try {
    const [tournament, group] = await Promise.all([
      fetchTournamentDetails(id),
      fetchHydratedLatestPairings(id)
    ]);

    return NextResponse.json({ tournament, group });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load pairings."
      },
      { status: 502 }
    );
  }
}
