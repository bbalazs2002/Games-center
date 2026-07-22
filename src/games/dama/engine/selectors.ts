import type { DamaState, Player, Position } from './state';

/**
 * TODO(Fázis 1): derived-data queries, read-only — see
 * docs/fazis-0a-dama-specifikacio.md §3.3. Not part of the Fázis 0a skeleton.
 */

export function getValidMoves(_state: DamaState, _from: Position): Position[] {
  throw new Error('getValidMoves not implemented yet — see docs/fazis-0a-dama-specifikacio.md §3.3');
}

export function getWinner(_state: DamaState): Player | null {
  throw new Error('getWinner not implemented yet — see docs/fazis-0a-dama-specifikacio.md §3.3');
}
