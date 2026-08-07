import { animated, useSpring } from '@react-spring/web';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react';
import type { CardInstance, GwentLogEntry, PlayerId } from '@shared/games/gwent/engine/state';
import type { Faction } from '@shared/games/gwent/engine/types';
import { CardTile } from './CardTile';
import { CardFlightContext, useCardFlight, type TrackedCardInfo } from './useCardFlight';
import styles from './cardFlight.module.css';

const MOVE_DURATION_MS = 420;
const EXIT_DURATION_MS = 480;
const RECT_EPSILON_PX = 1;

interface TrackedCardEntry extends TrackedCardInfo {
  rect: DOMRect;
}

interface Ghost {
  id: number;
  info: TrackedCardInfo;
  from: DOMRect;
  to: DOMRect;
  durationMs: number;
}

function rectsDiffer(a: DOMRect, b: DOMRect): boolean {
  return (
    Math.abs(a.left - b.left) > RECT_EPSILON_PX ||
    Math.abs(a.top - b.top) > RECT_EPSILON_PX ||
    Math.abs(a.width - b.width) > RECT_EPSILON_PX ||
    Math.abs(a.height - b.height) > RECT_EPSILON_PX
  );
}

/**
 * Own-hand draws (any reason), Medic revives, and Muster partners drawn
 * straight from the DECK (Gwent-0c.4 §7) — the cases where a brand-new-this-
 * render instanceId has a resolvable, honest origin zone. A Muster partner
 * that came from HAND instead doesn't need this — it was already a tracked
 * instanceId sitting in the hand zone, so its hand->board move is caught by
 * the ordinary "this instanceId's rect moved" diff above, same as any
 * normal play.
 */
function resolveEntryZone(newLogEntries: GwentLogEntry[], instanceId: string, ownerId: PlayerId): string | null {
  for (const entry of newLogEntries) {
    if (entry.type === 'CARDS_DRAWN' && entry.playerId === ownerId) return `deck:${ownerId}`;
    if (entry.type === 'MEDIC_REVIVED' && entry.instanceId === instanceId) return `discard:${entry.playerId}`;
    if (entry.type === 'MUSTER_TRIGGERED' && entry.playerId === ownerId && entry.playedInstanceIds.includes(instanceId)) return `deck:${ownerId}`;
  }
  return null;
}

/** Scorch/RowScorch destructions and a played Decoy card itself — the confirmed "this exact card is discarded now" cases, per the user's request that this animation be precise (not a generic catch-all for every disappearance, e.g. a mulligan swap-out must NOT fly to discard — it's only set aside). */
function resolveExitZone(newLogEntries: GwentLogEntry[], instanceId: string, ownerId: PlayerId): string | null {
  for (const entry of newLogEntries) {
    if (entry.type === 'SCORCH_RESOLVED' && entry.destroyedInstanceIds.includes(instanceId)) return `discard:${ownerId}`;
    if (entry.type === 'ROW_SCORCH_RESOLVED' && entry.destroyedInstanceIds.includes(instanceId)) return `discard:${ownerId}`;
    if (entry.type === 'DECOY_SWAPPED' && entry.decoyInstanceId === instanceId) return `discard:${ownerId}`;
  }
  return null;
}

/** The "moved to a new spot" or "brand new, but from a resolvable zone" half of the diff — split out of the effect below purely to keep its complexity under the project's ESLint limit. */
function spawnMoveOrEntryGhosts(
  current: Map<string, TrackedCardEntry>,
  previous: Map<string, TrackedCardEntry>,
  newLogEntries: GwentLogEntry[],
  zoneRects: Map<string, DOMRect>,
  nextGhostIdRef: MutableRefObject<number>,
): { spawned: Ghost[]; nowFlying: Set<string> } {
  const spawned: Ghost[] = [];
  const nowFlying = new Set<string>();
  for (const [instanceId, entry] of current) {
    const before = previous.get(instanceId);
    if (before) {
      if (rectsDiffer(before.rect, entry.rect)) {
        spawned.push({ id: nextGhostIdRef.current++, info: entry, from: before.rect, to: entry.rect, durationMs: MOVE_DURATION_MS });
        nowFlying.add(instanceId);
      }
      continue;
    }
    const originZone = resolveEntryZone(newLogEntries, instanceId, entry.ownerId);
    const originRect = originZone ? zoneRects.get(originZone) : undefined;
    if (originRect) {
      spawned.push({ id: nextGhostIdRef.current++, info: entry, from: originRect, to: entry.rect, durationMs: MOVE_DURATION_MS });
      nowFlying.add(instanceId);
    }
  }
  return { spawned, nowFlying };
}

/** The "vanished, but to a resolvable discard zone" half of the diff — see `spawnMoveOrEntryGhosts`. */
function spawnExitGhosts(
  current: Map<string, TrackedCardEntry>,
  previous: Map<string, TrackedCardEntry>,
  newLogEntries: GwentLogEntry[],
  zoneRects: Map<string, DOMRect>,
  nextGhostIdRef: MutableRefObject<number>,
): Ghost[] {
  const spawned: Ghost[] = [];
  for (const [instanceId, entry] of previous) {
    if (current.has(instanceId)) continue;
    const destZone = resolveExitZone(newLogEntries, instanceId, entry.ownerId);
    const destRect = destZone ? zoneRects.get(destZone) : undefined;
    if (destRect) spawned.push({ id: nextGhostIdRef.current++, info: entry, from: entry.rect, to: destRect, durationMs: EXIT_DURATION_MS });
  }
  return spawned;
}

export interface CardFlightProviderProps {
  log: GwentLogEntry[];
  children: ReactNode;
}

/**
 * Drives every card-movement animation (Gwent-0c) off ONE shared registry —
 * see docs/gwent-0c-vizualis-animacio-specifikacio.md §6. DeckPile/DiscardPile
 * register their pile's DOMRect as a named zone (`deck:<playerId>`/
 * `discard:<playerId>`); every live board/hand card registers its own
 * instanceId + DOMRect + visual info on every render via `registerCardRef`.
 *
 * A plain `useEffect` keyed on `log` (fires strictly after every
 * `useLayoutEffect` in the same commit, regardless of tree position — this
 * is what makes the ordering reliable without coordinating with individual
 * card components) diffs this render's registrations against the previous
 * diff pass: a persisting instanceId whose rect moved, or a brand-new
 * instanceId with a resolvable origin, spawns a "ghost" flight; a vanished
 * instanceId with a resolvable discard destination spawns an exit flight.
 * While a ghost is flying, the real element is hidden (`isInFlight`) so
 * there's never a visible duplicate — see CardTile call sites (BoardRow/
 * HandArea) for how that's applied.
 */
export function CardFlightProvider({ log, children }: CardFlightProviderProps) {
  const zoneRectsRef = useRef(new Map<string, DOMRect>());
  const currentRef = useRef(new Map<string, TrackedCardEntry>());
  const previousRef = useRef(new Map<string, TrackedCardEntry>());
  const previousLogLengthRef = useRef(log.length);
  const nextGhostIdRef = useRef(0);
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [inFlightIds, setInFlightIds] = useState<ReadonlySet<string>>(new Set());

  const registerZoneRef = useCallback(
    (zoneKey: string) => (el: HTMLElement | null) => {
      if (el) zoneRectsRef.current.set(zoneKey, el.getBoundingClientRect());
      else zoneRectsRef.current.delete(zoneKey);
    },
    [],
  );

  const registerCardRef = useCallback(
    (instanceId: string, info: TrackedCardInfo) => (el: HTMLElement | null) => {
      if (el) currentRef.current.set(instanceId, { ...info, rect: el.getBoundingClientRect() });
    },
    [],
  );

  const isInFlight = useCallback((instanceId: string) => inFlightIds.has(instanceId), [inFlightIds]);

  useEffect(() => {
    const newLogEntries = log.length > previousLogLengthRef.current ? log.slice(previousLogLengthRef.current) : [];
    previousLogLengthRef.current = log.length;

    const previous = previousRef.current;
    const current = currentRef.current;
    const { spawned: entrySpawned, nowFlying } = spawnMoveOrEntryGhosts(current, previous, newLogEntries, zoneRectsRef.current, nextGhostIdRef);
    const exitSpawned = spawnExitGhosts(current, previous, newLogEntries, zoneRectsRef.current, nextGhostIdRef);
    const spawned = [...entrySpawned, ...exitSpawned];

    previousRef.current = new Map(current);

    if (spawned.length === 0) return;
    setGhosts((prev) => [...prev, ...spawned]);
    setInFlightIds((prev) => new Set([...prev, ...nowFlying]));
    const maxDuration = Math.max(...spawned.map((g) => g.durationMs));
    const timer = setTimeout(() => {
      setGhosts((prev) => prev.filter((g) => !spawned.includes(g)));
      setInFlightIds((prev) => {
        const next = new Set(prev);
        for (const id of nowFlying) next.delete(id);
        return next;
      });
    }, maxDuration + 30);
    return () => clearTimeout(timer);
  }, [log]);

  return (
    <CardFlightContext.Provider value={{ registerZoneRef, registerCardRef, isInFlight }}>
      {children}
      <div className={styles.overlay}>
        {ghosts.map((ghost) => (
          <FlyingCard key={ghost.id} ghost={ghost} />
        ))}
      </div>
    </CardFlightContext.Provider>
  );
}

export interface TrackedCardTileProps {
  instance: CardInstance;
  ownerId: PlayerId;
  power?: number;
  faction?: Faction;
  selected?: boolean;
  disabled?: boolean;
  targetable?: boolean;
  onClick?: () => void;
  size?: 'small' | 'medium';
  style?: CSSProperties;
}

/** The BoardRow/HandArea entry point into the flight system — registers this card's position/visual every render, and hides the real element while a ghost is covering it. See CardFlightProvider's doc comment. */
export function TrackedCardTile({ instance, ownerId, power, faction, ...rest }: TrackedCardTileProps) {
  const { registerCardRef, isInFlight } = useCardFlight();
  return (
    <CardTile
      ref={registerCardRef(instance.instanceId, { instance, power, faction, ownerId })}
      instance={instance}
      power={power}
      faction={faction}
      hidden={isInFlight(instance.instanceId)}
      {...rest}
    />
  );
}

function FlyingCard({ ghost }: { ghost: Ghost }) {
  const spring = useSpring({
    // `progress` drives a mid-flight scale bump only (Gwent-0c.1 §G, 18. pont)
    // — left/top/width/height stay a plain position/size tween, so the
    // existing pixel-precise landing (the felhasználó's earlier, stricter
    // requirement for the destroy/discard animation) is unaffected.
    from: { left: ghost.from.left, top: ghost.from.top, width: ghost.from.width, height: ghost.from.height, progress: 0 },
    to: { left: ghost.to.left, top: ghost.to.top, width: ghost.to.width, height: ghost.to.height, progress: 1 },
    config: { tension: 230, friction: 26 },
  });
  return (
    <animated.div
      className={styles.ghost}
      style={{
        left: spring.left,
        top: spring.top,
        width: spring.width,
        height: spring.height,
        transform: spring.progress.to((p) => `scale(${1 + Math.sin(p * Math.PI) * 0.12})`),
      }}
    >
      <CardTile instance={ghost.info.instance} power={ghost.info.power} faction={ghost.info.faction} size="fill" />
    </animated.div>
  );
}
