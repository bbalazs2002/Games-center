/**
 * Every game's own state carries this — deliberately uniform across all
 * five games (see each game's own engine/state.ts) so "is this game over"
 * can be checked with ONE generic function, not five near-identical
 * per-game copies. Genuinely game-agnostic, unlike each game's own richer
 * outcome details (winnerId/winnerIds/outcome) — this file never needs to
 * import any game's actual State type.
 *
 * Lives in shared/core (not server/core) because it's reused from BOTH
 * sides: server/games/*Room.ts's `isGameFinished` hook (see
 * src/server/core/GameRoom.ts) and localSessionRoutes.ts on the server, but
 * ALSO every game's own GamePage.tsx on the client — the exact same
 * "isFinished(state)" call that decides whether a GamePage shows its
 * winner screen is also what tells useLocalSessionPersistence whether to
 * save immediately. No server-only dependency (no Express/Prisma/Colyseus
 * import) belongs in this file, or it couldn't be imported from the client.
 */
export interface HasGameStatus {
  status: 'IN_PROGRESS' | 'FINISHED';
}

export function isFinished(state: HasGameStatus): boolean {
  return state.status === 'FINISHED';
}

/** Same `gameType` strings as each Room subclass's own `gameType` field / server/index.ts's gameServer.define() calls — the one genuinely per-game list left here, since it's just an allow-list of identifiers, not logic. */
export const KNOWN_GAME_TYPES = ['hotel', 'ramses', 'dama', 'gazdalkodj-okosan', 'gwent'] as const;
export type KnownGameType = (typeof KNOWN_GAME_TYPES)[number];

/** Validates an untrusted, client-supplied `gameType` (localSessionRoutes.ts's request body) before its accompanying state is ever cast to HasGameStatus and trusted. */
export function isKnownGameType(gameType: string): gameType is KnownGameType {
  return (KNOWN_GAME_TYPES as readonly string[]).includes(gameType);
}
