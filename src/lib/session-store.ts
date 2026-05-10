import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "@/lib/prisma";
import {
  parseStandingsResponse,
  type PairingGroup,
  type Standing,
  type TournamentDetails
} from "@/lib/limitless";

export type OverlaySessionRecord = {
  id: string;
  tournamentId: string;
  title: string;
  baseColor: string;
  accentColor: string;
  selectedMatchKey: string | null;
  cachedTournament: TournamentDetails;
  cachedStandings: Standing[];
  cachedPairingGroup: PairingGroup;
  createdAt: Date;
  updatedAt: Date;
};

type SessionCreateInput = {
  tournamentId: string;
  title: string;
  baseColor: string;
  accentColor: string;
  cachedTournament: TournamentDetails;
  cachedStandings: Standing[];
  cachedPairingGroup: PairingGroup;
};

type SessionUpdateInput = Partial<{
  title: string;
  baseColor: string;
  accentColor: string;
  selectedMatchKey: string | null;
  cachedTournament: TournamentDetails;
  cachedStandings: Standing[];
  cachedPairingGroup: PairingGroup;
}>;

const devStorePath = path.join(process.cwd(), "next-dev", "overlay-sessions.json");

function createId(): string {
  return randomBytes(9).toString("base64url");
}

function shouldUseFileStore(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.OVERLAY_FILE_STORE !== "0"
  );
}

function assertDatabaseConfigured(): void {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for hosted overlay sessions.");
  }
}

function toOverlaySessionRecord(record: {
  id: string;
  tournamentId: string;
  title: string;
  baseColor: string;
  accentColor: string;
  selectedMatchKey: string | null;
  cachedTournament: unknown;
  cachedStandings: unknown;
  cachedPairingGroup: unknown;
  createdAt: Date;
  updatedAt: Date;
}): OverlaySessionRecord {
  return {
    ...record,
    cachedTournament: record.cachedTournament as TournamentDetails,
    cachedStandings: parseStandingsResponse(record.cachedStandings),
    cachedPairingGroup: record.cachedPairingGroup as PairingGroup
  };
}

async function readFileStore(): Promise<Map<string, OverlaySessionRecord>> {
  try {
    const raw = await readFile(devStorePath, "utf8");
    const records = JSON.parse(raw) as Array<
      Omit<OverlaySessionRecord, "createdAt" | "updatedAt"> & {
        createdAt: string;
        updatedAt: string;
      }
    >;

    return new Map(
      records.map((record) => [
        record.id,
        {
          ...record,
          createdAt: new Date(record.createdAt),
          updatedAt: new Date(record.updatedAt)
        }
      ])
    );
  } catch {
    return new Map();
  }
}

async function writeFileStore(
  sessions: Map<string, OverlaySessionRecord>
): Promise<void> {
  await mkdir(path.dirname(devStorePath), { recursive: true });
  await writeFile(
    devStorePath,
    JSON.stringify([...sessions.values()], null, 2),
    "utf8"
  );
}

export async function createSession(
  input: SessionCreateInput
): Promise<OverlaySessionRecord> {
  const id = createId();

  if (shouldUseFileStore()) {
    const now = new Date();
    const session = {
      id,
      selectedMatchKey: null,
      createdAt: now,
      updatedAt: now,
      ...input
    };
    const sessions = await readFileStore();
    sessions.set(id, session);
    await writeFileStore(sessions);
    return session;
  }

  assertDatabaseConfigured();
  const session = await prisma.overlaySession.create({
    data: {
      id,
      ...input
    }
  });

  return toOverlaySessionRecord(session);
}

export async function getSession(
  id: string
): Promise<OverlaySessionRecord | null> {
  if (shouldUseFileStore()) {
    return (await readFileStore()).get(id) ?? null;
  }

  assertDatabaseConfigured();
  const session = await prisma.overlaySession.findUnique({
    where: {
      id
    }
  });

  return session ? toOverlaySessionRecord(session) : null;
}

export async function updateSession(
  id: string,
  input: SessionUpdateInput
): Promise<OverlaySessionRecord | null> {
  if (shouldUseFileStore()) {
    const sessions = await readFileStore();
    const existing = sessions.get(id);
    if (!existing) {
      return null;
    }

    const updated = {
      ...existing,
      ...input,
      updatedAt: new Date()
    };
    sessions.set(id, updated);
    await writeFileStore(sessions);
    return updated;
  }

  assertDatabaseConfigured();

  try {
    const session = await prisma.overlaySession.update({
      where: {
        id
      },
      data: input
    });

    return toOverlaySessionRecord(session);
  } catch {
    return null;
  }
}
