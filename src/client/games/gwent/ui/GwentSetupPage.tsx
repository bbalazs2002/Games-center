import { useMemo, useState } from 'react';
import { useGameTheme } from '../../../shell/useGameTheme';
import { MenuNav } from '../../../ui-kit/MenuNav';
import { LEADER_DEFS } from '../../../../shared/games/gwent/engine/leaderDefs';
import type { Faction } from '../../../../shared/games/gwent/engine/types';
import { type DeckCardCounts } from '../../../../shared/games/gwent/engine/deckRules';
import { loadPersistedGwentDeck } from './gwentDeckPersistence';
import { DeckStep } from './DeckStep';
import { FactionStep } from './FactionStep';
import { LeaderStep } from './LeaderStep';
import styles from './GwentSetupPage.module.css';

type Step = 'faction' | 'leader' | 'deck';

/**
 * Gwent-0a.1's whole scope (docs/gwent-0a-specifikacio.md §1) — no match engine
 * yet, this page only walks the player through faction -> leader -> deck and
 * saves the result locally (gwentDeckPersistence) for Gwent-0a.2 to pick up.
 */
export function GwentSetupPage() {
  const themeClass = useGameTheme('gwent');
  const persisted = useMemo(() => loadPersistedGwentDeck(), []);
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
    <div className={[styles.page, themeClass].filter(Boolean).join(' ')}>
      <MenuNav backTo="/games/gwent" />
      <div className={styles.content}>
        <h1>Gwent — deck-építés</h1>

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
      </div>
    </div>
  );
}

export default GwentSetupPage;
