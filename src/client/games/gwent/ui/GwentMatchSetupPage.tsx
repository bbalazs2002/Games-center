import { useEffect, useState } from 'react';
import { useGameTheme } from '../../../shell/useGameTheme';
import { Button } from '../../../ui-kit/Button';
import { MenuNav } from '../../../ui-kit/MenuNav';
import { Select } from '../../../ui-kit/Select';
import { buildTacticalAiDeckConfig, type GwentAiDifficulty } from '@shared/games/gwent/ai';
import { createInitialState } from '@shared/games/gwent/engine/initialState';
import type { GwentState } from '@shared/games/gwent/engine/state';
import type { GwentDeckDraft } from '@shared/games/gwent/engine/deckRules';
import { saveGwentDeck } from './gwentDeckPersistence';
import { GwentBackdrop } from './GwentBackdrop';
import { GwentDeckBuilder } from './GwentDeckBuilder';
import { GwentGamePage } from './GwentGamePage';
import type { HotSeatAiSlots } from './useGwentHotSeatAi';
import styles from './GwentSetupPage.module.css';

type MatchStep = 'player1' | 'player2';
type OpponentType = 'HUMAN' | 'AI';

/** Player 1 is always human — mirrors Dáma's fixed-slot hot-seat AI model (docs/gwent-0e-ai-specifikacio.md §7/§9). */
const AI_SLOT = 'player-2';
const AI_NAME = 'AI ellenfél';

const DIFFICULTY_OPTIONS = [
  { value: 'EASY', label: 'Könnyű' },
  { value: 'MEDIUM', label: 'Közepes' },
  { value: 'HARD', label: 'Nehéz' },
];

interface Player2StepProps {
  opponentType: OpponentType;
  onChooseOpponentType: (next: OpponentType) => void;
  aiDifficulty: GwentAiDifficulty;
  onAiDifficultyChange: (next: GwentAiDifficulty) => void;
  player1Name: string;
  player1Draft: GwentDeckDraft | null;
  player2Draft: GwentDeckDraft | null;
  player2Saved: boolean;
  onValidDraftChange: (draft: GwentDeckDraft | null) => void;
  onSavePlayer2: () => void;
  onBackToPlayer1: () => void;
  onStartMatch: () => void;
}

/**
 * Player 2's whole step (Ember/AI váltó + a megfelelő tartalom) — kiszervezve
 * `GwentMatchSetupPage`-ből kizárólag a projekt complexity-10 ESLint
 * limitje miatt (ugyanaz az indoklás, mint a többi hasonló kiszervezésnél
 * ezen a projekten).
 */
function Player2Step({
  opponentType,
  onChooseOpponentType,
  aiDifficulty,
  onAiDifficultyChange,
  player1Name,
  player1Draft,
  player2Draft,
  player2Saved,
  onValidDraftChange,
  onSavePlayer2,
  onBackToPlayer1,
  onStartMatch,
}: Player2StepProps) {
  return (
    <>
      <fieldset className={styles.opponentFieldset}>
        <legend>Ellenfél</legend>
        <div className={styles.radioRow}>
          <label>
            <input type="radio" checked={opponentType === 'HUMAN'} onChange={() => onChooseOpponentType('HUMAN')} />
            Ember
          </label>
          <label>
            <input type="radio" checked={opponentType === 'AI'} onChange={() => onChooseOpponentType('AI')} />
            AI
          </label>
          {opponentType === 'AI' && (
            <Select
              className={styles.opponentDifficultySelect}
              value={aiDifficulty}
              onChange={(next) => onAiDifficultyChange(next as GwentAiDifficulty)}
              options={DIFFICULTY_OPTIONS}
            />
          )}
        </div>
      </fieldset>

      {opponentType === 'AI' ? (
        <>
          <div className={styles.setupPanel}>
            <p>
              Az AI véletlenszerű frakciót és vezért kap, tervezetten összeállított paklival — a nehézségi szint csak a
              meccs közbeni döntéseit befolyásolja.
            </p>
          </div>
          <div className={styles.matchActions}>
            <Button variant="secondary" onClick={onBackToPlayer1}>
              ← {player1Name}
            </Button>
            {player1Draft && player2Draft && <Button onClick={onStartMatch}>Mérkőzés indítása</Button>}
          </div>
        </>
      ) : (
        <GwentDeckBuilder
          onValidDraftChange={onValidDraftChange}
          footerActions={
            <>
              <Button variant="secondary" onClick={onBackToPlayer1}>
                ← {player1Name}
              </Button>
              <Button variant="secondary" disabled={!player2Draft} onClick={onSavePlayer2}>
                Pakli mentése
              </Button>
              {player2Saved && <span className={styles.savedMessage}>Elmentve.</span>}
              {player1Draft && player2Draft && <Button onClick={onStartMatch}>Mérkőzés indítása</Button>}
            </>
          }
        />
      )}
    </>
  );
}

/**
 * Gwent-0a.2's entry point (replaces Gwent-0a.1's `GwentSetupPage` as the
 * `index.ts` default export) — walks BOTH hot-seat players through their own
 * deck build (two independent `GwentDeckBuilder` instances, kept mounted the
 * whole time via `hidden` rather than conditionally rendered, so switching
 * steps never loses either player's in-progress picks), then hands off to
 * `GwentGamePage` once both decks are valid. No route change, same pattern
 * as `HotelSetupPage -> HotelGamePage`. Deck persistence is now per-faction
 * (Gwent-0c.3 §2) — `GwentDeckBuilder` looks it up itself once a faction is
 * picked, for BOTH players equally, so nothing needs preloading here anymore.
 *
 * Gwent-0e (2026-08-07): player 2 can now be AI-controlled instead of a
 * second human — a random-faction, tactically-built deck (see
 * shared/games/gwent/ai/deckBuilder.ts) is generated the moment "AI" is
 * chosen, so `GwentDeckBuilder` never even mounts for that slot.
 */
export function GwentMatchSetupPage() {
  const themeClass = useGameTheme('gwent');

  const [matchStep, setMatchStep] = useState<MatchStep>('player1');
  const [player1Name, setPlayer1Name] = useState('1. játékos');
  const [player2Name, setPlayer2Name] = useState('2. játékos');
  const [player1Draft, setPlayer1Draft] = useState<GwentDeckDraft | null>(null);
  const [player2Draft, setPlayer2Draft] = useState<GwentDeckDraft | null>(null);
  const [opponentType, setOpponentType] = useState<OpponentType>('HUMAN');
  const [aiDifficulty, setAiDifficulty] = useState<GwentAiDifficulty>('MEDIUM');
  const [matchState, setMatchState] = useState<GwentState | null>(null);
  // "Pakli mentése" lives here now, merged into the wizard's own button row
  // (Gwent-0c.2 §D, 7. pont) — resets the moment the underlying draft
  // changes again, same as DeckStep's own pre-move behavior.
  const [player1Saved, setPlayer1Saved] = useState(false);
  const [player2Saved, setPlayer2Saved] = useState(false);
  useEffect(() => setPlayer1Saved(false), [player1Draft]);
  useEffect(() => setPlayer2Saved(false), [player2Draft]);

  function resetMatch(): void {
    setMatchState(null);
    setMatchStep('player1');
    setPlayer1Draft(null);
    setPlayer2Draft(null);
    setOpponentType('HUMAN');
  }

  function chooseOpponentType(next: OpponentType): void {
    setOpponentType(next);
    // A fresh random deck every time "AI" is (re-)selected — always a legal,
    // tactically-built draft (see deckBuilder.ts), never left over from a
    // previous toggle. Switching back to "Ember" clears it, forcing the
    // human to actually build their own deck rather than inheriting the AI's.
    setPlayer2Draft(next === 'AI' ? buildTacticalAiDeckConfig(AI_NAME) : null);
  }

  if (matchState) {
    const hotSeatAiSlots: HotSeatAiSlots = opponentType === 'AI' ? { [AI_SLOT]: aiDifficulty } : {};
    return <GwentGamePage initialState={matchState} hotSeatAiSlots={hotSeatAiSlots} onRequestNewMatch={resetMatch} />;
  }

  function startMatch(): void {
    if (!player1Draft || !player2Draft) return;
    setMatchState(
      createInitialState([
        { name: player1Name, faction: player1Draft.faction, leaderId: player1Draft.leaderId, cardCounts: player1Draft.cardCounts },
        { name: opponentType === 'AI' ? AI_NAME : player2Name, faction: player2Draft.faction, leaderId: player2Draft.leaderId, cardCounts: player2Draft.cardCounts },
      ]),
    );
  }

  return (
    <div className={[styles.page, themeClass].filter(Boolean).join(' ')}>
      <GwentBackdrop />
      <MenuNav backTo="/games/gwent" />
      <div className={styles.content}>
        <h1>Gwent — mérkőzés előkészítése</h1>
        {/*
          Gwent-0d §4 korrekció (2026-08-06): a névmező kikerült a
          `GwentDeckBuilder`-ből — egyetlen, a MenuNav gombsorral egy
          vonalban középre igazított mező, ami a `matchStep` szerint az
          épp aktuális játékos nevét szerkeszti (mindkét név state marad
          lifted, csak a MEGJELENÍTETT input egy). Player 2 AI esetén nincs
          mit szerkeszteni — a mező ilyenkor el is tűnik.
        */}
        {!(matchStep === 'player2' && opponentType === 'AI') && (
          <input
            className={styles.nameInput}
            value={matchStep === 'player1' ? player1Name : player2Name}
            onChange={(event) => (matchStep === 'player1' ? setPlayer1Name : setPlayer2Name)(event.target.value)}
          />
        )}

        <div className={styles.playerStep} hidden={matchStep !== 'player1'}>
          <GwentDeckBuilder
            onValidDraftChange={setPlayer1Draft}
            footerActions={
              <>
                <Button
                  variant="secondary"
                  disabled={!player1Draft}
                  onClick={() => {
                    if (!player1Draft) return;
                    saveGwentDeck(player1Draft);
                    setPlayer1Saved(true);
                  }}
                >
                  Pakli mentése
                </Button>
                {player1Saved && <span className={styles.savedMessage}>Elmentve.</span>}
                {/* Gwent-0c.4 §A: only rendered once the deck is actually valid — not just disabled while invalid. */}
                {player1Draft && <Button onClick={() => setMatchStep('player2')}>Tovább — {player2Name}</Button>}
              </>
            }
          />
        </div>

        <div className={styles.playerStep} hidden={matchStep !== 'player2'}>
          <Player2Step
            opponentType={opponentType}
            onChooseOpponentType={chooseOpponentType}
            aiDifficulty={aiDifficulty}
            onAiDifficultyChange={setAiDifficulty}
            player1Name={player1Name}
            player1Draft={player1Draft}
            player2Draft={player2Draft}
            player2Saved={player2Saved}
            onValidDraftChange={setPlayer2Draft}
            onSavePlayer2={() => {
              if (!player2Draft) return;
              saveGwentDeck(player2Draft);
              setPlayer2Saved(true);
            }}
            onBackToPlayer1={() => setMatchStep('player1')}
            onStartMatch={startMatch}
          />
        </div>
      </div>
    </div>
  );
}

export default GwentMatchSetupPage;
