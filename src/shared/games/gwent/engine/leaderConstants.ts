/**
 * `LeaderDef.abilityId` is generated identically to `LeaderDef.id` (see
 * leaderDefs.ts) — these constants are the single source of truth for those
 * strings across rules.ts/leaderPassives.ts/leaderAbilities.ts, so a typo
 * can't silently create a leader whose ability never fires. Grouped by
 * resolution category — see docs/gwent-0a-specifikacio.md §"Gwent-0a.2":
 * A) one-shot, ACTIVATE_LEADER_ABILITY, consumes the turn (leaderAbilities.ts)
 * B) passive, always-on modifier, no action (leaderPassives.ts)
 * C) automatic at match start, no action (initialState.ts)
 */

// Category A — one-shot
export const FOLTEST_KING_OF_TEMERIA = 'northern-realms-foltest-king-of-temeria';
export const FOLTEST_LORD_COMMANDER_OF_THE_NORTH = 'northern-realms-foltest-lord-commander-of-the-north';
export const FOLTEST_SON_OF_MEDELL = 'northern-realms-foltest-son-of-medell';
export const FOLTEST_THE_STEEL_FORGED = 'northern-realms-foltest-the-steel-forged';
export const EMHYR_HIS_IMPERIAL_MAJESTY = 'nilfgaard-emhyr-var-emreis-his-imperial-majesty';
export const EMHYR_EMPEROR_OF_NILFGAARD = 'nilfgaard-emhyr-var-emreis-emperor-of-nilfgaard';
export const EMHYR_THE_RELENTLESS = 'nilfgaard-emhyr-var-emreis-the-relentless';
export const EREDIN_BRINGER_OF_DEATH = 'monsters-eredin-bringer-of-death';
export const EREDIN_COMMANDER_OF_THE_RED_RIDERS = 'monsters-eredin-commander-of-the-red-riders';
export const EREDIN_DESTROYER_OF_WORLDS = 'monsters-eredin-destroyer-of-worlds';
export const FRANCESCA_PUREBLOOD_ELF = 'scoiatael-francesca-findabair-pureblood-elf';
export const FRANCESCA_QUEEN_OF_DOL_BLATHANNA = 'scoiatael-francesca-findabair-queen-of-dol-blathanna';

// Category B — passive
export const FOLTEST_THE_SIEGEMASTER = 'northern-realms-foltest-the-siegemaster';
export const EREDIN_KING_OF_THE_WILD_HUNT = 'monsters-eredin-king-of-the-wild-hunt';
export const FRANCESCA_THE_BEAUTIFUL = 'scoiatael-francesca-findabair-the-beautiful';
export const EREDIN_BREACC_GLAS_THE_TREACHEROUS = 'monsters-eredin-breacc-glas-the-treacherous';
export const EMHYR_INVADER_OF_THE_NORTH = 'nilfgaard-emhyr-var-emreis-invader-of-the-north';
export const FRANCESCA_HOPE_OF_THE_AEN_SEIDHE = 'scoiatael-francesca-findabair-hope-of-the-aen-seidhe';
/**
 * Real playtest correction (2026-08-08): originally modeled as a Category A
 * one-shot (ACTIVATE_LEADER_ABILITY) — wrong. It's passive and always-on
 * from the start of the match: the OPPONENT's entire leader ability (one-
 * shot, passive, or match-start-automatic alike) is canceled for the whole
 * match, no activation needed. See leaderPassives.ts's `isLeaderAbilityCanceled`
 * — every other category A/B/C check routes through it.
 */
export const EMHYR_THE_WHITE_FLAME = 'nilfgaard-emhyr-var-emreis-the-white-flame';

// Category C — automatic at match start
export const FRANCESCA_DAISY_OF_THE_VALLEY = 'scoiatael-francesca-findabair-daisy-of-the-valley';
