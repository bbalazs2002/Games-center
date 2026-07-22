export interface PlayerController<TState, TAction, TPlayerId = unknown> {
  readonly playerId: TPlayerId;
  onStateChange(state: TState, dispatch: (action: TAction) => void): void;
}
