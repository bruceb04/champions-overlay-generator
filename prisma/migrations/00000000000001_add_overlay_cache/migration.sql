ALTER TABLE "OverlaySession"
ADD COLUMN "cachedTournament" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN "cachedStandings" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN "cachedPairingGroup" JSONB NOT NULL DEFAULT '{"phase":0,"round":0,"status":"empty","pairings":[]}';
