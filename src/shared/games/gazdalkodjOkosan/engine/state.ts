export type PlayerId = string;

export type FurnitureItemId = 'konyhabutor' | 'mosogep' | 'hutoszekreny' | 'mosogatogep' | 'tuzhely' | 'szobabutor';

/** A hitelre vásárolt autó/lakás még hátralévő tartozása — docs/gazdalkodj-okosan-0a-specifikacio.md §2.2/§3. */
export interface InstallmentPlan {
  /** A hitelre vásárlás teljes ára (pl. autó: 15.000) — paidSoFar = totalPrice - remainingBalance (autólopás kifizetéséhez, lásd §2.6). */
  totalPrice: number;
  remainingBalance: number;
  /** 500 EUR mindkét hiteltípusnál. */
  perTurnPayment: number;
}

export type OwnershipStatus =
  | { kind: 'NONE' }
  | { kind: 'OWNED_CASH'; pricePaid: number }
  | { kind: 'FINANCED'; plan: InstallmentPlan };

export interface Player {
  id: PlayerId;
  name: string;
  cash: number;
  /**
   * null = nincs nyitva folyószámla; legfeljebb 1 db/játékos. A készpénz és a
   * számla-egyenleg KÜLÖN nyilvántartott összeg — nyitás/befizetés csak a
   * 8-as mezőn, kivétel/fizetés a számláról bárhol/bármikor (§2.1).
   */
  bankAccount: { balance: number } | null;
  /** Csak a 2-es mezőn vásárolható; feltétele a 15-ös/27-es mező hatásának. */
  hasBkvPass: boolean;
  /** Index a `board` tömbben (0 = START). */
  position: number;
  apartment: OwnershipStatus;
  car: OwnershipStatus;
  /**
   * Record, NEM Set — mezőnkénti frissítésre alkalmas, JSON/@colyseus/schema-
   * barát szerkezet (§3.1).
   */
  furniture: Record<FurnitureItemId, boolean>;
  insurance: { life: boolean; home: boolean; car: boolean };
  inHospital: boolean;
  /** Hányszor próbált már kockát dobni a kórházban, mióta bekerült — 3. próbálkozástól bármilyen dobással kiléphet. */
  hospitalRollAttempts: number;
  /** A 41-es mező (italbolt) büntetése — a következő ROLL_MOVE_DICE nem mozgat, csak elfogyasztja ezt a jelzőt. */
  skipNextRoll: boolean;
  /** A 15-ös mező jutalma (csak hasBkvPass esetén jár) — ennyi extra dobás jár még a soron lévő játékosnak, mielőtt a kör másra száll. */
  extraRollsPending: number;
  bankrupt: boolean;
}

export type SpaceType =
  | 'START'
  | 'FLAVOR' // nincs kötelezettség
  | 'PAY' // fix összeg
  | 'PAY_AND_SKIP' // fix összeg + következő dobás kimarad (41-es mező)
  | 'CHANCE'
  | 'BKV_PASS'
  | 'BANK'
  | 'INSURANCE'
  | 'CAR_PURCHASE'
  | 'APARTMENT_PURCHASE'
  | 'FURNITURE_PURCHASE'
  | 'HOSPITAL'
  | 'EXTRA_ROLL_REWARD';

export interface BoardSpace {
  index: number; // 0..41
  type: SpaceType;
  /** Rövid azonosító (pl. "zila-kavehaz") — a tényleges UI-szöveg a jatekszabaly.txt assetből töltendő be, itt nincs kódba égetve. */
  label: string;
  /** PAY / PAY_AND_SKIP / BKV_PASS ára. */
  amount?: number;
  /** FURNITURE_PURCHASE mezőknél — a FURNITURE_CATALOG adja az árat tételenként. */
  furnitureItems?: FurnitureItemId[];
  /**
   * true a 15-ös (EXTRA_ROLL_REWARD) ÉS a 27-es (CHANCE) mezőn — mindkettő
   * hatástalan, ha a játékosnak nincs BKV-bérlete.
   */
  requiresBkvPass?: boolean;
}

export type ChanceCardEffect =
  | { kind: 'MONEY_DELTA'; amount: number }
  | {
      kind: 'MOVE_TO';
      targetIndex: number;
      /** A kártya szövege szerinti, azonnal fizetendő összeg — a célmező saját (nem-START) hatása NEM fut le automatikusan. */
      thenPay?: number;
      /** Club Tihany kártya — a mezőváltás UTÁN még egy extra dobás jár. */
      thenExtraRoll?: boolean;
    }
  | { kind: 'GAIN_FURNITURE'; item: FurnitureItemId; cashIfAlreadyOwned: number; cashIfNoApartment: number }
  | { kind: 'FIRE_EVENT' }
  | { kind: 'CAR_THEFT' }
  | { kind: 'IMMEDIATE_INTEREST'; ratePercent: number };

export interface ChanceCard {
  id: string;
  /** Teljes, eredeti kártyaszöveg — a UI-ban ez jelenik meg. */
  text: string;
  effect: ChanceCardEffect;
}

/**
 * A játék eseménynaplója — Gwent/Hotel/Ramses mintáját követve, diszkriminált
 * unióként, hogy JSON-szerializálható maradjon (§3.1, mezőnkénti frissítésre
 * alkalmas tervezés).
 */
export type LogEntry =
  | { type: 'DICE_ROLLED'; playerId: PlayerId; value: number }
  | { type: 'MOVED'; playerId: PlayerId; fromIndex: number; toIndex: number; startBonus: 0 | 2000 | 4000; source: 'DICE' | 'CHANCE_CARD' }
  | { type: 'SPACE_PAYMENT'; playerId: PlayerId; spaceIndex: number; amount: number }
  | { type: 'CHANCE_CARD_DRAWN'; playerId: PlayerId; cardId: string }
  | { type: 'CHANCE_CARD_SKIPPED_NO_PASS'; playerId: PlayerId }
  | { type: 'BKV_PASS_PURCHASED'; playerId: PlayerId }
  | { type: 'BKV_REWARD_SKIPPED_NO_PASS'; playerId: PlayerId }
  | { type: 'EXTRA_ROLL_GRANTED'; playerId: PlayerId; count: number }
  | { type: 'BANK_ACCOUNT_OPENED'; playerId: PlayerId }
  | { type: 'MONEY_TRANSFERRED'; playerId: PlayerId; direction: 'DEPOSIT' | 'WITHDRAW'; amount: number }
  | { type: 'INTEREST_PAID'; playerId: PlayerId; amount: number; source: 'FIELD_8' | 'CHANCE_CARD' }
  | { type: 'INSURANCE_BOUGHT'; playerId: PlayerId; policy: 'life' | 'home' | 'car' }
  | { type: 'APARTMENT_PURCHASED'; playerId: PlayerId; financed: boolean }
  | { type: 'CAR_PURCHASED'; playerId: PlayerId; financed: boolean }
  | { type: 'INSTALLMENT_PAID'; playerId: PlayerId; loan: 'car' | 'apartment'; amount: number; paidOff: boolean }
  | { type: 'FURNITURE_PURCHASED'; playerId: PlayerId; item: FurnitureItemId }
  | { type: 'FURNITURE_GAINED_FROM_CARD'; playerId: PlayerId; item: FurnitureItemId; cashInstead: boolean }
  | { type: 'FIRE_EVENT'; playerId: PlayerId; insured: boolean; payout: number }
  | { type: 'CAR_THEFT'; playerId: PlayerId; insured: boolean; payout: number }
  | { type: 'HOSPITAL_ENTERED'; playerId: PlayerId }
  | { type: 'HOSPITAL_ROLL_FAILED'; playerId: PlayerId; value: number }
  | { type: 'HOSPITAL_EXITED'; playerId: PlayerId }
  | { type: 'SKIPPED_TURN'; playerId: PlayerId }
  | { type: 'BANKRUPT'; playerId: PlayerId }
  | { type: 'GAME_WON'; playerId: PlayerId };

export type TurnPhase =
  | 'AWAITING_ROLL'
  /** A START mezőn dobással történő áthaladás/rálépés miatt esedékes törlesztés(ek) vár(nak) — lásd pendingMandatoryInstallments. Amíg nem üres, más action nem engedélyezett. */
  | 'AWAITING_MANDATORY_INSTALLMENT'
  /** Húzott Szerencsekártya hatása már lefutott, de a soron lévő játékosnak meg kell erősítenie (ACK_CHANCE_CARD) mielőtt bármi más action engedélyezett — lásd docs/gazdalkodj-okosan-0c-vizual-specifikacio.md UX-kiegészítés szakasza. */
  | 'AWAITING_CHANCE_CARD_ACK'
  /** A landolt mező típusától függő döntésre vár (vásárlás/biztosítás/bútor — opcionális akciók). */
  | 'RESOLVING_SPACE'
  | 'TURN_COMPLETE';

export type GameStatus = 'IN_PROGRESS' | 'FINISHED';

export interface GazdalkodjOkosanState {
  board: BoardSpace[]; // fix, 42 elemű (0=START, 1-41)
  chanceDeck: ChanceCard[]; // húzás után a kártya a lista VÉGÉRE kerül
  players: Player[];
  currentPlayerIndex: number;
  turnPhase: TurnPhase;
  /**
   * KIZÁRÓLAG a ROLL_MOVE_DICE tölti fel, ha a dobás nyomán a soron lévő
   * játékos áthaladt a START-on/rálépett, ÉS van FINANCED autója/lakása —
   * Szerencsekártya MOVE_TO általi START-keresztezés pénzt ad, de törlesztést
   * NEM tesz esedékessé. A törlesztés nem automatikus, a kör kötelező első
   * lépéseként a soron lévő játékosnak magának kell kiváltania.
   */
  pendingMandatoryInstallments: ('car' | 'apartment')[];
  lastDiceRoll: number | null;
  status: GameStatus;
  winnerId: PlayerId | null;
  log: LogEntry[]; // csak APPEND
}
