/**
 * Documented, app-level-enforced set of `GameSession.status` values —
 * `status` stays a plain Prisma `String` (see prisma/schema.prisma), not a
 * real Postgres enum, since two live beta rows already have it populated as
 * plain strings and a genuine enum conversion would need a manual `USING`
 * cast. This union gives the same call-site safety without a migration.
 */
export const GAME_SESSION_STATUS = {
  WAITING: 'WAITING',
  IN_PROGRESS: 'IN_PROGRESS',
  FINISHED: 'FINISHED',
  /** Room disposed (all clients left, past the reconnection window) while the game itself never reached FINISHED — distinct from a game that's still genuinely being played. */
  ABANDONED: 'ABANDONED',
} as const;

export type GameSessionStatus = (typeof GAME_SESSION_STATUS)[keyof typeof GAME_SESSION_STATUS];

/** Distinguishes online-Room-created rows from hot-seat-upserted rows — both now write into the same `game_sessions` table. */
export const GAME_SESSION_MODE = {
  ONLINE: 'ONLINE',
  LOCAL: 'LOCAL',
} as const;

export type GameSessionMode = (typeof GAME_SESSION_MODE)[keyof typeof GAME_SESSION_MODE];
