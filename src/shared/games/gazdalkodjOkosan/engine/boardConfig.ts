import type { BoardSpace } from './state';

/** A hitelre vásárlás feltételei — autó és lakás mezőknél egyaránt (docs/gazdalkodj-okosan-0a-specifikacio.md §2.2). */
export interface PurchaseTerms {
  cashPrice: number;
  financedTotal: number;
  downPayment: number;
  perTurnPayment: number;
}

export const CAR_PURCHASE_TERMS: PurchaseTerms = {
  cashPrice: 10000,
  financedTotal: 15000,
  downPayment: 2000,
  perTurnPayment: 500,
};

export const APARTMENT_PURCHASE_TERMS: PurchaseTerms = {
  cashPrice: 30000,
  financedTotal: 35000,
  downPayment: 15000,
  perTurnPayment: 500,
};

export const INSURANCE_PRICES: { life: number; home: number; car: number } = {
  life: 200,
  home: 100,
  car: 100,
};

export const STARTING_CASH = 18000;
export const BKV_PASS_PRICE = 200;
/** A 8-as mezőn áthaladva/rálépve jár a folyószámla-egyenleg után — docs/gazdalkodj-okosan-0a-specifikacio.md §2.1. */
export const BANK_INTEREST_RATE = 0.07;
export const CAR_THEFT_MAX_PAYOUT = 10000;
export const START_PASS_BONUS = 2000;
export const START_LAND_BONUS = 4000;
/** A "rendelkezik... euróval" győzelmi feltétel — készpénz + folyószámla-egyenleg együtt. */
export const WIN_CONDITION_MIN_WEALTH = 2000;

export const BANK_SPACE_INDEX = 8;
export const BKV_PASS_SPACE_INDEX = 2;

/**
 * A 41 mező (+ START) pontos elrendezése és mechanikai hatása — a tábla-fotó
 * (`assets/GazdalkodjOkosan/images/board.png`) és a felhasználó pontosításai
 * alapján, docs/gazdalkodj-okosan-0a-specifikacio.md §2.5. A mező-szövegek
 * (UI-ban megjelenő reklámszöveg) forrása `jatekszabaly.txt` — itt csak a
 * mechanikai hatáshoz szükséges adatok szerepelnek.
 */
const UNSORTED_BOARD_SPACES: BoardSpace[] = [
  { index: 0, type: 'START', label: 'start' },
  { index: 1, type: 'PAY', label: 'parwan', amount: 200 },
  { index: 2, type: 'BKV_PASS', label: 'bkv-berlet', amount: BKV_PASS_PRICE },
  { index: 3, type: 'CHANCE', label: 'szerencsekerek-3' },
  { index: 4, type: 'PAY', label: 'zila-kavehaz', amount: 40 },
  { index: 5, type: 'CAR_PURCHASE', label: 'citroen-c4' },
  { index: 6, type: 'PAY', label: 'mulato', amount: 100 },
  { index: 7, type: 'FLAVOR', label: 'sportolj' },
  { index: 8, type: 'BANK', label: 'otp-bank' },
  { index: 9, type: 'INSURANCE', label: 'allianz-hungaria' },
  { index: 10, type: 'CHANCE', label: 'szerencsekerek-10' },
  { index: 11, type: 'FURNITURE_PURCHASE', label: 'hanak-konyhabutor', furnitureItems: ['konyhabutor'] },
  { index: 12, type: 'FLAVOR', label: 'allat-es-novenykert' },
  { index: 13, type: 'HOSPITAL', label: 'korhaz' },
  { index: 14, type: 'PAY', label: 'deichmann', amount: 80 },
  { index: 15, type: 'EXTRA_ROLL_REWARD', label: 'bkv-jutalom', requiresBkvPass: true },
  { index: 16, type: 'CHANCE', label: 'szerencsekerek-16' },
  { index: 17, type: 'PAY', label: 'mozi', amount: 20 },
  { index: 18, type: 'PAY', label: 'alexandra', amount: 60 },
  { index: 19, type: 'APARTMENT_PURCHASE', label: 'otp-lakashitel-19' },
  { index: 20, type: 'PAY', label: 'gsm', amount: 100 },
  { index: 21, type: 'PAY', label: 'club-tihany', amount: 280 },
  { index: 22, type: 'FLAVOR', label: 'nemzeti-galeria' },
  { index: 23, type: 'CHANCE', label: 'szerencsekerek-23' },
  { index: 24, type: 'PAY', label: 'visegradi-hajokirandulas', amount: 40 },
  { index: 25, type: 'PAY', label: 'kakas-etterem', amount: 40 },
  { index: 26, type: 'FLAVOR', label: 'margitsziget' },
  { index: 27, type: 'CHANCE', label: 'szerencsekerek-27', requiresBkvPass: true },
  { index: 28, type: 'PAY', label: 'tesco', amount: 300 },
  { index: 29, type: 'FLAVOR', label: 'halaszbastya' },
  { index: 30, type: 'PAY', label: 'vista-utazasi-iroda', amount: 300 },
  { index: 31, type: 'PAY', label: 'pick', amount: 20 },
  { index: 32, type: 'CHANCE', label: 'szerencsekerek-32' },
  {
    index: 33,
    type: 'FURNITURE_PURCHASE',
    label: 'electrolux',
    furnitureItems: ['mosogep', 'hutoszekreny', 'mosogatogep', 'tuzhely'],
  },
  { index: 34, type: 'PAY', label: 'sky-europe', amount: 300 },
  { index: 35, type: 'PAY', label: 'mezesmacko', amount: 20 },
  { index: 36, type: 'PAY', label: 'mammut-mozi', amount: 20 },
  { index: 37, type: 'CHANCE', label: 'szerencsekerek-37' },
  { index: 38, type: 'FURNITURE_PURCHASE', label: 'szobabutor-uzlet', furnitureItems: ['szobabutor'] },
  { index: 39, type: 'APARTMENT_PURCHASE', label: 'otp-lakashitel-39' },
  { index: 40, type: 'PAY', label: 'invitel', amount: 20 },
  { index: 41, type: 'PAY_AND_SKIP', label: 'italbolt', amount: 20 },
];

export const BOARD_SPACES: BoardSpace[] = [...UNSORTED_BOARD_SPACES].sort((a, b) => a.index - b.index);
