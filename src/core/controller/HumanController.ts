import type { PlayerController } from './PlayerController';

/**
 * No-op controller: moves arrive from the UI click-chain (see the game's *GamePage
 * component), not from here. Works for any game because it never touches TState/TAction.
 */
export class HumanController<TState, TAction, TPlayerId = unknown>
  implements PlayerController<TState, TAction, TPlayerId>
{
  constructor(readonly playerId: TPlayerId) {}

  onStateChange(): void {}
}
