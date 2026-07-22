import type { Reducer } from '../types';
import type { GameTransport } from './GameTransport';

export class LocalGameTransport<TState, TAction> implements GameTransport<TState, TAction> {
  private state: TState;
  private readonly listeners = new Set<(state: TState) => void>();

  constructor(
    private readonly reducer: Reducer<TState, TAction>,
    initialState: TState,
  ) {
    this.state = initialState;
  }

  getState(): TState {
    return this.state;
  }

  dispatch(action: TAction): void {
    this.state = this.reducer(this.state, action);
    this.listeners.forEach((listener) => listener(this.state));
  }

  subscribe(listener: (state: TState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}
