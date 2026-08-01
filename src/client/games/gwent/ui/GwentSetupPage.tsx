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
  const [leaderId, setLeaderId] = useState<string | null>(persisted?.leaderId ?? null);
  const [cardCounts, setCardCounts] = useState<DeckCardCounts>(persisted?.cardCounts ?? {});

  function selectFaction(next: Faction): void {
    setFaction(next);
    setLeaderId(null);
    setCardCounts({});
    setStep('leader');
  }

  function selectLeader(next: string): void {
    setLeaderId(next);
    setStep('deck');
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
            onCardCountsChange={setCardCounts}
            onBack={() => setStep('leader')}
          />
        )}
      </div>
    </div>
  );
}

export default GwentSetupPage;
