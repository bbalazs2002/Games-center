import type { DamaAction } from '../engine/actions';
import { getMovablePositions, getValidMoves } from '../engine/selectors';
import type { DamaState } from '../engine/state';

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Fully random legal move — EASY's strategy, see docs/dama-0d-ai-specifikacio.md §5. Can't produce an illegal move since it only picks among getValidMoves' results. */
export function pickRandomMove(state: DamaState): DamaAction | null {
  const movable = getMovablePositions(state);
  if (movable.length === 0) return null;

  const from = pickRandom(movable);
  const to = pickRandom(getValidMoves(state, from));
  return { type: 'MOVE', from, to };
}
