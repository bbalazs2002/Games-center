import { animated, useSpring } from '@react-spring/web';
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from 'react';
import type { CardInstance, GwentLogEntry, PlayerId } from '@shared/games/gwent/engine/state';
import type { Faction } from '@shared/games/gwent/engine/types';
import { CardTile } from './CardTile';
import { CardFlightContext, useCardFlight, type TrackedCardInfo } from './useCardFlight';
import styles from './cardFlight.module.css';

const MOVE_DURATION_MS = 420;
const EXIT_DURATION_MS = 480;
/** How long a played Scorch card visibly hovers over `ScorchFloatZone` before continuing on to the discard pile — felhasználói kérés, 2026-08-07. */
const SCORCH_FLOAT_HOLD_MS = 450;
/** Same idea for a played Clear Weather card hovering next to `ActiveWeatherZone`'s `weather-zone` anchor — same kérés. */
const WEATHER_FLOAT_HOLD_MS = 450;
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
  /** A Scorch-destroyed card flashing mid-flight (felhasználói kérés, 2026-08-07) — see `spawnExitGhosts`/`FlyingCard`. */
  flash?: boolean;
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

interface ExitResolution {
  zone: string;
  /** True only for an actual Scorch/RowScorch kill — the flash reads as "destroyed", so a returned Decoy card must NOT get it. */
  flash: boolean;
}

/**
 * Scorch/RowScorch destructions, a played Decoy card itself, and a played
 * (non-Clear) Weather card's own 1-leg flight to `ActiveWeatherZone` —
 * the confirmed "this exact card is discarded/placed now" cases, per the
 * user's request that this animation be precise (not a generic catch-all for
 * every disappearance, e.g. a mulligan swap-out must NOT fly to discard —
 * it's only set aside). A Clear Weather card is deliberately EXCLUDED here —
 * it needs the 2-leg float-then-discard flight below instead (WEATHER_CLEARED,
 * not WEATHER_APPLIED — the two log entry types are mutually exclusive per
 * play, see reducer.ts's resolveWeatherCard).
 */
function resolveExitZone(newLogEntries: GwentLogEntry[], instanceId: string, ownerId: PlayerId): ExitResolution | null {
  for (const entry of newLogEntries) {
    if (entry.type === 'SCORCH_RESOLVED' && entry.destroyedInstanceIds.includes(instanceId)) return { zone: `discard:${ownerId}`, flash: true };
    if (entry.type === 'ROW_SCORCH_RESOLVED' && entry.destroyedInstanceIds.includes(instanceId)) return { zone: `discard:${ownerId}`, flash: true };
    if (entry.type === 'DECOY_SWAPPED' && entry.decoyInstanceId === instanceId) return { zone: `discard:${ownerId}`, flash: false };
    if (entry.type === 'WEATHER_APPLIED' && entry.instanceId === instanceId) return { zone: 'weather-zone', flash: false };
  }
  return null;
}

/** The played Scorch card's OWN instanceId (not its victims) — routed through `spawnFloatThenDiscardFlight`'s float-then-discard flight instead of the plain 1-leg exit above. */
function resolveScorchPlayedInstanceId(newLogEntries: GwentLogEntry[], instanceId: string): boolean {
  return newLogEntries.some((entry) => entry.type === 'SCORCH_RESOLVED' && entry.instanceId === instanceId);
}

/** The played Clear Weather card's OWN instanceId — see `resolveScorchPlayedInstanceId`'s doc comment. */
function resolveWeatherClearedInstanceId(newLogEntries: GwentLogEntry[], instanceId: string): boolean {
  return newLogEntries.some((entry) => entry.type === 'WEATHER_CLEARED' && entry.instanceId === instanceId);
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

/**
 * The "vanished, but to a resolvable discard zone" half of the diff — see
 * `spawnMoveOrEntryGhosts`. Skips a played Scorch card's own instanceId
 * (`resolveExitZone` already returns null for it — it's never in its own
 * `destroyedInstanceIds` — so no explicit exclusion is needed here); that one
 * goes through `spawnScorchCardFlight`'s separate float-then-discard flight.
 */
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
    const resolution = resolveExitZone(newLogEntries, instanceId, entry.ownerId);
    const destRect = resolution ? zoneRects.get(resolution.zone) : undefined;
    if (destRect) {
      spawned.push({ id: nextGhostIdRef.current++, info: entry, from: entry.rect, to: destRect, durationMs: EXIT_DURATION_MS, flash: resolution!.flash });
    }
  }
  return spawned;
}

/**
 * A played card's OWN 2-leg flight — hand (or wherever it was) to a named
 * float zone, holds for `holdMs`, then continues on to the discard pile.
 * Used for a Scorch card (`floatZoneKey: 'scorch-float'`, felhasználói kérés,
 * 2026-08-07: "a scorch kártya lebegjen a játéktér fölött") and a Clear
 * Weather card (`floatZoneKey: 'weather-zone'`, same kérés: "a tiszta idő
 * kártya is lebegjen az aktív időjárási kártyák mellé, majd onnan a dobó
 * pakliba"). Unlike every other spawn function here, this one is inherently
 * impure — it has to schedule the SECOND leg itself once the first leg's
 * hold elapses, which the shared "one batch timer per effect run" cleanup
 * (see `CardFlightProvider`'s main effect) can't express. Every timer it
 * creates (including the one scheduled from inside another timer's callback)
 * is added to `pendingTimersRef` so the provider's unmount effect can still
 * clear all of them, however deep.
 */
function spawnFloatThenDiscardFlight(
  previous: Map<string, TrackedCardEntry>,
  current: Map<string, TrackedCardEntry>,
  newLogEntries: GwentLogEntry[],
  zoneRects: Map<string, DOMRect>,
  nextGhostIdRef: MutableRefObject<number>,
  pendingTimersRef: MutableRefObject<Set<ReturnType<typeof setTimeout>>>,
  setGhosts: (updater: (prev: Ghost[]) => Ghost[]) => void,
  setInFlightIds: (updater: (prev: ReadonlySet<string>) => ReadonlySet<string>) => void,
  floatZoneKey: string,
  holdMs: number,
  matchesTrigger: (newLogEntries: GwentLogEntry[], instanceId: string) => boolean,
): void {
  const floatRect = zoneRects.get(floatZoneKey);
  if (!floatRect) return;

  for (const [instanceId, entry] of previous) {
    if (current.has(instanceId)) continue;
    if (!matchesTrigger(newLogEntries, instanceId)) continue;
    const discardRect = zoneRects.get(`discard:${entry.ownerId}`);
    if (!discardRect) continue;

    const leg1Id = nextGhostIdRef.current++;
    setGhosts((prev) => [...prev, { id: leg1Id, info: entry, from: entry.rect, to: floatRect, durationMs: MOVE_DURATION_MS }]);
    setInFlightIds((prev) => new Set([...prev, instanceId]));

    const holdTimer = setTimeout(() => {
      const leg2Id = nextGhostIdRef.current++;
      setGhosts((prev) => [...prev.filter((g) => g.id !== leg1Id), { id: leg2Id, info: entry, from: floatRect, to: discardRect, durationMs: EXIT_DURATION_MS }]);

      const settleTimer = setTimeout(() => {
        setGhosts((prev) => prev.filter((g) => g.id !== leg2Id));
        setInFlightIds((prev) => {
          const next = new Set(prev);
          next.delete(instanceId);
          return next;
        });
        pendingTimersRef.current.delete(settleTimer);
      }, EXIT_DURATION_MS + 30);
      pendingTimersRef.current.add(settleTimer);
      pendingTimersRef.current.delete(holdTimer);
    }, MOVE_DURATION_MS + holdMs);
    pendingTimersRef.current.add(holdTimer);
  }
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
  /** Every live timer `spawnFloatThenDiscardFlight` has scheduled (including ones scheduled from inside another timer) — cleared wholesale on unmount, since its 2-leg sequencing can't fit the single "one batch timer per effect run" cleanup below. */
  const pendingFloatTimersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const [inFlightIds, setInFlightIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const timers = pendingFloatTimersRef.current;
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, []);

  const registerZoneRef = useCallback(
    (zoneKey: string) => (el: HTMLElement | null) => {
      if (el) zoneRectsRef.current.set(zoneKey, el.getBoundingClientRect());
      else zoneRectsRef.current.delete(zoneKey);
    },
    [],
  );

  // Real playtest report (2026-08-08): the exit-flight animations (a
  // destroyed/discarded card flying to the discard pile, and both legs of
  // spawnFloatThenDiscardFlight) never actually played — `current.has(id)`
  // in spawnExitGhosts (below) was permanently true for ANY instanceId ever
  // registered, because this callback only ever ADDED to currentRef.current
  // and never removed an entry when its element unmounted (`el === null`,
  // silently ignored). A `TrackedCardTile` that's still mounted gets a
  // BRAND NEW closure every render (this function isn't memoized per
  // instanceId), so React fires the OLD closure with `null` and the NEW one
  // with the live element on every single render regardless of whether
  // anything unmounted — deleting-then-immediately-re-setting is therefore
  // a safe no-op for a card that's still there, and a real, correct removal
  // for one that's truly gone.
  const registerCardRef = useCallback(
    (instanceId: string, info: TrackedCardInfo) => (el: HTMLElement | null) => {
      if (el) currentRef.current.set(instanceId, { ...info, rect: el.getBoundingClientRect() });
      else currentRef.current.delete(instanceId);
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
    const floatArgs = [previous, current, newLogEntries, zoneRectsRef.current, nextGhostIdRef, pendingFloatTimersRef, setGhosts, setInFlightIds] as const;
    spawnFloatThenDiscardFlight(...floatArgs, 'scorch-float', SCORCH_FLOAT_HOLD_MS, resolveScorchPlayedInstanceId);
    spawnFloatThenDiscardFlight(...floatArgs, 'weather-zone', WEATHER_FLOAT_HOLD_MS, resolveWeatherClearedInstanceId);
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

/**
 * Invisible anchor rect, centered over the board — where a played Scorch
 * card's flight pauses for a beat before continuing on to the discard pile
 * (felhasználói kérés, 2026-08-07: "a scorch kártya lebegjen a játéktér
 * fölött"). Must be rendered INSIDE `CardFlightProvider` (a child, not the
 * component that creates the provider) since it calls `useCardFlight` itself
 * — see `MatchBoard`'s `ScorchFloatZone` call site.
 */
export function ScorchFloatZone() {
  const { registerZoneRef } = useCardFlight();
  return <div ref={registerZoneRef('scorch-float')} className={styles.scorchFloatZone} />;
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
      className={[styles.ghost, ghost.flash && styles.flash].filter(Boolean).join(' ')}
      style={{
        left: spring.left,
        top: spring.top,
        width: spring.width,
        height: spring.height,
        transform: spring.progress.to((p) => `scale(${1 + Math.sin(p * Math.PI) * 0.12})`),
        animationDuration: ghost.flash ? `${ghost.durationMs}ms` : undefined,
      }}
    >
      <CardTile instance={ghost.info.instance} power={ghost.info.power} faction={ghost.info.faction} size="fill" />
    </animated.div>
  );
}
