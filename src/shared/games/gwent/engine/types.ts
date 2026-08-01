/**
 * Card-catalog types for Gwent-0a.1 (deck-building) — see docs/gwent-0a-specifikacio.md §3.1/§4.5.
 * `CardInstance`/`PlayerState`/`GwentState` (the actual match engine) are Gwent-0a.2 scope,
 * not needed yet for deck-building and deliberately not defined here.
 */

export type Faction = 'NorthernRealms' | 'Nilfgaard' | 'Monsters' | 'Scoiatael';
// Neutral cards (playable in any faction's deck) use faction: 'Neutral'.

export type Row = 'Melee' | 'Ranged' | 'Siege';

export type CardKind = 'Unit' | 'Weather' | 'Decoy' | 'Horn' | 'Scorch';

export type UnitAbility = 'Hero' | 'Spy' | 'TightBond' | 'Muster' | 'MoraleBoost' | 'Medic' | 'Agile';

/**
 * Card-specific mechanic found outside the official "Card Abilities" list
 * (Schirrú/Toad/Villentretenmerth only) — see 0a-spec §4.3.
 */
export interface RowScorchEffect {
  targetRow: Row;
  threshold: number;
}

/** Static card-catalog entry — follows the Ramses `treasureConfigs.ts` pattern, not game state. */
export interface CardDef {
  id: string;
  name: string;
  faction: Faction | 'Neutral';
  kind: CardKind;
  row: Row | null; // null for non-unit cards AND Agile units (no fixed row — see `abilities`)
  basePower: number | null; // null for non-unit cards
  abilities: UnitAbility[];
  /** Additive Muster partners BEYOND same-`id` copies — see 0a-spec §4.2 (Crone/Vampire/Gaunter O'Dimm groups). */
  mustersWithIds: string[];
  rowScorch: RowScorchEffect | null;
  weatherRow: Row | 'AllRows' | null; // Weather-kind only
  /**
   * Hungarian, player-facing description of a card-unique mechanic that isn't captured by
   * `abilities`/`rowScorch` (e.g. Dandelion's built-in Horn-like row-doubling, Cow's
   * Bovine Defense Force replacement) — see 0a-spec §4.4. Null for every other card; NOT
   * a substitute for `rowScorch` (that stays structured, this is only for the two cards
   * that have no structured field to hang a UI description off of).
   */
  specialText: string | null;
  /**
   * Literal, verbatim English text printed on the physical/in-game card (ability
   * description and/or flavor quote, whichever is actually shown) — sourced via
   * web research (thewitcher3.wiki.fextralife.com primarily), never invented, see
   * 0a-spec §9.7. Purely for player-facing display (card-detail view), never read
   * by engine logic — `abilities`/`rowScorch`/`specialText` remain the source of
   * truth for rules.
   */
  cardText: string | null;
  copies: number; // official rulebook copy count, NOT physical card-image-file count — see 0a-spec §5.1
  imagePaths: string[]; // 1+ unique art variants — client picks deterministically per CardInstance (see 0a-spec §5.2)
}

/**
 * Leader card — separate catalog from `CardDef`, because it's not part of the draw
 * deck (no `copies`, always exactly 1, chosen once before the match) — see 0a-spec §4.5.
 */
export interface LeaderDef {
  id: string;
  name: string;
  faction: Faction;
  abilityId: string; // indexes the reducer's own LEADER_ABILITIES lookup table (Gwent-0a.2)
  abilityDescription: string; // Hungarian, player-facing
  /** Literal, verbatim English ability text — see the matching CardDef.cardText doc comment. */
  cardText: string | null;
  imagePaths: string[];
}
