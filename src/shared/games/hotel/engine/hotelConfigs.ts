import type { BoardSpace, HotelConfig, SpecialLane } from './state';

/**
 * The 8 named hotels — exact data from docs/hotel-0a-specifikacio.md §2,
 * confirmed against the physical game. Config data, not hardcoded logic, so
 * a future rules correction is a data edit, not a reducer rewrite.
 */
export const HOTEL_CONFIGS: HotelConfig[] = [
  {
    id: 'waikiki',
    name: 'Waikiki',
    lotPrice: 2500,
    staircasePrice: 200,
    buildingPrices: [3500, 2500, 2500, 1750, 1750],
    gardenPrice: 2500,
    nightlyRates: [
      [200, 400, 600, 800, 1000, 1200],
      [350, 700, 1050, 1400, 1750, 2100],
      [500, 1000, 1500, 2000, 2500, 3000],
      [500, 1000, 1500, 2000, 2500, 3000],
      [650, 1300, 1950, 2600, 3250, 3900],
    ],
    gardenNightlyRates: [1000, 2000, 3000, 4000, 5000, 6000],
  },
  {
    id: 'royal',
    name: 'Royal',
    lotPrice: 2500,
    staircasePrice: 200,
    buildingPrices: [3600, 2600, 1800, 1800],
    gardenPrice: 3000,
    nightlyRates: [
      [150, 300, 450, 600, 750, 900],
      [300, 600, 900, 1200, 1500, 1800],
      [300, 600, 900, 1200, 1500, 1800],
      [450, 900, 1350, 1800, 2250, 2700],
    ],
    gardenNightlyRates: [600, 1200, 1800, 2400, 3000, 3600],
  },
  {
    id: 'letoile',
    name: "L'etoile",
    lotPrice: 3000,
    staircasePrice: 250,
    buildingPrices: [3300, 2200, 1800, 1800, 1800],
    gardenPrice: 4000,
    nightlyRates: [
      [150, 300, 450, 600, 750, 900],
      [300, 600, 900, 1200, 1500, 1800],
      [300, 600, 900, 1200, 1500, 1800],
      [300, 600, 900, 1200, 1500, 1800],
      [450, 900, 1350, 1800, 2250, 2700],
    ],
    gardenNightlyRates: [750, 1500, 2250, 3000, 3750, 4500],
  },
  {
    id: 'boomerang',
    name: 'Boomerang',
    lotPrice: 500,
    staircasePrice: 100,
    buildingPrices: [1800],
    gardenPrice: 250,
    nightlyRates: [[400, 800, 1200, 1600, 2000, 2400]],
    gardenNightlyRates: [600, 1200, 1800, 2400, 3000, 3600],
  },
  {
    id: 'tajmahal',
    name: 'Taj Mahal',
    lotPrice: 1500,
    staircasePrice: 100,
    buildingPrices: [2400, 1000, 500],
    gardenPrice: 1000,
    nightlyRates: [
      [100, 200, 300, 400, 500, 600],
      [100, 200, 300, 400, 500, 600],
      [200, 400, 600, 800, 1000, 1200],
    ],
    gardenNightlyRates: [300, 600, 900, 1200, 1500, 1800],
  },
  {
    id: 'safari',
    name: 'Safari',
    lotPrice: 2000,
    staircasePrice: 150,
    buildingPrices: [2600, 1200, 1200],
    gardenPrice: 2000,
    nightlyRates: [
      [100, 200, 300, 400, 500, 600],
      [100, 200, 300, 400, 500, 600],
      [250, 500, 750, 1000, 1250, 1500],
    ],
    gardenNightlyRates: [500, 1000, 1500, 2000, 2500, 3000],
  },
  {
    id: 'president',
    name: 'President',
    lotPrice: 3500,
    staircasePrice: 250,
    buildingPrices: [5000, 3000, 2250, 1750],
    gardenPrice: 5000,
    nightlyRates: [
      [200, 400, 600, 800, 1000, 1200],
      [400, 800, 1200, 1600, 2000, 2400],
      [600, 1200, 1800, 2400, 3000, 3600],
      [800, 1600, 2400, 3200, 4000, 4800],
    ],
    gardenNightlyRates: [1100, 2200, 3300, 4400, 5500, 6600],
  },
  {
    id: 'fujiyama',
    name: 'Fujiyama',
    lotPrice: 1000,
    staircasePrice: 100,
    buildingPrices: [2200, 1400, 1400],
    gardenPrice: 500,
    nightlyRates: [
      [100, 200, 300, 400, 500, 600],
      [100, 200, 300, 400, 500, 600],
      [200, 400, 600, 800, 1000, 1200],
    ],
    gardenNightlyRates: [400, 800, 1200, 1600, 2000, 2400],
  },
];

/**
 * The confirmed 31-space board layout (docs/hotel-0a-specifikacio.md §3.1),
 * clockwise from Start. A specific, non-repeating real layout — written out
 * literally rather than generated from a per-region template, since it
 * doesn't follow one.
 */
export const BOARD_SPACES: BoardSpace[] = [
  { id: 'space-1', type: 'START', adjacentLotIds: [], staircaseForLotId: null },
  { id: 'space-2', type: 'CONSTRUCTION', adjacentLotIds: ['fujiyama'], staircaseForLotId: null },
  { id: 'space-3', type: 'PURCHASE', adjacentLotIds: ['fujiyama', 'boomerang'], staircaseForLotId: null },
  { id: 'space-4', type: 'CONSTRUCTION', adjacentLotIds: ['fujiyama', 'boomerang'], staircaseForLotId: null },
  { id: 'space-5', type: 'PURCHASE', adjacentLotIds: ['fujiyama', 'boomerang'], staircaseForLotId: null },
  { id: 'space-6', type: 'CONSTRUCTION', adjacentLotIds: ['fujiyama', 'boomerang'], staircaseForLotId: null },
  { id: 'space-7', type: 'FREE_STAIRCASE', adjacentLotIds: ['fujiyama'], staircaseForLotId: null },
  { id: 'space-8', type: 'CONSTRUCTION', adjacentLotIds: [], staircaseForLotId: null },
  { id: 'space-9', type: 'PURCHASE', adjacentLotIds: ['letoile'], staircaseForLotId: null },
  { id: 'space-10', type: 'PURCHASE', adjacentLotIds: ['letoile', 'president'], staircaseForLotId: null },
  { id: 'space-11', type: 'FREE_BUILDING', adjacentLotIds: ['letoile', 'president'], staircaseForLotId: null },
  { id: 'space-12', type: 'PURCHASE', adjacentLotIds: ['royal', 'president'], staircaseForLotId: null },
  { id: 'space-13', type: 'CONSTRUCTION', adjacentLotIds: ['royal', 'president'], staircaseForLotId: null },
  { id: 'space-14', type: 'PURCHASE', adjacentLotIds: ['royal', 'president'], staircaseForLotId: null },
  { id: 'space-15', type: 'CONSTRUCTION', adjacentLotIds: ['royal', 'president'], staircaseForLotId: null },
  { id: 'space-16', type: 'PURCHASE', adjacentLotIds: ['royal', 'president'], staircaseForLotId: null },
  { id: 'space-17', type: 'CONSTRUCTION', adjacentLotIds: ['royal', 'waikiki'], staircaseForLotId: null },
  { id: 'space-18', type: 'PURCHASE', adjacentLotIds: ['royal', 'waikiki'], staircaseForLotId: null },
  { id: 'space-19', type: 'FREE_STAIRCASE', adjacentLotIds: ['royal', 'waikiki'], staircaseForLotId: null },
  { id: 'space-20', type: 'CONSTRUCTION', adjacentLotIds: ['royal', 'waikiki'], staircaseForLotId: null },
  { id: 'space-21', type: 'PURCHASE', adjacentLotIds: ['royal', 'waikiki'], staircaseForLotId: null },
  { id: 'space-22', type: 'PURCHASE', adjacentLotIds: ['tajmahal', 'letoile'], staircaseForLotId: null },
  { id: 'space-23', type: 'CONSTRUCTION', adjacentLotIds: ['tajmahal', 'letoile'], staircaseForLotId: null },
  { id: 'space-24', type: 'PURCHASE', adjacentLotIds: ['tajmahal', 'letoile'], staircaseForLotId: null },
  { id: 'space-25', type: 'FREE_BUILDING', adjacentLotIds: ['tajmahal', 'letoile'], staircaseForLotId: null },
  { id: 'space-26', type: 'CONSTRUCTION', adjacentLotIds: ['tajmahal'], staircaseForLotId: null },
  { id: 'space-27', type: 'CONSTRUCTION', adjacentLotIds: ['safari'], staircaseForLotId: null },
  { id: 'space-28', type: 'CONSTRUCTION', adjacentLotIds: ['safari'], staircaseForLotId: null },
  { id: 'space-29', type: 'PURCHASE', adjacentLotIds: ['safari', 'letoile'], staircaseForLotId: null },
  { id: 'space-30', type: 'FREE_STAIRCASE', adjacentLotIds: ['safari', 'letoile'], staircaseForLotId: null },
  { id: 'space-31', type: 'CONSTRUCTION', adjacentLotIds: ['safari'], staircaseForLotId: null },
];

/** "2000" lane after space-7 (index 6), "staircase purchase right" lane after space-26 (index 25). */
export const SPECIAL_LANES: SpecialLane[] = [
  { afterSpaceIndex: 6, effect: 'BONUS_2000' },
  { afterSpaceIndex: 25, effect: 'STAIRCASE_PURCHASE_RIGHT' },
];
