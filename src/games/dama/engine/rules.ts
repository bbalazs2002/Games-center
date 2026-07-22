import type { DamaState, Player, Position } from './state';

/**
 * TODO(Fázis 1): rule helpers backing the reducer — see
 * docs/fazis-0a-dama-specifikacio.md §3.4. Not part of the Fázis 0a skeleton.
 */

export function findCaptureSequences(_state: DamaState, _from: Position): Position[][] {
  throw new Error('findCaptureSequences not implemented yet — see docs/fazis-0a-dama-specifikacio.md §3.4');
}

export function hasAnyCapture(_state: DamaState, _player: Player): boolean {
  throw new Error('hasAnyCapture not implemented yet — see docs/fazis-0a-dama-specifikacio.md §3.4');
}

export function isPromotionRow(_player: Player, _row: number): boolean {
  throw new Error('isPromotionRow not implemented yet — see docs/fazis-0a-dama-specifikacio.md §3.4');
}
