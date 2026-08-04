import { useEffect, useState } from 'react';
import { LEADER_DEFS } from '../../../../shared/games/gwent/engine/leaderDefs';
import type { Faction } from '../../../../shared/games/gwent/engine/types';
import { validateDeckDraft, type DeckCardCounts, type GwentDeckDraft } from '../../../../shared/games/gwent/engine/deckRules';
import { loadPersistedGwentDeck } from './gwentDeckPersistence';
import { DeckStep } from './DeckStep';
import { FactionStep } from './FactionStep';
import { LeaderStep } from './LeaderStep';
import styles from './GwentSetupPage.module.css';

type Step = 'faction' | 'leader' | 'deck';

export interface GwentDeckBuilderProps {
  title: string;
  /** Fires on every change with the current draft once faction+leader+a fully valid deck are all chosen, or null the moment any of that stops being true. */
  onValidDraftChange: (draft: GwentDeckDraft | null) => void;
}

/**
 * The faction -> leader -> deck wizard body — extracted from Gwent-0a.1's
 * `GwentSetupPage` (2026-08-04) so `GwentMatchSetupPage` can run two
 * independent instances of it (one per hot-seat player) without duplicating
 * any of the deck-building logic. `DeckStep`/`FactionStep`/`LeaderStep`/
 * `CardGrid` are unchanged.
 *
 * Gwent-0c.3 §2: a saved deck is now looked up PER FACTION (both here AND
 * in gwentDeckPersistence.ts) — picking a faction that has a persisted save
 * seeds its leader/card-counts automatically and jumps straight to the deck
 * step, exactly like the old single-slot `persisted` prop used to for
 * whichever faction happened to be saved last. Applies equally to BOTH
 * hot-seat players now, not just "whichever builder is shown first".
 */
export function GwentDeckBuilder({ title, onValidDraftChange }: GwentDeckBuilderProps) {
  const [step, setStep] = useState<Step>('faction');
  const [faction, setFaction] = useState<Faction | null>(null);
  // Keyed by faction (not a single flat value) so switching faction/leader mid-build never
  // discards another faction's already-picked leader/cards (0a-spec §9.5 kérés, 2026-08-01).
  const [leaderIdByFaction, setLeaderIdByFaction] = useState<Partial<Record<Faction, string>>>({});
  const [cardCountsByFaction, setCardCountsByFaction] = useState<Partial<Record<Faction, DeckCardCounts>>>({});

  const leaderId = faction ? (leaderIdByFaction[faction] ?? null) : null;
  const cardCounts = faction ? (cardCountsByFaction[faction] ?? {}) : {};
  const isValid = faction !== null && leaderId !== null && validateDeckDraft({ faction, leaderId, cardCounts }).valid;

  useEffect(() => {
    onValidDraftChange(isValid && faction && leaderId ? { faction, leaderId, cardCounts } : null);
    // onValidDraftChange intentionally excluded — callers pass an inline setter, including it would refire every render for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid, faction, leaderId, cardCounts]);

  /** Seeds `next`'s leader/card-counts from its persisted save the FIRST time this session touches that faction — never overwrites an in-progress pick already made this session. Returns whether a persisted deck was actually applied. */
  function applyPersistedDeck(next: Faction): boolean {
    if (leaderIdByFaction[next]) return false; // already touched this session — never clobber
    const persisted = loadPersistedGwentDeck(next);
    if (!persisted) return false;
    setLeaderIdByFaction((prev) => ({ ...prev, [next]: persisted.leaderId }));
    setCardCountsByFaction((prev) => ({ ...prev, [next]: persisted.cardCounts }));
    return true;
  }

  function selectFaction(next: Faction): void {
    setFaction(next);
    setStep(applyPersistedDeck(next) ? 'deck' : 'leader');
  }

  function selectLeader(next: string): void {
    if (!faction) return;
    setLeaderIdByFaction((prev) => ({ ...prev, [faction]: next }));
    setStep('deck');
  }

  // Switching faction from the deck step never leaves it — a faction with no leader picked
  // yet just defaults to its first leader, changeable via the leader dropdown right there.
  function switchFaction(next: Faction): void {
    setFaction(next);
    if (applyPersistedDeck(next)) return;
    setLeaderIdByFaction((prev) => {
      if (prev[next]) return prev;
      const defaultLeader = LEADER_DEFS.find((l) => l.faction === next);
      return defaultLeader ? { ...prev, [next]: defaultLeader.id } : prev;
    });
  }

  function switchLeader(next: string): void {
    if (!faction) return;
    setLeaderIdByFaction((prev) => ({ ...prev, [faction]: next }));
  }

  function changeCardCounts(next: DeckCardCounts): void {
    if (!faction) return;
    setCardCountsByFaction((prev) => ({ ...prev, [faction]: next }));
  }

  return (
    <section className={styles.builderSection}>
      <h2>{title}</h2>

      {step === 'faction' && <FactionStep selectedFaction={faction} onSelect={selectFaction} />}

      {step === 'leader' && faction && (
        <LeaderStep
          faction={faction}
          leaders={LEADER_DEFS.filter((l) => l.faction === faction)}
          selectedLeaderId={leaderId}
          onBack={() => setStep('faction')}
          onSelect={selectLeader}
        />
      )}

      {step === 'deck' && faction && leaderId && (
        <DeckStep
          faction={faction}
          leaderId={leaderId}
          cardCounts={cardCounts}
          onCardCountsChange={changeCardCounts}
          onFactionChange={switchFaction}
          onLeaderChange={switchLeader}
        />
      )}
    </section>
  );
}
