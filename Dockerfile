# Two-stage build — see docs/deployment-specifikacio.md §5. The `build`
# stage needs every devDependency (tsc/vite/prisma generate); the `runtime`
# stage only needs production deps, since the server runs straight from
# source via tsx (same as `npm run server:dev`, no separate server-build
# step) — this is why `tsx`/`prisma` live in "dependencies", not
# "devDependencies", in package.json.

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
# VITE_ENABLED_GAMES/VITE_BASE_PATH are baked into the client bundle at BUILD
# time (Vite has no runtime env access in the browser) — see
# docs/deployment-specifikacio.md §7/§8. Passed as build args, not committed.
ARG ENABLED_GAMES=""
ARG VITE_BASE_PATH="/"
ARG VITE_SERVER_URL=""
ENV ENABLED_GAMES=$ENABLED_GAMES
ENV VITE_BASE_PATH=$VITE_BASE_PATH
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN npx prisma generate
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Prisma's generated client is written into node_modules/@prisma/client and
# node_modules/.prisma by `prisma generate` in the build stage — `npm ci
# --omit=dev` above reinstalls node_modules from scratch, wiping that, so it
# has to be copied back in explicitly rather than regenerated again here.
COPY --from=build /app/node_modules/.prisma /app/node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY src/server ./src/server
COPY src/shared ./src/shared
COPY prisma ./prisma
COPY public ./public

EXPOSE 2567
# `prisma migrate deploy` runs on every container start (idempotent — a
# no-op if the schema is already current), not as a separate CI/deploy step,
# so the schema is always current regardless of how the container gets
# (re)started — see docs/deployment-specifikacio.md §7.1. `prisma db seed`
# (prisma/seed.ts, itself just an idempotent `upsert`) runs right after for
# the same reason — real production bug (2026-07-30): the seed step was
# never part of the deploy/startup path at all, so the live database never
# got its `FAMILY2026` InviteCode row, and every AI-opponent creation
# (`ensureAiUser`'s own `user.upsert`, needed by ANY game's multiplayer AI
# opponent, first hit for real by Ramses) failed on the `users_inviteCode_fkey`
# foreign key.
CMD ["sh", "-c", "npx prisma migrate deploy && npx prisma db seed && npx tsx src/server/index.ts"]
