CREATE TABLE "OverlaySession" (
    "id" TEXT NOT NULL,
    "tournamentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "baseColor" TEXT NOT NULL,
    "accentColor" TEXT NOT NULL,
    "selectedMatchKey" TEXT,
    "cachedTournament" JSONB NOT NULL DEFAULT '{}',
    "cachedStandings" JSONB NOT NULL DEFAULT '[]',
    "cachedPairingGroup" JSONB NOT NULL DEFAULT '{"phase":0,"round":0,"status":"empty","pairings":[]}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OverlaySession_pkey" PRIMARY KEY ("id")
);
