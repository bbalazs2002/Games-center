import { useEffect, useState } from 'react';
import { LEADER_DEFS } from '../../../../shared/games/gwent/engine/leaderDefs';
import type { Faction } from '../../../../shared/games/gwent/engine/types';
import { validateDeckDraft, type DeckCardCounts, type GwentDeckDraft } from '../../../../shared/games/gwent/engine/deckRules';
import type { PersistedGwentDeck } from './gwentDeckPersistence';
import { DeckStep } from './DeckStep';
import { FactionStep } from './FactionStep';
import { LeaderStep } from './LeaderStep';
import styles from './GwentSetupPage.module.css';

type Step = 'faction' | 'leader' | 'deck';

export interface GwentDeckBuilderProps {
  title: string;
  /** Only meaningful for the first builder shown — a convenience preload of the player's last saved deck (single localStorage slot, see gwentDeckPersistence.ts). */
  persisted?: PersistedGwentDeck | null;
  /** Fires on every change with the current draft once faction+leader+a fully valid deck are all chosen, or null the moment any of that stops being true. */
  onValidDraftChange: (draft: GwentDeckDraft | null) => void;
}

/**
 * The faction -> leader -> deck wizard body — extracted from Gwent-0a.1's
 * `GwentSetupPage` (2026-08-04) so `GwentMatchSetupPage` can run two
 * independent instances of it (one per hot-seat player) without duplicating
 * any of the deck-building logic. `DeckStep`/`FactionStep`/`LeaderStep`/
 * `CardGrid` are unchanged.
 */
export function GwentDeckBuilder({ title, persisted, onValidDraftChange }: GwentDeckBuilderProps) {
  const [step, setStep] = useState<Step>(persisted ? 'deck' : 'faction');
  const [faction, setFaction] = useState<Faction | null>(persisted?.faction ?? null);
  // Keyed by faction (not a single flat value) so switching faction/leader mid-build never
  // discards another faction's already-picked leader/cards (0a-spec §9.5 kérés, 2026-08-01).
  const [leaderIdByFaction, setLeaderIdByFaction] = useState<Partial<Record<Faction, string>>>(
    persisted ? { [persisted.faction]: persisted.leaderId } : {},
  );
  const [cardCountsByFaction, setCardCountsByFaction] = useState<Partial<Record<Faction, DeckCardCounts>>>(
    persisted ? { [persisted.faction]: persisted.cardCounts } : {},
  );

  const leaderId = faction ? (leaderIdByFaction[faction] ?? null) : null;
  const cardCounts = faction ? (cardCountsByFaction[faction] ?? {}) : {};
  const isValid = faction !== null && leaderId !== null && validateDeckDraft({ faction, leaderId, cardCounts }).valid;

  useEffect(() => {
    onValidDraftChange(isValid && faction && leaderId ? { faction, leaderId, cardCounts } : null);
    // onValidDraftChange intentionally excluded — callers pass an inline setter, including it would refire every render for no reason.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isValid, faction, leaderId, cardCounts]);

  function selectFaction(next: Faction): void {
    setFaction(next);
    setStep('leader');
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
