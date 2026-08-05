import { useState } from 'react';
import { assetUrl } from '../../../../core/assetUrl';
import { Button } from '../../../../ui-kit/Button';
import { CardTile } from './CardTile';
import { LeaderDetailModal } from './LeaderDetailModal';
import { getLeaderDef } from '../../../../../shared/games/gwent/engine/leaderDefs';
import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import { canActivateLeaderAbility } from '../../../../../shared/games/gwent/engine/leaderAbilities';
import { getOpponent, getPlayer } from '../../../../../shared/games/gwent/engine/rules';
import {
  EMHYR_THE_RELENTLESS,
  EREDIN_BRINGER_OF_DEATH,
  EREDIN_COMMANDER_OF_THE_RED_RIDERS,
  EREDIN_DESTROYER_OF_WORLDS,
} from '../../../../../shared/games/gwent/engine/leaderConstants';
import type { GwentAction } from '../../../../../shared/games/gwent/engine/actions';
import type { CardInstance, GwentState, PlayerId } from '../../../../../shared/games/gwent/engine/state';
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
  if (player.leaderAbilityUsed) {
    return (
      <div className={styles.leaderPanel}>
        <img
          className={styles.leaderImage}
          src={assetUrl(leaderDef.imagePaths[0])}
          alt={leaderDef.name}
          onClick={() => setZoomOpen(true)}
        />
        <span className={styles.leaderUsed}>Vezér-képesség elhasználva</span>
        <LeaderDetailModal leader={zoomOpen ? leaderDef : null} onClose={() => setZoomOpen(false)} />
      </div>
    );
  }

  function activate(targetInstanceId?: string, secondaryInstanceIds?: string[]): void {
    dispatch({ type: 'ACTIVATE_LEADER_ABILITY', playerId, targetInstanceId, secondaryInstanceIds });
    closePicker();
  }

  function closePicker(): void {
    setPickingTarget(false);
    setSelectedDiscards([]);
    setRevealedDeck(null);
  }

  const needsDeckTarget = DECK_TARGET_ABILITIES.has(player.leaderId);
  const needsOwnDiscardTarget = OWN_DISCARD_TARGET_ABILITIES.has(player.leaderId);
  const needsOpponentDiscardTarget = OPPONENT_DISCARD_TARGET_ABILITIES.has(player.leaderId);
  const isBringerOfDeath = player.leaderId === EREDIN_BRINGER_OF_DEATH;

  async function openPicker(): Promise<void> {
    // A deck-target ability needs a momentary, request-scoped reveal of the
    // real deck (masked otherwise, even from its own owner) — see this
    // component's requestDeckReveal doc comment.
    if (needsDeckTarget) setRevealedDeck(await requestDeckReveal(playerId));
    setPickingTarget(true);
  }

  return (
    <div className={styles.leaderPanel}>
      <img
        className={styles.leaderImage}
        src={assetUrl(leaderDef.imagePaths[0])}
        alt={leaderDef.name}
        onClick={() => setZoomOpen(true)}
      />
      <LeaderDetailModal leader={zoomOpen ? leaderDef : null} onClose={() => setZoomOpen(false)} />
      {/* Gwent-0c.4 §E: the description used to sit here too — removed (felhasználó: elég, ha a
          modálon látszik, ami a vezérkép kattintására már ma is nyílik, lásd fent) — this also
          removes the risk of a long description pushing LifeTokens out of the zone below. */}

      {!pickingTarget && (
        <Button
          disabled={!canActivate}
          onClick={() => (needsDeckTarget || needsOwnDiscardTarget || needsOpponentDiscardTarget ? void openPicker() : activate())}
        >
          Vezér-képesség aktiválása
        </Button>
      )}

      {pickingTarget && needsDeckTarget && !isBringerOfDeath && (
        <div className={styles.targetPicker}>
          <p>Válassz egy időjárás-kártyát a paklidból:</p>
          {revealedDeck === null && <p>Pakli lekérése…</p>}
          {revealedDeck !== null && revealedDeck.filter((c) => getCardDef(c.defId).kind === 'Weather').length === 0 && (
            <p>Nincs időjárás-kártya a paklidban.</p>
          )}
          {(revealedDeck ?? [])
            .filter((c) => getCardDef(c.defId).kind === 'Weather')
            .map((c) => (
              <CardTile key={c.instanceId} instance={c} size="medium" onClick={() => activate(c.instanceId)} />
            ))}
          <Button variant="secondary" onClick={closePicker}>
            Mégse
          </Button>
        </div>
      )}

      {pickingTarget && isBringerOfDeath && (
        <div className={styles.targetPicker}>
          <p>Válassz 2 lapot a kezedből, amit eldobsz ({selectedDiscards.length}/2):</p>
          {player.hand.map((c) => (
            <CardTile
              key={c.instanceId}
              instance={c}
              size="medium"
              selected={selectedDiscards.includes(c.instanceId)}
              disabled={selectedDiscards.length >= 2 && !selectedDiscards.includes(c.instanceId)}
              onClick={() =>
                setSelectedDiscards((prev) =>
                  prev.includes(c.instanceId) ? prev.filter((id) => id !== c.instanceId) : [...prev, c.instanceId],
                )
              }
            />
          ))}
          {selectedDiscards.length === 2 && (
            <>
              <p>Válassz 1 lapot a pakliból, amit felhúzol:</p>
              {revealedDeck === null && <p>Pakli lekérése…</p>}
              {(revealedDeck ?? []).map((c) => (
                <CardTile key={c.instanceId} instance={c} size="medium" onClick={() => activate(c.instanceId, selectedDiscards)} />
              ))}
            </>
          )}
          <Button variant="secondary" onClick={closePicker}>
            Mégse
          </Button>
        </div>
      )}

      {pickingTarget && needsOwnDiscardTarget && (
        <div className={styles.targetPicker}>
          <p>Válassz egy lapot a dobott lapjaid közül:</p>
          {player.discard.length === 0 && <p>Üres a dobott lapok kupaca.</p>}
          {player.discard.map((c) => (
            <CardTile key={c.instanceId} instance={c} size="medium" onClick={() => activate(c.instanceId)} />
          ))}
          <Button variant="secondary" onClick={() => setPickingTarget(false)}>
            Mégse
          </Button>
        </div>
      )}

      {pickingTarget && needsOpponentDiscardTarget && (
        <div className={styles.targetPicker}>
          <p>Válassz egy lapot az ellenfél dobott lapjai közül:</p>
          {getOpponent(state, playerId).discard.length === 0 && <p>Üres az ellenfél dobott lapok kupaca.</p>}
          {getOpponent(state, playerId).discard.map((c) => (
            <CardTile key={c.instanceId} instance={c} size="medium" onClick={() => activate(c.instanceId)} />
          ))}
          <Button variant="secondary" onClick={() => setPickingTarget(false)}>
            Mégse
          </Button>
        </div>
      )}
    </div>
  );
}
