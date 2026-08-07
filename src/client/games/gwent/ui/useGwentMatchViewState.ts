import { useEffect, useState } from 'react';
import { expectedViewerId, toPublicGwentState } from '@shared/games/gwent/engine/rules';
import type { CardInstance, GwentLogEntry, GwentState, PlayerId } from '@shared/games/gwent/engine/state';
import type { HotSeatAiSlots } from './useGwentHotSeatAi';

/**
 * Gwent-0c: a played/drawn/destroyed card's flight animation (cardFlight.tsx,
 * ~420-480ms) needs to actually be VISIBLE before the screen flips to
 * PassDeviceScreen — instantly swapping MatchBoard out (the previous
 * behavior) unmounted the animation mid-flight, so the acting player never
 * saw their own move. This grace window only applies while ROUND_IN_PROGRESS
 * (the only phase with card flights) — other phase transitions (mulligan →
 * starting choice, etc.) still switch instantly, nothing to wait for there.
 *
 * Gwent-0c.2 §Q: widened past the raw animation length — the felhasználó
 * wants a further ~1s breathing room AFTER the animation settles too, so the
 * outgoing player isn't rushed into handing the device over the instant the
 * card lands.
 */
const ANIMATION_SETTLE_MS = 550;
const EXTRA_PAUSE_MS = 1000;
const PASS_DEVICE_GRACE_MS = ANIMATION_SETTLE_MS + EXTRA_PAUSE_MS;

type HandRevealEntry = Extract<GwentLogEntry, { type: 'LEADER_REVEALED_OPPONENT_HAND' }>;

/** Extracted purely to keep `useGwentMatchViewState` under the project's complexity-10 ESLint limit. */
function resolveViewerId(useActiveViewer: boolean, activeViewerId: PlayerId | null, myPlayer: PlayerId | undefined): PlayerId | undefined {
  return useActiveViewer ? (activeViewerId ?? undefined) : myPlayer;
}

/** Same reasoning as `resolveViewerId` — the "still waiting to be acknowledged, and it's addressed to the current local viewer" check split out of the hook body. */
function resolveHandReveal(entries: HandRevealEntry[], acknowledgedCount: number, viewerForReveal: PlayerId | null | undefined): HandRevealEntry | null {
  if (entries.length <= acknowledgedCount) return null;
  const latest = entries[entries.length - 1];
  return latest.playerId === viewerForReveal ? latest : null;
}

/**
 * An AI-controlled slot must NEVER trigger a "pass the device" moment —
 * there's exactly one human physically holding the device in an AI hot-seat
 * match, nobody to pass it TO, and revealing the AI's own hand to
 * `activeViewerId` would just spoil it for the human anyway (Gwent-0e real
 * playtest finding, 2026-08-07). Whenever the raw expected viewer is
 * AI-controlled, pins the transition target to whichever viewer is already
 * active (the human) — `transitionPending` then naturally stays false,
 * exactly as if it were still the human's own turn.
 */
function resolveExpectedViewer(rawExpectedViewer: PlayerId | null, activeViewerId: PlayerId | null, hotSeatAiSlots: HotSeatAiSlots): PlayerId | null {
  return rawExpectedViewer !== null && rawExpectedViewer in hotSeatAiSlots ? activeViewerId : rawExpectedViewer;
}

export interface GwentMatchViewState {
  /** Local mode: the current viewer's masked view of `state`. Online mode: `state` itself (GwentOnlineTransport already delivers a per-player-masked state). */
  viewState: GwentState;
  /** True for the entire "add tovább a gépet" gate window — see the module doc comment above for the animation-grace reasoning. */
  showPassDevice: boolean;
  nextPlayerName: string;
  onRevealDevice: () => void;
  pendingHandReveal: HandRevealEntry | null;
  onAcknowledgeHandReveal: () => void;
  matchBoardMyPlayer: PlayerId | undefined;
  bottomViewerId: PlayerId | undefined;
  requestDeckReveal: (playerId: PlayerId) => Promise<CardInstance[]>;
}

/**
 * All of `GwentGamePage`'s derived/gating state, extracted into its own hook
 * — partly for readability, partly because a custom hook is its own function
 * scope, so its branching no longer counts against `GwentGamePage`'s own
 * ESLint complexity budget (that component's job is now just "pick a screen
 * and render it").
 */
export function useGwentMatchViewState(
  state: GwentState,
  isLocalMode: boolean,
  myPlayer: PlayerId | undefined,
  onRequestDeckReveal: ((playerId: PlayerId) => Promise<CardInstance[]>) | undefined,
  hotSeatAiSlots: HotSeatAiSlots,
): GwentMatchViewState {
  // Initialized once, from the very first state — every LATER switch goes
  // through the explicit PassDeviceScreen "Megvan, mehet" button, never
  // automatically, so nothing ever flashes into view unannounced.
  const [activeViewerId, setActiveViewerId] = useState<PlayerId | null>(() => expectedViewerId(state));
  // Set once the grace window (see PASS_DEVICE_GRACE_MS) has actually
  // elapsed for the CURRENT pending transition — this is what `showPassDevice`
  // checks below, not `expected !== activeViewerId` directly.
  const [gateReady, setGateReady] = useState(false);
  // Gwent-0d §3: Emhyr var Emreis: Emperor of Nilfgaard's leader ability
  // (LEADER_ABILITY_ACTIVATED -> LEADER_REVEALED_OPPONENT_HAND) used to be a
  // silent log line — the felhasználó wants the revealed cards ACTUALLY
  // shown, and the "add tovább a gépet" hand-off held back until the
  // activating player has closed that view. Counts how many
  // LEADER_REVEALED_OPPONENT_HAND entries have been acknowledged (closed) so
  // far — any entry past that count, belonging to the CURRENT local viewer,
  // is still pending.
  const [acknowledgedRevealCount, setAcknowledgedRevealCount] = useState(0);

  const expectedViewer = resolveExpectedViewer(expectedViewerId(state), activeViewerId, hotSeatAiSlots);
  const transitionPending = isLocalMode && expectedViewer !== null && expectedViewer !== activeViewerId;
  const revealEntries = state.log.filter((entry) => entry.type === 'LEADER_REVEALED_OPPONENT_HAND');
  const viewerForReveal = isLocalMode ? activeViewerId : myPlayer;
  const pendingHandReveal = resolveHandReveal(revealEntries, acknowledgedRevealCount, viewerForReveal);

  useEffect(() => {
    if (!transitionPending) {
      setGateReady(false);
      return;
    }
    if (state.phase !== 'ROUND_IN_PROGRESS') {
      setGateReady(true); // no card-flight to protect outside a round — switch instantly
      return;
    }
    const timer = setTimeout(() => setGateReady(true), PASS_DEVICE_GRACE_MS);
    return () => clearTimeout(timer);
  }, [transitionPending, expectedViewer, state.phase]);

  const nextPlayer = state.players.find((p) => p.id === expectedViewer);

  return {
    viewState: isLocalMode ? toPublicGwentState(state, activeViewerId) : state,
    showPassDevice: transitionPending && gateReady && !pendingHandReveal,
    nextPlayerName: nextPlayer?.name ?? '',
    onRevealDevice: () => setActiveViewerId(expectedViewer),
    pendingHandReveal,
    onAcknowledgeHandReveal: () => setAcknowledgedRevealCount((n) => n + 1),
    // During the grace window (transitionPending but !gateReady, ROUND_IN_PROGRESS
    // only), MatchBoard's own myPlayer gating locks the action bar to the OLD
    // viewer — reusing the exact mechanism built for online mode — so nobody can
    // act as the new player before the device is actually physically handed over,
    // while the just-played card's flight animation keeps playing undisturbed.
    matchBoardMyPlayer: resolveViewerId(transitionPending, activeViewerId, myPlayer),
    bottomViewerId: resolveViewerId(isLocalMode, activeViewerId, myPlayer),
    // Local default: reads straight from `state` (the TRUE, unmasked local
    // state — LocalGameTransport never masks internally) — there's no real
    // secret to protect from yourself in hot-seat, so no round-trip is needed.
    requestDeckReveal: onRequestDeckReveal ?? (async (playerId: PlayerId) => state.players.find((p) => p.id === playerId)?.deck ?? []),
  };
}
