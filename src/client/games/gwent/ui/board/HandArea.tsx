import { getCardDef } from '@shared/games/gwent/engine/cardDefs';
import { HIDDEN_CARD_DEF_ID } from '@shared/games/gwent/engine/specialCardIds';
import type { CardInstance, PlayerId } from '@shared/games/gwent/engine/state';
import { TrackedCardTile } from './cardFlight';
import { useHandFan } from './useHandFan';
import styles from './matchBoard.module.css';

const MIN_VISIBLE_PX = 26;

export interface HandAreaProps {
  hand: CardInstance[];
  ownerId: PlayerId;
  playableInstanceIds: Set<string>;
  selectedInstanceId: string | null;
  onSelectCard: (instanceId: string) => void;
}

/**
 * A face-up fan of the acting player's hand — purely presentational,
 * MatchBoard owns the play-flow state machine (row/target/medic follow-ups)
 * AND decides what a click MEANS (select-for-play vs. inspect, depending on
 * its own "Nézegetés" mode toggle — Gwent-0c.2 §K). Cards overlap instead of
 * wrapping to a second row (Gwent-0c.2 §L/§O': up to ~15 cards expected,
 * more should degrade gracefully, never wrap).
 */
export function HandArea({ hand, ownerId, playableInstanceIds, selectedInstanceId, onSelectCard }: HandAreaProps) {
  const { containerRef, overlapPx, needsScroll } = useHandFan(hand.length, MIN_VISIBLE_PX);

  return (
    <div className={[styles.handArea, needsScroll && styles.handAreaScrollable].filter(Boolean).join(' ')} ref={containerRef}>
      {hand.map((instance, index) => {
        const basePower = instance.defId === HIDDEN_CARD_DEF_ID ? null : getCardDef(instance.defId).basePower;
        return (
          <TrackedCardTile
            key={instance.instanceId}
            instance={instance}
            ownerId={ownerId}
            power={basePower ?? undefined}
            size="hand"
            selected={instance.instanceId === selectedInstanceId}
            disabled={!playableInstanceIds.has(instance.instanceId)}
            onClick={() => onSelectCard(instance.instanceId)}
            style={index > 0 ? { marginLeft: -overlapPx } : undefined}
          />
        );
      })}
    </div>
  );
}
