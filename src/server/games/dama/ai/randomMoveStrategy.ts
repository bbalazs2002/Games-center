import type { DamaAction } from '../../../../shared/games/dama/engine/actions';
import { getMovablePositions, getValidMoves } from '../../../../shared/games/dama/engine/selectors';
import type { DamaState } from '../../../../shared/games/dama/engine/state';

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Fully random legal move — see docs/fazis-0c-dama-ai-specifikacio.md §6. Can't produce an illegal move since it only picks among getValidMoves' results. */
export function pickRandomMove(state: DamaState): DamaAction | null {
  const movable = getMovablePositions(state);
  if (movable.length === 0) return null;

  const from = pickRandom(movable);
  const to = pickRandom(getValidMoves(state, from));
  return { type: 'MOVE', from, to };
}
