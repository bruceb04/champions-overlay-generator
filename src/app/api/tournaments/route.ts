import { NextResponse } from "next/server";

import { fetchActiveVgcTournaments } from "@/lib/limitless";

export async function GET() {
  try {
    const tournaments = await fetchActiveVgcTournaments();
    return NextResponse.json({ tournaments });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to load tournaments."
      },
      { status: 502 }
    );
  }
}
