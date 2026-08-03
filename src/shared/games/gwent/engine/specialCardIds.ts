// Card ids referenced by identity rather than by kind/ability — either
// because the mechanic is card-unique (Dandelion/Cow, see
// docs/gwent-0a-specifikacio.md §4.4) or because a leader one-shot ability
// needs to fetch one specific card out of a deck (e.g. "play a Torrential
// Rain instantly"). Centralized so a typo can't silently miss a card.

export const DANDELION_CARD_ID = 'neutral-dandelion';
export const COW_CARD_ID = 'neutral-cow';
export const BOVINE_DEFENSE_FORCE_CARD_ID = 'neutral-bovine-defense-force';
export const DECOY_CARD_ID = 'neutral-decoy';
export const SCORCH_CARD_ID = 'neutral-scorch';
export const HORN_CARD_ID = 'neutral-commander-s-horn';
export const BITING_FROST_CARD_ID = 'neutral-biting-frost'; // Melee
export const IMPENETRABLE_FOG_CARD_ID = 'neutral-impenetrable-fog'; // Ranged
export const TORRENTIAL_RAIN_CARD_ID = 'neutral-torrential-rain'; // Siege
export const CLEAR_WEATHER_CARD_ID = 'neutral-clear-weather';

/**
 * Sentinel `defId` for a masked `CardInstance` (Gwent-0b) — never a real
 * `CardDef` id, so `getCardDef` must never be called on it. The client
 * recognizes this and renders a card-back instead of looking up art — see
 * `toPublicGwentState` in rules.ts and docs/gwent-0b-multiplayer-specifikacio.md §3.2.
 */
export const HIDDEN_CARD_DEF_ID = '__hidden__';
