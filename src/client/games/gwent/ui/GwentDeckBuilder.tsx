import { useEffect, useState, type ReactNode } from 'react';
import { assetUrl } from '../../../core/assetUrl';
import { getLeaderDef, LEADER_DEFS } from '@shared/games/gwent/engine/leaderDefs';
import type { Faction } from '@shared/games/gwent/engine/types';
import {
  MIN_NON_HERO_UNIT_CARDS,
  validateDeckDraft,
  type DeckCardCounts,
  type GwentDeckDraft,
} from '@shared/games/gwent/engine/deckRules';
import { computeDeckStats } from './cardDisplay';
import { loadPersistedGwentDeck } from './gwentDeckPersistence';
import { CardCarouselModal, type CarouselEntry } from './board/CardCarouselModal';
import { DeckStep } from './DeckStep';
import { FactionStep } from './FactionStep';
import styles from './GwentSetupPage.module.css';

export interface GwentDeckBuilderProps {
  /** Fires on every change with the current draft once faction+leader+a fully valid deck are all chosen, or null the moment any of that stops being true. */
  onValidDraftChange: (draft: GwentDeckDraft | null) => void;
  /**
   * Gwent-0d §4 korrekció (2026-08-06): a felhasználó kérése — a "Pakli
   * mentése"/"Tovább" gombok (GwentMatchSetupPage.tsx-ben élnek, onnan
   * kapják a player1Draft/matchStep stb. állapotot) a középső oszlop ALJÁRA
   * kerüljenek, hogy a Gyűjtemény/Pakliban oszlopoknak ne kelljen egy külön,
   * teljes szélességű sornak helyet hagyniuk alul. `margin-top: auto`-val
   * (.deckMiddleActions) a doboz aljához tapad.
   */
  footerActions?: ReactNode;
}

/** Extracted purely to keep `GwentDeckBuilder` under the project's complexity-10 ESLint limit — each `?:`/`??` here used to count against that one function. */
function selectedLeaderIdFor(faction: Faction | null, leaderIdByFaction: Partial<Record<Faction, string>>): string | null {
  return faction ? (leaderIdByFaction[faction] ?? null) : null;
}

/** Same reasoning as `selectedLeaderIdFor`. */
function selectedCardCountsFor(faction: Faction | null, cardCountsByFaction: Partial<Record<Faction, DeckCardCounts>>): DeckCardCounts {
  return faction ? (cardCountsByFaction[faction] ?? {}) : {};
}

function isDeckDraftValid(faction: Faction | null, leaderId: string | null, cardCounts: DeckCardCounts): boolean {
  return faction !== null && leaderId !== null && validateDeckDraft({ faction, leaderId, cardCounts }).valid;
}

interface DeckBuilderMiddleColumnProps {
  faction: Faction | null;
  leaderId: string | null;
  cardCounts: DeckCardCounts;
  leaderPickerOpen: boolean;
  onOpenLeaderPicker: () => void;
  onCloseLeaderPicker: () => void;
  onSelectLeader: (leaderId: string) => void;
  footerActions: ReactNode | undefined;
}

/**
 * The middle column's leader-card + stats + footer-actions + leader-picker
 * modal — extracted out of `GwentDeckBuilder` purely to keep that component
 * under the project's complexity-10 ESLint limit (a separate function is a
 * separate complexity budget). `faction === null` degenerates to nothing,
 * same as the inline `faction && (...)` this replaces.
 *
 * Gwent-0d §4 korrekció (2026-08-06): csak a nagy vezér-kártya látszik
 * (nincs külön kis csempesor), rákattintva egy karuszel-modál nyílik AZ
 * ADOTT FRAKCIÓ összes vezérével, "Kiválaszt" gombbal — ugyanaz a "lap
 * választó modál" minta, mint bármelyik más kártyánál (lásd DeckStep.tsx),
 * csak itt választás is jár vele (mint MulliganScreen.tsx redraw-választója).
 * A képesség-leírás is csak a modálon látszik — CardCarouselModal már
 * megjeleníti (`entry.leader.abilityDescription`), nincs szükség rá itt
 * még egyszer.
 */
function DeckBuilderMiddleColumn({
  faction,
  leaderId,
  cardCounts,
  leaderPickerOpen,
  onOpenLeaderPicker,
  onCloseLeaderPicker,
  onSelectLeader,
  footerActions,
}: DeckBuilderMiddleColumnProps) {
  if (!faction) return null;

  const selectedLeader = leaderId ? getLeaderDef(leaderId) : null;
  const stats = computeDeckStats(cardCounts, faction);
  const factionLeaders = LEADER_DEFS.filter((l) => l.faction === faction);
  const selectedLeaderIndex = Math.max(
    0,
    factionLeaders.findIndex((l) => l.id === leaderId),
  );

  return (
    <>
      {selectedLeader && (
        <img
          className={styles.selectedLeaderImage}
          src={assetUrl(selectedLeader.imagePaths[0])}
          alt={selectedLeader.name}
          onClick={onOpenLeaderPicker}
        />
      )}

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

      {footerActions && <div className={styles.deckMiddleActions}>{footerActions}</div>}

      <CardCarouselModal
        entries={leaderPickerOpen ? (factionLeaders.map((l) => ({ type: 'leader', leader: l })) satisfies CarouselEntry[]) : null}
        initialIndex={selectedLeaderIndex}
        onClose={onCloseLeaderPicker}
        confirmLabel="Kiválaszt"
        onConfirm={(entry) => {
          if (entry.type !== 'leader') return;
          onSelectLeader(entry.leader.id);
          onCloseLeaderPicker();
        }}
      />
    </>
  );
}

/**
 * The faction + leader + deck builder body — extracted from Gwent-0a.1's
 * `GwentSetupPage` (2026-08-04) so `GwentMatchSetupPage` can run two
 * independent instances of it (one per hot-seat player) without duplicating
 * any of the deck-building logic. `DeckStep`/`FactionStep` are unchanged.
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
export function GwentDeckBuilder({ onValidDraftChange, footerActions }: GwentDeckBuilderProps) {
  const [faction, setFaction] = useState<Faction | null>(null);
  // Keyed by faction (not a single flat value) so switching faction/leader mid-build never
  // discards another faction's already-picked leader/cards (0a-spec §9.5 kérés, 2026-08-01).
  const [leaderIdByFaction, setLeaderIdByFaction] = useState<Partial<Record<Faction, string>>>({});
  const [cardCountsByFaction, setCardCountsByFaction] = useState<Partial<Record<Faction, DeckCardCounts>>>({});
  // Gwent-0d §4 korrekció (2026-08-06): a kis vezér-választó csempesor
  // megszűnt — csak a nagy vezér-kártya látszik, rákattintva EGYSZERRE
  // működik nézegetőként ÉS választóként: egy karuszel az adott frakció
  // összes vezérével, "Kiválaszt" gombbal (ugyanaz a minta, mint
  // MulliganScreen.tsx redraw-választója).
  const [leaderPickerOpen, setLeaderPickerOpen] = useState(false);

  const leaderId = selectedLeaderIdFor(faction, leaderIdByFaction);
  const cardCounts = selectedCardCountsFor(faction, cardCountsByFaction);
  const isValid = isDeckDraftValid(faction, leaderId, cardCounts);

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
  // via the leader picker modal, see leaderPickerOpen).
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

  return (
    <section className={styles.builderSection}>
      <div className={styles.setupPanel}>
        <FactionStep selectedFaction={faction} onSelect={selectFaction} />
      </div>

      {faction && leaderId && (
        <DeckStep
          faction={faction}
          leaderId={leaderId}
          cardCounts={cardCounts}
          onCardCountsChange={changeCardCounts}
          middleColumn={
            <DeckBuilderMiddleColumn
              faction={faction}
              leaderId={leaderId}
              cardCounts={cardCounts}
              leaderPickerOpen={leaderPickerOpen}
              onOpenLeaderPicker={() => setLeaderPickerOpen(true)}
              onCloseLeaderPicker={() => setLeaderPickerOpen(false)}
              onSelectLeader={selectLeader}
              footerActions={footerActions}
            />
          }
        />
      )}
    </section>
  );
}
