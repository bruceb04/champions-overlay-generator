# VGC OBS Overlay Generator

A hosted Next.js app for creating stable OBS browser-source links for active Pokemon VGC tournaments on Limitless.

## What It Does

- Loads active VGC tournaments from the Limitless ongoing tournament page.
- Uses the documented Limitless tournament API for details, pairings, and standings.
- Creates public overlay sessions backed by PostgreSQL through Prisma.
- Lets a producer update title, colors, and selected pairing from the control page.
- Keeps OBS on one stable `/overlay?id={id}` URL that polls for updates every 2 seconds.

## Local Development

```bash
npm install
npm run dev
```

Local development uses a `next-dev` JSON session store by default so OBS links work without a database. Set `OVERLAY_FILE_STORE=0` to test against PostgreSQL locally. Hosted production requires PostgreSQL.

## Prisma & PostgreSQL setup

The app uses **Prisma** with **PostgreSQL**. Sessions are stored in the `OverlaySession` table (`prisma/schema.prisma`).

### 1. Database URL

Copy the example env file and set your connection string:

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection URL (required for hosted/production and for local testing with `OVERLAY_FILE_STORE=0`) |
| `LIMITLESS_API_KEY` | Optional; raises Limitless API limits when set |

Example:

```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/vgc_overlay?schema=public"
```

Use `sslmode=require` (or your provider’s TLS params) if the database requires SSL.

### 2. Install dependencies & generate the client

```bash
npm install
npm run db:generate
```

`npm run build` already runs `prisma generate`; running `db:generate` after cloning ensures `@prisma/client` matches `schema.prisma` before the first build.

### 3. Apply migrations

**Production / staging / any environment that should match committed migrations:**

```bash
npm run db:migrate
```

(`db:migrate` runs `prisma migrate deploy`.)

**Local development** when you change `schema.prisma` and need a new migration:

```bash
npm run db:migrate:dev
```

That creates a migration under `prisma/migrations/` and applies it. Commit those SQL files with your schema changes.

### 4. Run the app against PostgreSQL

Default dev mode uses the file-based session store. To use PostgreSQL locally:

**cmd.exe**

```bat
set OVERLAY_FILE_STORE=0
npm run dev
```

**PowerShell**

```powershell
$env:OVERLAY_FILE_STORE = "0"; npm run dev
```

**macOS / Linux**

```bash
OVERLAY_FILE_STORE=0 npm run dev
```

### 5. Inspect data (optional)

```bash
npm run db:studio
```

Opens Prisma Studio against `DATABASE_URL`.

## Hosted Setup

1. Provision a PostgreSQL database.
2. Set `DATABASE_URL` in the hosting environment (and optional `LIMITLESS_API_KEY`).
3. Run `npm run db:migrate` (or `npm run build`, which runs `prisma generate`; migrations must still be applied once per deploy).
4. Deploy the Next.js app with `OVERLAY_FILE_STORE` unset (or not `0`), so production uses PostgreSQL and not the dev file store.

## Scripts

```bash
npm run dev
npm run lint
npm run test
npm run build
npm run db:generate      # prisma generate
npm run db:migrate       # prisma migrate deploy (production / CI)
npm run db:migrate:dev   # prisma migrate dev (local schema changes)
npm run db:studio        # Prisma Studio
```

`npm run build` uses Next's webpack builder because Turbopack currently hits a Windows junction issue with Prisma on this workspace drive.
