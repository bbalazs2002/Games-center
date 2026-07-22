import type { Position } from './state';

export type DamaAction = { type: 'MOVE'; from: Position; to: Position };
