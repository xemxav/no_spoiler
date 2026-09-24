# Deploying the backend to Railway

The backend runs two ways: the local sandbox (`sandbox up`, one worktree per port)
and a deployed Railway service reachable from any browser.

> **`/judge` is unauthenticated.** There is no token, no allowlist, nothing: anyone
> who finds the deployed URL can POST to it and spend your `TYPESAFE_API_KEY`. A
> shared secret was deliberately dropped rather than shipped, because the extension
> is built client-side — any token would sit in plaintext in `dist/background.js`
> for every install to read, which is the appearance of protection and not the
> thing itself. Treat the deployed URL as a secret, watch your TypeSafe usage, and
> put real access control in front of it before this goes anywhere public.
>
> Locally this is contained: the sandbox binds `127.0.0.1` by default, so an
> unauthenticated `/judge` is reachable from your machine only. Setting
> `HOST=0.0.0.0` anywhere other than a deployed container hands that same open
> endpoint to everyone on your network.

## What the repo already provides

| File                             | What it sets                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------- |
| `railway.json`                   | `build.buildCommand` = `pnpm build`, `deploy.startCommand` = `pnpm start`          |
| `package.json` (root)            | `start` → `pnpm --filter @no-spoiler/backend start`                                |
| `packages/backend/package.json`  | `start` → `node dist/index.js`                                                     |

`pnpm build` runs Turborepo, which builds `@no-spoiler/shared` before
`@no-spoiler/backend` (`build` dependsOn `^build`), so the backend's compiled
`dist/` exists by the time the start command runs. Nothing else in the monorepo is
needed at runtime.

## Prerequisites

- A Railway account (<https://railway.com>).
- The repo pushed to GitHub (`xemxav/no_spoiler`) if you want Railway to build from
  the repo; not needed if you deploy from your machine with the CLI.
- Optional CLI: `npm i -g @railway/cli`, then `railway login`.
- A TypeSafe API key (same one the local sandbox uses in `.env`).

Everything below can be done either in the dashboard or with the CLI; pick one.

## 1. Create the project and service

Dashboard: **New Project → Deploy from GitHub repo → `xemxav/no_spoiler`**. Railway
creates a service, detects pnpm from `pnpm-lock.yaml` / the `packageManager` field,
and picks up `railway.json` for the build and start commands.

CLI, from the repo root: `railway init` (creates the project), then `railway up`
(uploads and builds the current directory).

Monorepo settings that matter:

- **Root Directory**: leave it at the repository root (`/`). The build is a pnpm
  workspace install plus a Turborepo build; pointing the service at
  `packages/backend` would break the workspace link to `@no-spoiler/shared`.
- **Build Command / Start Command**: leave them empty in the UI so `railway.json`
  applies (`pnpm build` / `pnpm start`). If you do set them in the UI, use the same
  two commands.
- The backend requires Node >= 20 (`engines` in the root `package.json`).

## 2. Set the environment variables

Dashboard: service → **Variables**. CLI: `railway variables --set KEY=value`.

| Variable            | Required                    | What it is                                                                                                          |
| ------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `TYPESAFE_API_KEY`  | Yes                         | Credential the TypeSafe SDK reads to answer `/judge`. Without it every judgement fails with 502.                      |
| `HOST`              | **Yes** — set `0.0.0.0`     | The interface the server binds. It defaults to `127.0.0.1` so a local sandbox stays off the LAN; a container that binds loopback is unreachable, so a deploy without this answers nothing. |
| `PORT`              | No — **do not set it**      | Railway injects it; the server binds `process.env.PORT`, falling back to `3210` only when nothing is set. |

## 3. Get the deployed URL

Dashboard: service → **Settings → Networking → Generate Domain**. CLI:
`railway domain`. Either way you get a URL like
`https://no-spoiler-production.up.railway.app`.

## 4. Point the extension at it

The extension's backend URL is injected at build time by esbuild `--define`, from
the `BACKEND_URL` environment variable read by the extension's `build`/`dev`
scripts. No source change is needed:

```sh
BACKEND_URL=https://no-spoiler-production.up.railway.app \
pnpm --filter @no-spoiler/extension build
```

Then load `packages/extension/dist/` as an unpacked extension. A `BACKEND_URL` set
in the shell always wins. Unset, the build reads `BACKEND_URL` from the `.env` at
the worktree root, which `sandbox prepare` writes, so a sandbox on any port
(`pnpm build`, or the watch build `sandbox up` starts) targets its own backend
with nothing passed by hand. With no `.env` either, it falls back to
`http://localhost:3210`. For a localhost address, `dist/manifest.json` grants
that one origin in place of the source manifest's `http://localhost:3210/*`.

`manifest.json` already lists `https://*.up.railway.app/*` in `host_permissions`,
so a generated Railway domain works as-is. **A custom domain must be added to
`host_permissions` manually**, or the service worker's `fetch` is blocked.

## 5. Verify the deploy

```sh
URL=https://no-spoiler-production.up.railway.app
BODY='{"watchlist":["Lakers vs Celtics"],"tweets":[{"id":"1","author":"a","text":"Lakers win 110-100"}]}'

# -> 200 {"results":{"1":true}}
curl -i -X POST "$URL/judge" -H 'Content-Type: application/json' -d "$BODY"
```

A 502 `{"error":"Failed to judge tweets"}` means the request reached the service
but the TypeSafe call failed — check `TYPESAFE_API_KEY`.

## Local sandbox vs deployed

| | Local sandbox | Railway |
| --- | --- | --- |
| Config source | `.env` at the worktree root, generated by `sandbox prepare` from `.env.example` | Variables you set on the service, already in `process.env` |
| `PORT` | Allocated per worktree by `sandbox prepare` | Injected by Railway |
| `HOST` | `127.0.0.1` from `.env` — reachable from this machine only | Must be set to `0.0.0.0`, or the container answers nothing |
| Auth | None | None — the URL is the only thing keeping strangers out |
| Run command | `sandbox up` → `pnpm dev` (tsx watch) | `pnpm start` → `node dist/index.js` |

`.env` loading (`packages/backend/src/index.ts`): the process asks git for the
worktree root and loads `<worktree root>/.env` **if both the git checkout and the
file exist**. On Railway neither does — there is no git checkout and no `.env` — so
that step is skipped silently and the platform's own variables are used as-is.
