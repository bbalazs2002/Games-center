import { createContext, useContext } from 'react';
import type { CardInstance, PlayerId } from '@shared/games/gwent/engine/state';
import type { Faction } from '@shared/games/gwent/engine/types';

export interface TrackedCardInfo {
  instance: CardInstance;
  power?: number;
  faction?: Faction;
  ownerId: PlayerId;
}

export interface CardFlightApi {
  registerZoneRef: (zoneKey: string) => (el: HTMLElement | null) => void;
  registerCardRef: (instanceId: string, info: TrackedCardInfo) => (el: HTMLElement | null) => void;
  isInFlight: (instanceId: string) => boolean;
}

export const CardFlightContext = createContext<CardFlightApi | null>(null);

/**
 * Split out of `cardFlight.tsx` so that file only exports components — a
 * plain hook export alongside them defeats Vite Fast Refresh for the whole
 * file (react-refresh/only-export-components).
 */
export function useCardFlight(): CardFlightApi {
  const ctx = useContext(CardFlightContext);
  if (!ctx) throw new Error('useCardFlight must be used within a CardFlightProvider');
  return ctx;
}
