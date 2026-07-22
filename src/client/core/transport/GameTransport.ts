export interface GameTransport<TState, TAction> {
  getState(): TState;
  dispatch(action: TAction): void;
  subscribe(listener: (state: TState) => void): () => void;
}
