import { useEffect, useState, type CSSProperties } from 'react';
import { assetUrl } from '../../../../core/assetUrl';
import { Modal } from '../../../../ui-kit/Modal';
import { Button } from '../../../../ui-kit/Button';
import { useGameTheme } from '../../../../shell/useGameTheme';
import { CARD_TEXT_HU, LEADER_TEXT_HU } from '../../../../../shared/games/gwent/engine/cardTextTranslations';
import { getCardDef } from '../../../../../shared/games/gwent/engine/cardDefs';
import type { CardInstance } from '../../../../../shared/games/gwent/engine/state';
import type { CardDef, LeaderDef } from '../../../../../shared/games/gwent/engine/types';
import { ABILITY_DESCRIPTIONS_HU, ABILITY_LABELS_HU, CARD_KIND_LABELS_HU, cardMechanicLine, cardMechanicTag, rowLabel } from '../cardDisplay';
import { factionLabel } from '../factionDisplay';
import { pickVariant } from './cardArtVariant';
import styles from './CardCarouselModal.module.css';

/**
 * `card` = a live board/hand/discard `CardInstance` (variant art picked via
 * `pickVariant`, same as the small tile). `catalog` = a bare `CardDef` with
 * no live instance (deck-builder collection browsing — always shows
 * `imagePaths[0]`, there's no instanceId to hash a variant from).
 */
export type CarouselEntry = { type: 'card'; instance: CardInstance } | { type: 'catalog'; def: CardDef } | { type: 'leader'; leader: LeaderDef };

function cardDefOf(entry: CarouselEntry): CardDef | null {
  if (entry.type === 'card') return getCardDef(entry.instance.defId);
  if (entry.type === 'catalog') return entry.def;
  return null;
}

export interface CardCarouselModalProps {
  /** null = closed. A GROUP's cards only (hand, one discard pile, one board row, active weather, …) — never mix groups (Gwent-0d §4. pont). Pass a fresh array each time the modal opens; a length-1 array degenerates to a plain centered view with no side cards/nav. */
  entries: CarouselEntry[] | null;
  /** Which entry starts active — the one the user actually clicked. */
  initialIndex?: number;
  onClose: () => void;
  /** Turns this read-only inspector into a confirm-before-committing step (mulligan redraw) — omitted everywhere else. */
  onConfirm?: (entry: CarouselEntry) => void;
  confirmLabel?: string;
  isConfirmDisabled?: (entry: CarouselEntry) => boolean;
}

function entryKey(entry: CarouselEntry): string {
  if (entry.type === 'card') return entry.instance.instanceId;
  if (entry.type === 'catalog') return entry.def.id;
  return entry.leader.id;
}

function entryImagePath(entry: CarouselEntry): string {
  if (entry.type === 'leader') return entry.leader.imagePaths[0];
  if (entry.type === 'catalog') return entry.def.imagePaths[0];
  return pickVariant(entry.instance, getCardDef(entry.instance.defId).imagePaths);
}

function entryName(entry: CarouselEntry): string {
  const def = cardDefOf(entry);
  return def ? def.name : (entry as { leader: LeaderDef }).leader.name;
}

const MAX_VISIBLE_OFFSET = 6;

/** The "center active, others recede in 3D" arrangement the reference client's redraw screen uses — pure CSS transforms, no extra libs. */
function slotStyle(offset: number): CSSProperties {
  const clamped = Math.max(-MAX_VISIBLE_OFFSET, Math.min(MAX_VISIBLE_OFFSET, offset));
  const translateX = clamped * 6.25;
  const translateZ = -Math.abs(clamped) * 3.25;
  const rotateY = clamped * -12;
  const scale = 1 - Math.abs(clamped) * 0.11;
  const opacity = offset === 0 ? 1 : Math.max(0, 1 - Math.abs(offset) * 0.2);
  return {
    transform: `translate(-50%, -50%) translateX(${translateX}rem) translateZ(${translateZ}rem) rotateY(${rotateY}deg) scale(${scale})`,
    opacity,
    zIndex: 100 - Math.abs(clamped),
  };
}

interface ActiveCarouselDetail {
  safeIndex: number;
  activeEntry: CarouselEntry | null;
  activeCardDef: CardDef | null;
  flavorHu: string | undefined;
  mechanicLine: string | null;
}

/** Every value that depends on `entries`/`activeIndex` computed in one place — extracted purely to keep `CardCarouselModal` itself under the project's complexity-10 ESLint limit (a separate function is a separate complexity budget). */
function deriveActiveDetail(entries: CarouselEntry[] | null, activeIndex: number): ActiveCarouselDetail {
  const safeIndex = entries ? Math.min(Math.max(activeIndex, 0), entries.length - 1) : 0;
  const activeEntry = entries ? entries[safeIndex] : null;
  const activeCardDef = activeEntry ? cardDefOf(activeEntry) : null;
  const flavorHu = activeEntry
    ? activeCardDef
      ? CARD_TEXT_HU[activeCardDef.id]
      : LEADER_TEXT_HU[(activeEntry as { leader: LeaderDef }).leader.id]
    : undefined;
  const mechanicLine = activeCardDef ? cardMechanicLine(activeCardDef) : null;
  return { safeIndex, activeEntry, activeCardDef, flavorHu, mechanicLine };
}

interface CarouselNavProps {
  count: number;
  safeIndex: number;
  onPrev: () => void;
  onNext: () => void;
}

/** Degenerates to nothing for a single-entry group (Gwent-0d §4: "egyelemű csoportnál is ugyanez a felület, csak oldal-kártyák nélkül"). */
function CarouselNav({ count, safeIndex, onPrev, onNext }: CarouselNavProps) {
  if (count <= 1) return null;
  return (
    <div className={styles.navRow}>
      <button type="button" className={styles.navButton} disabled={safeIndex === 0} onClick={onPrev} aria-label="Előző lap">
        ‹
      </button>
      <span className={styles.navCount}>
        {safeIndex + 1} / {count}
      </span>
      <button type="button" className={styles.navButton} disabled={safeIndex === count - 1} onClick={onNext} aria-label="Következő lap">
        ›
      </button>
    </div>
  );
}

/** The `<dl>` facts block (erő/sor/típus/képességek/frakció) — split out of `CarouselInfoPanel` for the same complexity-budget reason as `CarouselNav`. */
function CarouselFacts({ activeCardDef, activeEntry }: { activeCardDef: CardDef | null; activeEntry: CarouselEntry }) {
  return (
    <dl className={styles.factsList}>
      {activeCardDef && (
        <>
          {activeCardDef.basePower !== null && (
            <div className={styles.fact}>
              <dt>Erő</dt>
              <dd>{activeCardDef.basePower}</dd>
            </div>
          )}
          {rowLabel(activeCardDef.row) && (
            <div className={styles.fact}>
              <dt>Sor</dt>
              <dd>{rowLabel(activeCardDef.row)}</dd>
            </div>
          )}
          <div className={styles.fact}>
            <dt>Típus</dt>
            <dd>{CARD_KIND_LABELS_HU[activeCardDef.kind]}</dd>
          </div>
          {activeCardDef.abilities.length > 0 && (
            <div className={styles.fact}>
              <dt>Képességek</dt>
              <dd>{activeCardDef.abilities.map((a) => ABILITY_LABELS_HU[a]).join(', ')}</dd>
            </div>
          )}
        </>
      )}
      {activeEntry.type === 'leader' && (
        <div className={styles.fact}>
          <dt>Frakció</dt>
          <dd>{factionLabel(activeEntry.leader.faction)}</dd>
        </div>
      )}
    </dl>
  );
}

interface CarouselInfoPanelProps {
  activeEntry: CarouselEntry;
  activeCardDef: CardDef | null;
  flavorHu: string | undefined;
  onConfirm?: (entry: CarouselEntry) => void;
  confirmLabel: string;
  isConfirmDisabled?: (entry: CarouselEntry) => boolean;
}

/** The name + facts + ability description + flavor quote + confirm button column — split out of `CardCarouselModal` for the same complexity-budget reason as `CarouselNav`. */
function CarouselInfoPanel({ activeEntry, activeCardDef, flavorHu, onConfirm, confirmLabel, isConfirmDisabled }: CarouselInfoPanelProps) {
  return (
    <div className={styles.info}>
      <h2 className={styles.name}>{entryName(activeEntry)}</h2>
      <CarouselFacts activeCardDef={activeCardDef} activeEntry={activeEntry} />
      {activeEntry.type === 'leader' && <p className={styles.mechanicText}>{activeEntry.leader.abilityDescription}</p>}
      {flavorHu && (
        <blockquote className={styles.cardText} lang="hu">
          {flavorHu}
        </blockquote>
      )}
      {onConfirm && (
        <div className={styles.footer}>
          <Button disabled={isConfirmDisabled?.(activeEntry)} onClick={() => onConfirm(activeEntry)}>
            {confirmLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

/** The right-hand "Képességek magyarázata" panel — only rendered when there's actually something to explain (real abilities or a unique mechanic like RowScorch). Split out for the same complexity-budget reason as `CarouselNav`. */
function CarouselMechanicsPanel({ activeCardDef, mechanicLine }: { activeCardDef: CardDef | null; mechanicLine: string | null }) {
  if (!activeCardDef || (activeCardDef.abilities.length === 0 && mechanicLine === null)) return null;
  return (
    <div className={styles.abilitiesPanel}>
      <p className={styles.abilitiesPanelTitle}>Képességek magyarázata</p>
      {activeCardDef.abilities.map((a) => (
        <p key={a} className={styles.abilityEntry}>
          <strong>{ABILITY_LABELS_HU[a]}</strong>
          {ABILITY_DESCRIPTIONS_HU[a]}
        </p>
      ))}
      {mechanicLine && (
        <p className={styles.abilityEntry}>
          <strong>{cardMechanicTag(activeCardDef)}</strong>
          {mechanicLine}
        </p>
      )}
    </div>
  );
}

/**
 * Gwent-0d §4/§2 — the ONE reusable "look at a pile of cards" surface,
 * replacing the earlier one-card-at-a-time CardDetailModal, LeaderDetailModal
 * and DiscardPileModal, plus MulliganScreen's redraw picker. Center entry is
 * shown full-size with its facts/Hungarian translation below; the rest of
 * the group recedes to the sides in a shallow 3D arc, exactly like the
 * reference client's card-redraw screen — clicking a side card (or the
 * `‹`/`›` buttons) makes it active. No keyboard/controller hints anywhere —
 * every action here is a real, visible, clickable element.
 */
export function CardCarouselModal({ entries, initialIndex = 0, onClose, onConfirm, confirmLabel = 'Kiválaszt', isConfirmDisabled }: CardCarouselModalProps) {
  const themeClass = useGameTheme('gwent');
  const [activeIndex, setActiveIndex] = useState(initialIndex);

  // Re-centers on whatever the caller clicked every time a NEW group opens —
  // callers pass a fresh `entries` array per open, so this fires exactly once
  // per open; `initialIndex` deliberately excluded (it's only meant to seed
  // the very moment a group opens, not re-fire on every render).
  useEffect(() => {
    if (entries) setActiveIndex(initialIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  const { safeIndex, activeEntry, activeCardDef, flavorHu, mechanicLine } = deriveActiveDetail(entries, activeIndex);

  return (
    <Modal open={entries !== null} onClose={onClose} className={[themeClass, styles.wideModal].filter(Boolean).join(' ')}>
      {entries && activeEntry && (
        <>
          <div className={styles.stage}>
            {entries.map((entry, index) => {
              const offset = index - safeIndex;
              if (Math.abs(offset) > MAX_VISIBLE_OFFSET) return null;
              const isActive = index === safeIndex;
              return (
                <div
                  key={entryKey(entry)}
                  className={[styles.slot, isActive && styles.activeSlot].filter(Boolean).join(' ')}
                  style={slotStyle(offset)}
                  onClick={isActive ? undefined : () => setActiveIndex(index)}
                  role={isActive ? undefined : 'button'}
                  tabIndex={isActive ? undefined : 0}
                >
                  <img className={styles.slotImage} src={assetUrl(entryImagePath(entry))} alt={entryName(entry)} />
                </div>
              );
            })}
          </div>

          <CarouselNav
            count={entries.length}
            safeIndex={safeIndex}
            onPrev={() => setActiveIndex(safeIndex - 1)}
            onNext={() => setActiveIndex(safeIndex + 1)}
          />

          <div className={styles.detail}>
            <CarouselInfoPanel
              activeEntry={activeEntry}
              activeCardDef={activeCardDef}
              flavorHu={flavorHu}
              onConfirm={onConfirm}
              confirmLabel={confirmLabel}
              isConfirmDisabled={isConfirmDisabled}
            />
            <CarouselMechanicsPanel activeCardDef={activeCardDef} mechanicLine={mechanicLine} />
          </div>
        </>
      )}
    </Modal>
  );
}
