import { useEffect, useState, type ReactNode } from 'react';
import { assetUrl } from '../../../core/assetUrl';
import { getLeaderDef, LEADER_DEFS } from '../../../../shared/games/gwent/engine/leaderDefs';
import type { Faction } from '../../../../shared/games/gwent/engine/types';
import {
  MIN_NON_HERO_UNIT_CARDS,
  validateDeckDraft,
  type DeckCardCounts,
  type GwentDeckDraft,
} from '../../../../shared/games/gwent/engine/deckRules';
import { computeDeckStats } from './cardDisplay';
import { loadPersistedGwentDeck } from './gwentDeckPersistence';
import { CardCarouselModal, type CarouselEntry } from './board/CardCarouselModal';
import { DeckStep } from './DeckStep';
import { FactionStep } from './FactionStep';
import { LeaderStep } from './LeaderStep';
import styles from './GwentSetupPage.module.css';

export interface GwentDeckBuilderProps {
  /** Rendered at the top of `.setupPanel`, above the faction picker — the caller's player-name input (Gwent-0c.4 §A: the name input moves INSIDE the same styled panel as the faction/leader pickers, not a separate loose element above it). */
  nameInput: ReactNode;
  /** Fires on every change with the current draft once faction+leader+a fully valid deck are all chosen, or null the moment any of that stops being true. */
  onValidDraftChange: (draft: GwentDeckDraft | null) => void;
}

/**
 * The faction + leader + deck builder body — extracted from Gwent-0a.1's
 * `GwentSetupPage` (2026-08-04) so `GwentMatchSetupPage` can run two
 * independent instances of it (one per hot-seat player) without duplicating
 * any of the deck-building logic. `DeckStep`/`FactionStep`/`LeaderStep`/
 * `CardGrid` are unchanged.
 *
 * Gwent-0c.4 §A: no longer a `faction`→`leader`→`deck` step-wizard — the
 * felhasználó wants "egy oldalon" (one page): all three sections render
 * together now, top to bottom, inside `.setupPanel`/the deck grid below it.
 *
 * Gwent-0c.3 §2: a saved deck is now looked up PER FACTION (both here AND
 * in gwentDeckPersistence.ts) — picking a faction that has a persisted save
 * seeds its leader/card-counts automatically, exactly like the old
 * single-slot `persisted` prop used to for whichever faction happened to be
 * saved last. Applies equally to BOTH hot-seat players now, not just
 * "whichever builder is shown first".
 */
export function GwentDeckBuilder({ nameInput, onValidDraftChange }: GwentDeckBuilderProps) {
  const [faction, setFaction] = useState<Faction | null>(null);
  // Keyed by faction (not a single flat value) so switching faction/leader mid-build never
  // discards another faction's already-picked leader/cards (0a-spec §9.5 kérés, 2026-08-01).
  const [leaderIdByFaction, setLeaderIdByFaction] = useState<Partial<Record<Faction, string>>>({});
  const [cardCountsByFaction, setCardCountsByFaction] = useState<Partial<Record<Faction, DeckCardCounts>>>({});
  // Gwent-0d §4: read-only leader-card zoom for the middle column's selected-leader art — same "click the card to open the carousel" pattern as LeaderAbilityPanel's board version.
  const [leaderZoomOpen, setLeaderZoomOpen] = useState(false);

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

  // No more step-jumping (Gwent-0c.4 §A) — picking/switching a faction is the
  // same operation either way now: apply a persisted deck if this session
  // hasn't touched that faction yet, else default to its first leader so the
  // deck grid below always has something to show (still freely changeable
  // via the always-visible LeaderStep grid).
  function selectFaction(next: Faction): void {
    setFaction(next);
    if (applyPersistedDeck(next)) return;
    setLeaderIdByFaction((prev) => {
      if (prev[next]) return prev;
      const defaultLeader = LEADER_DEFS.find((l) => l.faction === next);
      return defaultLeader ? { ...prev, [next]: defaultLeader.id } : prev;
    });
  }

  function selectLeader(next: string): void {
    if (!faction) return;
    setLeaderIdByFaction((prev) => ({ ...prev, [faction]: next }));
  }

  function changeCardCounts(next: DeckCardCounts): void {
    if (!faction) return;
    setCardCountsByFaction((prev) => ({ ...prev, [faction]: next }));
  }

  const selectedLeader = leaderId ? getLeaderDef(leaderId) : null;
  const stats = faction ? computeDeckStats(cardCounts, faction) : null;

  // Gwent-0d §4: the middle column (leader picker + selected leader card +
  // deck stats) is composed HERE (GwentDeckBuilder owns faction/leader/stats
  // knowledge) but physically slotted by DeckStep, between its two card
  // columns — avoids duplicating DeckStep's sort/validation state upward
  // just to split it into two separately-callable halves.
  const middleColumn = faction && (
    <>
      <LeaderStep faction={faction} leaders={LEADER_DEFS.filter((l) => l.faction === faction)} selectedLeaderId={leaderId} onSelect={selectLeader} />

      {selectedLeader && (
        <div className={styles.selectedLeader}>
          <img
            className={styles.selectedLeaderImage}
            src={assetUrl(selectedLeader.imagePaths[0])}
            alt={selectedLeader.name}
            onClick={() => setLeaderZoomOpen(true)}
          />
          <p className={styles.selectedLeaderAbility}>{selectedLeader.abilityDescription}</p>
        </div>
      )}

      {stats && (
        <dl className={styles.deckStats}>
          {/*
            Gwent-0d §4 korrekció (2026-08-06): a "Lapok" sor veszi át a törölt
            "Nem-Hero egységkártya: X/22" felirat + a "Legalább 22..."
            hibaüzenet szerepét — nem-Hero egységkártya-szám "X/22" formátumban,
            pirosra váltva, amíg nem éri el a minimumot (MIN_NON_HERO_UNIT_CARDS).
          */}
          <div>
            <dt>Lapok</dt>
            <dd className={stats.unitCount - stats.heroCount < MIN_NON_HERO_UNIT_CARDS ? styles.deckStatInvalid : undefined}>
              {stats.unitCount - stats.heroCount}/{MIN_NON_HERO_UNIT_CARDS}
            </dd>
          </div>
          <div>
            <dt>Egységek</dt>
            <dd>{stats.unitCount}</dd>
          </div>
          <div>
            <dt>Speciális</dt>
            <dd>{stats.specialCount}</dd>
          </div>
          <div>
            <dt>Hősök</dt>
            <dd>{stats.heroCount}</dd>
          </div>
          <div>
            <dt>Össz-erő</dt>
            <dd>{stats.totalPower}</dd>
          </div>
        </dl>
      )}

      <CardCarouselModal
        entries={leaderZoomOpen && selectedLeader ? ([{ type: 'leader', leader: selectedLeader }] satisfies CarouselEntry[]) : null}
        onClose={() => setLeaderZoomOpen(false)}
      />
    </>
  );

  return (
    <section className={styles.builderSection}>
      <div className={styles.setupPanel}>
        {nameInput}
        <FactionStep selectedFaction={faction} onSelect={selectFaction} />
      </div>

      {faction && leaderId && (
        <DeckStep faction={faction} leaderId={leaderId} cardCounts={cardCounts} onCardCountsChange={changeCardCounts} middleColumn={middleColumn} />
      )}
    </section>
  );
}
