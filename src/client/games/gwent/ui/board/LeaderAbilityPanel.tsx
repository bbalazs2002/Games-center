import { useState } from 'react';
import { assetUrl } from '../../../../core/assetUrl';
import { Button } from '../../../../ui-kit/Button';
import { CardCarouselModal, type CarouselEntry } from './CardCarouselModal';
import { CardTile } from './CardTile';
import { getLeaderDef } from '@shared/games/gwent/engine/leaderDefs';
import { getCardDef } from '@shared/games/gwent/engine/cardDefs';
import { canActivateLeaderAbility } from '@shared/games/gwent/engine/leaderAbilities';
import { getOpponent, getPlayer } from '@shared/games/gwent/engine/rules';
import {
  EMHYR_THE_RELENTLESS,
  EREDIN_BRINGER_OF_DEATH,
  EREDIN_COMMANDER_OF_THE_RED_RIDERS,
  EREDIN_DESTROYER_OF_WORLDS,
} from '@shared/games/gwent/engine/leaderConstants';
import type { GwentAction } from '@shared/games/gwent/engine/actions';
import type { CardInstance, GwentState, PlayerId } from '@shared/games/gwent/engine/state';
import type { LeaderDef } from '@shared/games/gwent/engine/types';
import styles from './matchBoard.module.css';

export interface LeaderAbilityPanelProps {
  state: GwentState;
  playerId: PlayerId;
  dispatch: (action: GwentAction) => void;
  /**
   * The deck is masked for everyone, including its own owner (see
   * toPublicGwentState) — EXCEPT for a momentary, request-scoped reveal when
   * a player is legitimately about to use one of the 2 deck-searching leader
   * abilities below. Local hot-seat resolves this synchronously in-process
   * (no real secret to protect from yourself); online it's a real
   * server round-trip (GwentRoom's 'requestDeckReveal'/'deckRevealed').
   */
  requestDeckReveal: (playerId: PlayerId) => Promise<CardInstance[]>;
  /**
   * Gwent-0c: both players' leader panels are always visible now (moved into
   * each PlayerBoardZone), not just the acting player's — undefined means
   * "no extra gate" (always interactive if `canActivateLeaderAbility` says
   * so); otherwise only the panel whose `playerId` matches `viewerId` may be
   * activated by THIS client (mirrors the myPlayer gating already used by
   * MulliganScreen/StartingChoiceScreen/MatchBoard, see Gwent-0b).
   */
  viewerId?: PlayerId;
}

/** Leader abilities whose target must be picked from the player's own DECK (chosen weather card, or Bringer of Death's draw). */
const DECK_TARGET_ABILITIES = new Set([EREDIN_COMMANDER_OF_THE_RED_RIDERS, EREDIN_BRINGER_OF_DEATH]);
/** Leader abilities whose target is a specific discard pile — own (Destroyer of Worlds) or the opponent's (The Relentless). */
const OWN_DISCARD_TARGET_ABILITIES = new Set([EREDIN_DESTROYER_OF_WORLDS]);
const OPPONENT_DISCARD_TARGET_ABILITIES = new Set([EMHYR_THE_RELENTLESS]);

/** Extracted purely to keep `LeaderAbilityPanel` under the project's complexity-10 ESLint limit — each `&&`/`?:` here used to count against that one function. */
function leaderZoomEntries(zoomOpen: boolean, leaderDef: LeaderDef): CarouselEntry[] | null {
  return zoomOpen ? [{ type: 'leader', leader: leaderDef }] : null;
}

function needsAnyTargetPick(needsDeckTarget: boolean, needsOwnDiscardTarget: boolean, needsOpponentDiscardTarget: boolean): boolean {
  return needsDeckTarget || needsOwnDiscardTarget || needsOpponentDiscardTarget;
}

type TargetPickerKind = 'deckWeather' | 'bringerOfDeath' | 'ownDiscard' | 'opponentDiscard' | null;

/**
 * Which (if any) of the four target-picker panels below is showing —
 * mutually exclusive by construction (a leader belongs to at most one of
 * `DECK_TARGET_ABILITIES`/`OWN_DISCARD_TARGET_ABILITIES`/
 * `OPPONENT_DISCARD_TARGET_ABILITIES`), EXCEPT Eredin Bringer of Death, who
 * is also in `DECK_TARGET_ABILITIES` but gets his own dedicated 2-step
 * picker instead of the generic deck-weather one — checked first here for
 * exactly that reason (same priority the original `!isBringerOfDeath` guard
 * encoded).
 */
function resolveActivePicker(
  pickingTarget: boolean,
  isBringerOfDeath: boolean,
  needsDeckTarget: boolean,
  needsOwnDiscardTarget: boolean,
  needsOpponentDiscardTarget: boolean,
): TargetPickerKind {
  if (!pickingTarget) return null;
  if (isBringerOfDeath) return 'bringerOfDeath';
  if (needsDeckTarget) return 'deckWeather';
  if (needsOwnDiscardTarget) return 'ownDiscard';
  if (needsOpponentDiscardTarget) return 'opponentDiscard';
  return null;
}

interface DeckWeatherTargetPickerProps {
  active: boolean;
  revealedDeck: CardInstance[] | null;
  onPick: (instanceId: string) => void;
  onCancel: () => void;
}

function DeckWeatherTargetPicker({ active, revealedDeck, onPick, onCancel }: DeckWeatherTargetPickerProps) {
  if (!active) return null;
  const weatherCards = (revealedDeck ?? []).filter((c) => getCardDef(c.defId).kind === 'Weather');
  return (
    <div className={styles.targetPicker}>
      <p>Válassz egy időjárás-kártyát a paklidból:</p>
      {revealedDeck === null && <p>Pakli lekérése…</p>}
      {revealedDeck !== null && weatherCards.length === 0 && <p>Nincs időjárás-kártya a paklidban.</p>}
      {weatherCards.map((c) => (
        <CardTile key={c.instanceId} instance={c} size="medium" onClick={() => onPick(c.instanceId)} />
      ))}
      <Button variant="secondary" onClick={onCancel}>
        Mégse
      </Button>
    </div>
  );
}

interface BringerOfDeathTargetPickerProps {
  active: boolean;
  hand: CardInstance[];
  selectedDiscards: string[];
  onToggleDiscard: (instanceId: string) => void;
  revealedDeck: CardInstance[] | null;
  onPickDraw: (instanceId: string) => void;
  onCancel: () => void;
}

function BringerOfDeathTargetPicker({ active, hand, selectedDiscards, onToggleDiscard, revealedDeck, onPickDraw, onCancel }: BringerOfDeathTargetPickerProps) {
  if (!active) return null;
  return (
    <div className={styles.targetPicker}>
      <p>Válassz 2 lapot a kezedből, amit eldobsz ({selectedDiscards.length}/2):</p>
      {hand.map((c) => (
        <CardTile
          key={c.instanceId}
          instance={c}
          size="medium"
          selected={selectedDiscards.includes(c.instanceId)}
          disabled={selectedDiscards.length >= 2 && !selectedDiscards.includes(c.instanceId)}
          onClick={() => onToggleDiscard(c.instanceId)}
        />
      ))}
      {selectedDiscards.length === 2 && (
        <>
          <p>Válassz 1 lapot a pakliból, amit felhúzol:</p>
          {revealedDeck === null && <p>Pakli lekérése…</p>}
          {(revealedDeck ?? []).map((c) => (
            <CardTile key={c.instanceId} instance={c} size="medium" onClick={() => onPickDraw(c.instanceId)} />
          ))}
        </>
      )}
      <Button variant="secondary" onClick={onCancel}>
        Mégse
      </Button>
    </div>
  );
}

interface DiscardTargetPickerProps {
  active: boolean;
  prompt: string;
  emptyMessage: string;
  discard: CardInstance[];
  onPick: (instanceId: string) => void;
  onCancel: () => void;
}

/** Shared by the "own discard" and "opponent discard" target pickers — identical layout, just different data/copy. */
function DiscardTargetPicker({ active, prompt, emptyMessage, discard, onPick, onCancel }: DiscardTargetPickerProps) {
  if (!active) return null;
  return (
    <div className={styles.targetPicker}>
      <p>{prompt}</p>
      {discard.length === 0 && <p>{emptyMessage}</p>}
      {discard.map((c) => (
        <CardTile key={c.instanceId} instance={c} size="medium" onClick={() => onPick(c.instanceId)} />
      ))}
      <Button variant="secondary" onClick={onCancel}>
        Mégse
      </Button>
    </div>
  );
}

/**
 * A single, ability-agnostic activation panel for the 13 one-shot leader
 * abilities (category A) — most need no target at all (a plain "Aktiválás"
 * button); a handful need a card picked from a specific pile. Eredin Bringer
 * of Death is the one 2-step case (2 hand cards to discard + 1 deck card to
 * draw). See docs/gwent-0a-specifikacio.md §"Gwent-0a.2" for the category list.
 */
export function LeaderAbilityPanel({ state, playerId, dispatch, requestDeckReveal, viewerId }: LeaderAbilityPanelProps) {
  const [pickingTarget, setPickingTarget] = useState(false);
  const [selectedDiscards, setSelectedDiscards] = useState<string[]>([]);
  const [revealedDeck, setRevealedDeck] = useState<CardInstance[] | null>(null);
  // Read-only leader-card zoom (Gwent-0c.1 §C, 10. pont) — available whether
  // the ability is still active or already used/passive.
  const [zoomOpen, setZoomOpen] = useState(false);

  const player = getPlayer(state, playerId);
  const leaderDef = getLeaderDef(player.leaderId);
  const isOwnPanel = viewerId === undefined || viewerId === playerId;
  const canActivate = isOwnPanel && canActivateLeaderAbility(state, playerId);

  function activate(targetInstanceId?: string, secondaryInstanceIds?: string[]): void {
    dispatch({ type: 'ACTIVATE_LEADER_ABILITY', playerId, targetInstanceId, secondaryInstanceIds });
    closePicker();
  }

  function closePicker(): void {
    setPickingTarget(false);
    setSelectedDiscards([]);
    setRevealedDeck(null);
  }

  function toggleDiscardSelection(instanceId: string): void {
    setSelectedDiscards((prev) => (prev.includes(instanceId) ? prev.filter((id) => id !== instanceId) : [...prev, instanceId]));
  }

  const needsDeckTarget = DECK_TARGET_ABILITIES.has(player.leaderId);
  const needsOwnDiscardTarget = OWN_DISCARD_TARGET_ABILITIES.has(player.leaderId);
  const needsOpponentDiscardTarget = OPPONENT_DISCARD_TARGET_ABILITIES.has(player.leaderId);
  const isBringerOfDeath = player.leaderId === EREDIN_BRINGER_OF_DEATH;
  const activePicker = resolveActivePicker(pickingTarget, isBringerOfDeath, needsDeckTarget, needsOwnDiscardTarget, needsOpponentDiscardTarget);

  async function openPicker(): Promise<void> {
    // A deck-target ability needs a momentary, request-scoped reveal of the
    // real deck (masked otherwise, even from its own owner) — see this
    // component's requestDeckReveal doc comment.
    if (needsDeckTarget) setRevealedDeck(await requestDeckReveal(playerId));
    setPickingTarget(true);
  }

  if (player.leaderAbilityUsed) {
    return (
      <div className={styles.leaderPanel}>
        <img className={styles.leaderImage} src={assetUrl(leaderDef.imagePaths[0])} alt={leaderDef.name} onClick={() => setZoomOpen(true)} />
        <span className={styles.leaderUsed}>Vezér-képesség elhasználva</span>
        <CardCarouselModal entries={leaderZoomEntries(zoomOpen, leaderDef)} onClose={() => setZoomOpen(false)} />
      </div>
    );
  }

  return (
    <div className={styles.leaderPanel}>
      <img className={styles.leaderImage} src={assetUrl(leaderDef.imagePaths[0])} alt={leaderDef.name} onClick={() => setZoomOpen(true)} />
      <CardCarouselModal entries={leaderZoomEntries(zoomOpen, leaderDef)} onClose={() => setZoomOpen(false)} />
      {/* Gwent-0c.4 §E: the description used to sit here too — removed (felhasználó: elég, ha a
          modálon látszik, ami a vezérkép kattintására már ma is nyílik, lásd fent) — this also
          removes the risk of a long description pushing LifeTokens out of the zone below. */}

      {/*
        A felhasználó kérése: a gomb csak a SAJÁT (mindig alul megjelenő)
        vezér-panelen jelenjen meg — a felső zóna mindig az ellenfélé
        (lásd MatchBoard.tsx `bottomPlayer`/`topPlayer` doc-kommentje), ott a
        gomb sosem lenne aktiválható, a puszta (letiltott) megjelenése is
        felesleges zaj volt.
      */}
      {isOwnPanel && !pickingTarget && (
        <Button
          className={styles.leaderAbilityButton}
          disabled={!canActivate}
          onClick={() => (needsAnyTargetPick(needsDeckTarget, needsOwnDiscardTarget, needsOpponentDiscardTarget) ? void openPicker() : activate())}
        >
          Vezér-képesség aktiválása
        </Button>
      )}

      <DeckWeatherTargetPicker active={activePicker === 'deckWeather'} revealedDeck={revealedDeck} onPick={activate} onCancel={closePicker} />
      <BringerOfDeathTargetPicker
        active={activePicker === 'bringerOfDeath'}
        hand={player.hand}
        selectedDiscards={selectedDiscards}
        onToggleDiscard={toggleDiscardSelection}
        revealedDeck={revealedDeck}
        onPickDraw={(instanceId) => activate(instanceId, selectedDiscards)}
        onCancel={closePicker}
      />
      <DiscardTargetPicker
        active={activePicker === 'ownDiscard'}
        prompt="Válassz egy lapot a dobott lapjaid közül:"
        emptyMessage="Üres a dobott lapok kupaca."
        discard={player.discard}
        onPick={activate}
        onCancel={() => setPickingTarget(false)}
      />
      <DiscardTargetPicker
        active={activePicker === 'opponentDiscard'}
        prompt="Válassz egy lapot az ellenfél dobott lapjai közül:"
        emptyMessage="Üres az ellenfél dobott lapok kupaca."
        discard={getOpponent(state, playerId).discard}
        onPick={activate}
        onCancel={() => setPickingTarget(false)}
      />
    </div>
  );
}
