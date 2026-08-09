import { describe, expect, it } from 'vitest';
import { createInitialState } from './initialState';
import { reducer } from './reducer';
import { getPlayer, updatePlayer } from './rules';
import type { ChanceCard, GazdalkodjOkosanState, LogEntry, OwnershipStatus, Player } from './state';

/** Egyetlen valódi kártya sem MOVE_TO-zik Szerencsekerék mezőre (szándékosan, hogy ne legyen lánc-húzás) — a "kártyával landolt egy másik Szerencsekerék mezőn" esetet ezért egy szintetikus, teszt-only kártyával szimuláljuk. */
function moveToChanceCard(targetIndex: number): ChanceCard {
  return { id: 'test-move-to-chance', text: 'teszt', effect: { kind: 'MOVE_TO', targetIndex } };
}

function twoPlayerState(): GazdalkodjOkosanState {
  return createInitialState(['Alice', 'Bob']);
}

const FINANCED_CAR: OwnershipStatus = {
  kind: 'FINANCED',
  plan: { totalPrice: 15000, remainingBalance: 13000, perTurnPayment: 500 },
};

const FINANCED_APARTMENT: OwnershipStatus = {
  kind: 'FINANCED',
  plan: { totalPrice: 35000, remainingBalance: 20000, perTurnPayment: 500 },
};

describe('createInitialState', () => {
  it('starts both players on START with 18.000 EUR cash, no account, player 1 to move', () => {
    const state = twoPlayerState();
    expect(state.players).toHaveLength(2);
    expect(state.players.every((p) => p.position === 0 && p.cash === 18000 && p.bankAccount === null)).toBe(true);
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.turnPhase).toBe('AWAITING_ROLL');
    expect(state.board).toHaveLength(42);
    expect(state.chanceDeck).toHaveLength(35);
  });
});

describe('reducer — ROLL_MOVE_DICE mozgás', () => {
  it('elmozgatja a soron lévő játékost, majd a mezőfizetés lezárása után RESOLVING_SPACE-be lép', () => {
    const state = twoPlayerState();
    const afterRoll = reducer(state, { type: 'ROLL_MOVE_DICE', value: 4 });
    expect(getPlayer(afterRoll, 'player-1').position).toBe(4);
    expect(afterRoll.lastDiceRoll).toBe(4);
    expect(afterRoll.turnPhase).toBe('AWAITING_PAYMENT'); // 4-es mező: PAY, 40 EUR
    const next = reducer(afterRoll, { type: 'SETTLE_PAYMENT', cashAmount: 40, bankAmount: 0 });
    expect(next.turnPhase).toBe('RESOLVING_SPACE');
  });

  it('no-op AWAITING_ROLL fázison kívül', () => {
    const state = { ...twoPlayerState(), turnPhase: 'RESOLVING_SPACE' as const };
    expect(reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 })).toBe(state);
  });

  it('a START mezőn áthaladva 2.000 EUR jár', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 40 });
    const afterRoll = reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 }); // 40 -> 41 -> 0 -> 1 (PARWAN, 200 EUR), áthalad a Starton
    expect(getPlayer(afterRoll, 'player-1').position).toBe(1);
    expect(getPlayer(afterRoll, 'player-1').cash).toBe(18000 + 2000); // START bónusz azonnal jár, az 1-es mező ára AWAITING_PAYMENT-ben vár
    const next = reducer(afterRoll, { type: 'SETTLE_PAYMENT', cashAmount: 200, bankAmount: 0 });
    expect(getPlayer(next, 'player-1').cash).toBe(18000 + 2000 - 200);
  });

  it('a START mezőre pontosan rálépve 4.000 EUR jár', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 40 });
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 2 }); // 40 -> 41 -> 0
    expect(getPlayer(next, 'player-1').position).toBe(0);
    expect(getPlayer(next, 'player-1').cash).toBe(18000 + 4000);
  });

  it('a 8-as mezőn áthaladva/rálépve kamatot fizet a folyószámla-egyenlegre', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', {
      position: 5,
      bankAccount: { balance: 1000 },
    });
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 }); // 5 -> 6 -> 7 -> 8, rálép
    expect(getPlayer(next, 'player-1').bankAccount).toEqual({ balance: 1070 }); // 7% kamat
    expect(next.log.some((e) => e.type === 'INTEREST_PAID' && e.source === 'FIELD_8')).toBe(true);
  });
});

describe('reducer — kötelező hitel-törlesztés csak dobás utáni START-keresztezésnél', () => {
  it('dobással történő START-áthaladás esedékessé teszi a FINANCED autó törlesztését', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 40, car: FINANCED_CAR });
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 });
    expect(next.turnPhase).toBe('AWAITING_MANDATORY_INSTALLMENT');
    expect(next.pendingMandatoryInstallments).toEqual(['car']);
  });

  it('mindkét hitel esedékessé válik egyszerre, ha mindkettő FINANCED', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', {
      position: 40,
      car: FINANCED_CAR,
      apartment: FINANCED_APARTMENT,
    });
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 });
    expect(next.pendingMandatoryInstallments).toEqual(['car', 'apartment']);
  });

  it('AWAITING_MANDATORY_INSTALLMENT alatt más action nem engedélyezett (pl. END_TURN no-op)', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 40, car: FINANCED_CAR });
    const afterRoll = reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 });
    expect(reducer(afterRoll, { type: 'END_TURN' })).toBe(afterRoll);
  });

  it('a törlesztés kifizetése után a landolt mező hatása lefut és a fázis RESOLVING_SPACE-re vált', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 40, car: FINANCED_CAR });
    const afterRoll = reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 }); // landol az 1-es mezőn (PAY, 200 EUR)
    const requestedInstallment = reducer(afterRoll, { type: 'PAY_CAR_INSTALLMENT' });
    expect(requestedInstallment.turnPhase).toBe('AWAITING_PAYMENT');
    const afterInstallment = reducer(requestedInstallment, { type: 'SETTLE_PAYMENT', cashAmount: 500, bankAmount: 0 });
    expect(getPlayer(afterInstallment, 'player-1').car).toEqual({
      kind: 'FINANCED',
      plan: { totalPrice: 15000, remainingBalance: 12500, perTurnPayment: 500 },
    });
    expect(afterInstallment.turnPhase).toBe('AWAITING_PAYMENT'); // most az 1-es mező ára (200 EUR) vár
    const next = reducer(afterInstallment, { type: 'SETTLE_PAYMENT', cashAmount: 200, bankAmount: 0 });
    expect(next.turnPhase).toBe('RESOLVING_SPACE');
    expect(getPlayer(next, 'player-1').cash).toBe(18000 + 2000 - 500 - 200); // START bónusz, törlesztés, 1-es mező ára
    expect(next.pendingMandatoryInstallments).toEqual([]); // regresszió: korábban stale ['car'] maradt itt (0b smoke teszt találta meg)
  });

  it('a hitel teljesen kifizetve OWNED_CASH-re vált', () => {
    const almostPaidCar: OwnershipStatus = { kind: 'FINANCED', plan: { totalPrice: 15000, remainingBalance: 300, perTurnPayment: 500 } };
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 40, car: almostPaidCar });
    const afterRoll = reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 });
    const requested = reducer(afterRoll, { type: 'PAY_CAR_INSTALLMENT' });
    const next = reducer(requested, { type: 'SETTLE_PAYMENT', cashAmount: 300, bankAmount: 0 });
    expect(getPlayer(next, 'player-1').car).toEqual({ kind: 'OWNED_CASH', pricePaid: 15000 });
  });

  it('Szerencsekártya általi START-keresztezés pénzt ad, de NEM tesz esedékessé törlesztést', () => {
    // card-03: TESCO pontgyűjtés, mindig a START-ra küld, fizetés nélkül
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 31, car: FINANCED_CAR });
    const afterRoll = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 }); // 31 -> 32-es mező: Szerencsekártya
    expect(afterRoll.turnPhase).toBe('RESOLVING_SPACE');
    const base = afterRoll.chanceDeck.find((c) => c.effect.kind === 'MOVE_TO' && c.effect.targetIndex === 0 && !c.effect.thenPay)!;
    const withCardOnTop: GazdalkodjOkosanState = { ...afterRoll, chanceDeck: [base, ...afterRoll.chanceDeck.filter((c) => c !== base)] };
    const afterDraw = reducer(withCardOnTop, { type: 'DRAW_CHANCE_CARD' });
    expect(getPlayer(afterDraw, 'player-1').position).toBe(32); // MÉG nem mozdult — a hatás csak ACK-kor fut le
    expect(afterDraw.turnPhase).toBe('AWAITING_CHANCE_CARD_ACK');
    expect(afterDraw.pendingMandatoryInstallments).toEqual([]);
    const afterAck = reducer(afterDraw, { type: 'ACK_CHANCE_CARD' });
    expect(getPlayer(afterAck, 'player-1').position).toBe(0); // csak MOST mozdult
    expect(afterAck.turnPhase).toBe('RESOLVING_SPACE'); // NEM AWAITING_MANDATORY_INSTALLMENT
    expect(afterAck.pendingMandatoryInstallments).toEqual([]);
  });

  it('ha a játékos nem tudja kifizetni a kötelező törlesztést, csődbe megy', () => {
    const hugeInstallment: OwnershipStatus = { kind: 'FINANCED', plan: { totalPrice: 15000, remainingBalance: 13000, perTurnPayment: 5000 } };
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 40, car: hugeInstallment, cash: 100 });
    const afterRoll = reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 }); // +2.000 START bónusz, de 2.100 < 5.000 törlesztő
    const afterBankrupt = reducer(afterRoll, { type: 'PAY_CAR_INSTALLMENT' });
    expect(getPlayer(afterBankrupt, 'player-1').bankrupt).toBe(true);
    expect(afterBankrupt.turnPhase).toBe('RESOLVING_SPACE'); // a kör NEM adódik át automatikusan, "Kör vége" kell hozzá
    expect(afterBankrupt.currentPlayerIndex).toBe(0);
    const next = reducer(afterBankrupt, { type: 'END_TURN' });
    expect(next.currentPlayerIndex).toBe(1);
  });
});

describe('reducer — Szerencsekártya mezőváltás (MOVE_TO), mindig előre haladva', () => {
  it('a szabálykönyv példája: 16-os mezőn húzott kártya a 8-asra küld, a Starton átmenve jár a 2.000 EUR', () => {
    // A 16-os mező Szerencsekártya-mező; kézzel behelyezzük a "víz/gáz -> 8, 40 EUR" kártyát a pakli tetejére.
    const state: GazdalkodjOkosanState = {
      ...updatePlayer(twoPlayerState(), 'player-1', { position: 16 }),
      turnPhase: 'RESOLVING_SPACE',
      pendingMandatoryChanceDraw: true,
    };
    const withCardOnTop: GazdalkodjOkosanState = {
      ...state,
      chanceDeck: [state.chanceDeck.find((c) => c.effect.kind === 'MOVE_TO' && c.effect.targetIndex === 8 && c.effect.thenPay === 40)!, ...state.chanceDeck.filter((c) => !(c.effect.kind === 'MOVE_TO' && c.effect.targetIndex === 8 && c.effect.thenPay === 40))],
    };
    const afterDraw = reducer(withCardOnTop, { type: 'DRAW_CHANCE_CARD' });
    expect(getPlayer(afterDraw, 'player-1').position).toBe(16); // MÉG nem mozdult
    const afterAck = reducer(afterDraw, { type: 'ACK_CHANCE_CARD' });
    expect(getPlayer(afterAck, 'player-1').position).toBe(8);
    expect(getPlayer(afterAck, 'player-1').cash).toBe(18000 + 2000); // START bónusz azonnal jár, a 40 EUR AWAITING_PAYMENT-ben vár
    expect(afterAck.turnPhase).toBe('AWAITING_PAYMENT');
    const next = reducer(afterAck, { type: 'SETTLE_PAYMENT', cashAmount: 40, bankAmount: 0 });
    expect(getPlayer(next, 'player-1').cash).toBe(18000 + 2000 - 40);
  });

  it('a célmező saját hatása nem fut le automatikusan (a kártya thenPay-je számít, nem a mező ára)', () => {
    // card a 21-es mezőre (280 EUR) küld thenPay: 280-nal — ellenőrizzük, hogy pontosan a kártya összege vonódik le
    const state = twoPlayerState();
    const clubTihanyCard = state.chanceDeck.find((c) => c.effect.kind === 'MOVE_TO' && c.effect.targetIndex === 21)!;
    const reordered: GazdalkodjOkosanState = { ...state, chanceDeck: [clubTihanyCard, ...state.chanceDeck.filter((c) => c !== clubTihanyCard)] };
    const positioned: GazdalkodjOkosanState = {
      ...updatePlayer(reordered, 'player-1', { position: 3 }),
      turnPhase: 'RESOLVING_SPACE',
      pendingMandatoryChanceDraw: true,
    };
    const afterDraw = reducer(positioned, { type: 'DRAW_CHANCE_CARD' });
    const afterAck = reducer(afterDraw, { type: 'ACK_CHANCE_CARD' });
    expect(getPlayer(afterAck, 'player-1').position).toBe(21);
    expect(afterAck.turnPhase).toBe('AWAITING_PAYMENT');
    const next = reducer(afterAck, { type: 'SETTLE_PAYMENT', cashAmount: 280, bankAmount: 0 });
    expect(getPlayer(next, 'player-1').cash).toBe(18000 - 280);
    expect(getPlayer(next, 'player-1').extraRollsPending).toBe(1); // Club Tihany: "Még egyszer dobhatsz"
  });
});

describe('reducer — Szerencsekerék mezőn a kártyahúzás kötelező (dobással landolva)', () => {
  it('dobással landolva a Szerencsekerék mezőn END_TURN no-op, amíg nincs húzva; húzás+megerősítés után újra engedélyezett', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 0 });
    const afterRoll = reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 }); // 0 -> 3, Szerencsekerék
    expect(afterRoll.turnPhase).toBe('RESOLVING_SPACE');
    expect(afterRoll.pendingMandatoryChanceDraw).toBe(true);

    const attemptedEndTurn = reducer(afterRoll, { type: 'END_TURN' });
    expect(attemptedEndTurn).toBe(afterRoll);

    const afterDraw = reducer(afterRoll, { type: 'DRAW_CHANCE_CARD' });
    expect(afterDraw.pendingMandatoryChanceDraw).toBe(false);
    const afterAck = reducer(afterDraw, { type: 'ACK_CHANCE_CARD' });
    // A húzott kártya hatásától függően RESOLVING_SPACE-re vagy AWAITING_PAYMENT-re léphet — mindkét esetben a kötelező húzás már teljesült.
    expect(afterAck.pendingMandatoryChanceDraw).toBe(false);
  });

  it('hiányzó BKV-bérlet miatt hatástalan Szerencsekerék mezőn NEM kötelező a húzás, END_TURN azonnal engedélyezett', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 26, hasBkvPass: false });
    const afterRoll = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 }); // 26 -> 27, requiresBkvPass Szerencsekerék
    expect(afterRoll.pendingMandatoryChanceDraw).toBe(false);
    expect(reducer(afterRoll, { type: 'END_TURN' })).not.toBe(afterRoll);
  });

  it('bérlettel a 27-es (requiresBkvPass) Szerencsekerék mezőre lépve a húzás kötelező', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 26, hasBkvPass: true });
    const afterRoll = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 }); // 26 -> 27
    expect(afterRoll.pendingMandatoryChanceDraw).toBe(true);
    expect(reducer(afterRoll, { type: 'END_TURN' })).toBe(afterRoll);
  });

  it('Szerencsekártyával (MOVE_TO) egy másik Szerencsekerék mezőre kerülve is kötelező a húzás', () => {
    const base = twoPlayerState();
    const chanceOnChance = moveToChanceCard(3); // 3-as mező: Szerencsekerék, nincs requiresBkvPass
    const state: GazdalkodjOkosanState = {
      ...updatePlayer(base, 'player-1', { position: 16 }),
      turnPhase: 'RESOLVING_SPACE',
      pendingMandatoryChanceDraw: true,
      chanceDeck: [chanceOnChance, ...base.chanceDeck],
    };
    const afterDraw = reducer(state, { type: 'DRAW_CHANCE_CARD' });
    const afterAck = reducer(afterDraw, { type: 'ACK_CHANCE_CARD' });
    expect(getPlayer(afterAck, 'player-1').position).toBe(3);
    expect(afterAck.pendingMandatoryChanceDraw).toBe(true);
    expect(reducer(afterAck, { type: 'END_TURN' })).toBe(afterAck);

    const afterSecondDraw = reducer(afterAck, { type: 'DRAW_CHANCE_CARD' });
    expect(afterSecondDraw.turnPhase).toBe('AWAITING_CHANCE_CARD_ACK');
  });

  it('Szerencsekártyával egy requiresBkvPass Szerencsekerék mezőre kerülve, bérlet nélkül NEM kötelező a húzás', () => {
    const base = twoPlayerState();
    const chanceOnChance = moveToChanceCard(27); // requiresBkvPass Szerencsekerék
    const state: GazdalkodjOkosanState = {
      ...updatePlayer(base, 'player-1', { position: 16, hasBkvPass: false }),
      turnPhase: 'RESOLVING_SPACE',
      pendingMandatoryChanceDraw: true,
      chanceDeck: [chanceOnChance, ...base.chanceDeck],
    };
    const afterDraw = reducer(state, { type: 'DRAW_CHANCE_CARD' });
    const afterAck = reducer(afterDraw, { type: 'ACK_CHANCE_CARD' });
    expect(getPlayer(afterAck, 'player-1').position).toBe(27);
    expect(afterAck.pendingMandatoryChanceDraw).toBe(false);
    expect(reducer(afterAck, { type: 'END_TURN' })).not.toBe(afterAck);
  });

  it('ha a húzott kártyának nincs mozgás-hatása, ugyanazon a mezőn állva nem húzható újabb kártya', () => {
    const base = updatePlayer(twoPlayerState(), 'player-1', { position: 3 });
    const card = base.chanceDeck.find((c) => c.id === 'card-07')!; // MONEY_DELTA +2500, nem mozgat
    const state: GazdalkodjOkosanState = {
      ...base,
      turnPhase: 'RESOLVING_SPACE',
      pendingMandatoryChanceDraw: true,
      chanceDeck: [card, ...base.chanceDeck.filter((c) => c !== card)],
    };
    const afterDraw = reducer(state, { type: 'DRAW_CHANCE_CARD' });
    const afterAck = reducer(afterDraw, { type: 'ACK_CHANCE_CARD' });
    expect(getPlayer(afterAck, 'player-1').position).toBe(3); // nem mozdult
    expect(afterAck.pendingMandatoryChanceDraw).toBe(false);

    const attemptedSecondDraw = reducer(afterAck, { type: 'DRAW_CHANCE_CARD' });
    expect(attemptedSecondDraw).toBe(afterAck); // no-op — a kötelező húzás már teljesült ezen a landoláson
  });
});

describe('reducer — Szerencsekártya megerősítés (AWAITING_CHANCE_CARD_ACK)', () => {
  it('kártyahúzás után AWAITING_CHANCE_CARD_ACK-ba lép, minden más action blokkolva marad ACK_CHANCE_CARD-ig', () => {
    const base: GazdalkodjOkosanState = {
      ...updatePlayer(twoPlayerState(), 'player-1', { position: 3 }),
      turnPhase: 'RESOLVING_SPACE',
      pendingMandatoryChanceDraw: true,
    };
    // card-07: MONEY_DELTA +2500, fizetés nélkül — a teszt a fázisváltást vizsgálja, nem egy konkrét hatást, ezért egy fizetés-mentes kártyát rögzítünk a pakli tetejére (a deck alapértelmezett első kártyája thenPay-es lenne, ami AWAITING_PAYMENT-be vinné az ACK utáni fázist).
    const card = base.chanceDeck.find((c) => c.id === 'card-07')!;
    const state: GazdalkodjOkosanState = { ...base, chanceDeck: [card, ...base.chanceDeck.filter((c) => c !== card)] };
    const afterDraw = reducer(state, { type: 'DRAW_CHANCE_CARD' });
    expect(afterDraw.turnPhase).toBe('AWAITING_CHANCE_CARD_ACK');

    // Egy tetszőleges másik action no-op amíg nincs megerősítve.
    const attemptedEndTurn = reducer(afterDraw, { type: 'END_TURN' });
    expect(attemptedEndTurn).toEqual(afterDraw);

    const afterAck = reducer(afterDraw, { type: 'ACK_CHANCE_CARD' });
    expect(afterAck.turnPhase).toBe('RESOLVING_SPACE');
    expect(getPlayer(afterAck, 'player-1').cash).toBe(18000 + 2500);
  });

  it('ACK_CHANCE_CARD no-op RESOLVING_SPACE fázisban (nincs mit megerősíteni)', () => {
    const state: GazdalkodjOkosanState = { ...twoPlayerState(), turnPhase: 'RESOLVING_SPACE' };
    const next = reducer(state, { type: 'ACK_CHANCE_CARD' });
    expect(next).toEqual(state);
  });
});

describe('reducer — MOVED log-bejegyzés source mezője', () => {
  it('dobással történő mozgásnál source: DICE', () => {
    const state = twoPlayerState();
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 });
    const movedEntry = next.log.find((entry): entry is Extract<LogEntry, { type: 'MOVED' }> => entry.type === 'MOVED')!;
    expect(movedEntry.source).toBe('DICE');
  });

  it('Szerencsekártya MOVE_TO hatásánál source: CHANCE_CARD', () => {
    const state: GazdalkodjOkosanState = {
      ...updatePlayer(twoPlayerState(), 'player-1', { position: 16 }),
      turnPhase: 'RESOLVING_SPACE',
      pendingMandatoryChanceDraw: true,
    };
    const withCardOnTop: GazdalkodjOkosanState = {
      ...state,
      chanceDeck: [state.chanceDeck.find((c) => c.effect.kind === 'MOVE_TO')!, ...state.chanceDeck.filter((c) => c.effect.kind !== 'MOVE_TO')],
    };
    const afterDraw = reducer(withCardOnTop, { type: 'DRAW_CHANCE_CARD' });
    const next = reducer(afterDraw, { type: 'ACK_CHANCE_CARD' });
    const movedEntry = next.log.find((entry): entry is Extract<LogEntry, { type: 'MOVED' }> => entry.type === 'MOVED')!;
    expect(movedEntry.source).toBe('CHANCE_CARD');
  });
});

describe('reducer — BKV-bérlet és feltételes mezők', () => {
  it('a bérlet csak a 2-es mezőn vásárolható', () => {
    const state: GazdalkodjOkosanState = { ...updatePlayer(twoPlayerState(), 'player-1', { position: 2 }), turnPhase: 'RESOLVING_SPACE' };
    const requested = reducer(state, { type: 'BUY_BKV_PASS' });
    expect(requested.turnPhase).toBe('AWAITING_PAYMENT');
    const next = reducer(requested, { type: 'SETTLE_PAYMENT', cashAmount: 200, bankAmount: 0 });
    expect(getPlayer(next, 'player-1').hasBkvPass).toBe(true);
    expect(getPlayer(next, 'player-1').cash).toBe(18000 - 200);
  });

  it('bérlet nélkül a 15-ös mező jutalma nem jár', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 14 });
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 }); // 14 -> 15
    expect(getPlayer(next, 'player-1').extraRollsPending).toBe(0);
    expect(next.log.some((e) => e.type === 'BKV_REWARD_SKIPPED_NO_PASS')).toBe(true);
  });

  it('bérlettel a 15-ös mező 2 extra dobást ad', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 14, hasBkvPass: true });
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 });
    expect(getPlayer(next, 'player-1').extraRollsPending).toBe(2);
  });

  it('bérlet nélkül a 27-es mezőn nem lehet kártyát húzni', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 26 });
    const afterRoll = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 }); // 26 -> 27
    expect(afterRoll.log.some((e) => e.type === 'CHANCE_CARD_SKIPPED_NO_PASS')).toBe(true);
    const attemptedDraw = reducer(afterRoll, { type: 'DRAW_CHANCE_CARD' });
    expect(attemptedDraw).toBe(afterRoll); // no-op, deck nem fogyott
  });
});

describe('reducer — folyószámla', () => {
  it('nyitás és befizetés csak a 8-as mezőn lehetséges', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 5 });
    expect(reducer(state, { type: 'OPEN_BANK_ACCOUNT' })).toBe(state);
  });

  it('a 8-as mezőn nyitható és tölthető fel', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 8 });
    const opened = reducer(state, { type: 'OPEN_BANK_ACCOUNT' });
    expect(getPlayer(opened, 'player-1').bankAccount).toEqual({ balance: 0 });
    const deposited = reducer(opened, { type: 'DEPOSIT_TO_ACCOUNT', amount: 5000 });
    expect(getPlayer(deposited, 'player-1').cash).toBe(18000 - 5000);
    expect(getPlayer(deposited, 'player-1').bankAccount).toEqual({ balance: 5000 });
  });

  it('kivétel bárhol, bármikor lehetséges', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 20, bankAccount: { balance: 3000 } });
    const next = reducer(state, { type: 'WITHDRAW_FROM_ACCOUNT', amount: 1000 });
    expect(getPlayer(next, 'player-1').cash).toBe(18000 + 1000);
    expect(getPlayer(next, 'player-1').bankAccount).toEqual({ balance: 2000 });
  });
});

function atSpace(playerPatch: Partial<Player>): GazdalkodjOkosanState {
  return { ...updatePlayer(twoPlayerState(), 'player-1', playerPatch), turnPhase: 'RESOLVING_SPACE' };
}

describe('reducer — lakás- és autóvásárlás', () => {
  it('készpénzes autóvásárlás', () => {
    const state = atSpace({ position: 5 });
    const requested = reducer(state, { type: 'BUY_CAR', financed: false });
    expect(requested.turnPhase).toBe('AWAITING_PAYMENT');
    const next = reducer(requested, { type: 'SETTLE_PAYMENT', cashAmount: 10000, bankAmount: 0 });
    expect(getPlayer(next, 'player-1').car).toEqual({ kind: 'OWNED_CASH', pricePaid: 10000 });
    expect(getPlayer(next, 'player-1').cash).toBe(18000 - 10000);
  });

  it('hitelre vásárolt lakás a megadott feltételekkel', () => {
    const state = atSpace({ position: 19 });
    const requested = reducer(state, { type: 'BUY_APARTMENT', financed: true });
    const next = reducer(requested, { type: 'SETTLE_PAYMENT', cashAmount: 15000, bankAmount: 0 });
    expect(getPlayer(next, 'player-1').apartment).toEqual({
      kind: 'FINANCED',
      plan: { totalPrice: 35000, remainingBalance: 20000, perTurnPayment: 500 },
    });
    expect(getPlayer(next, 'player-1').cash).toBe(18000 - 15000);
  });

  it('a 39-es mező ugyanazt a vásárlási lehetőséget kínálja, mint a 19-es', () => {
    const state = atSpace({ position: 39, cash: 40000 });
    const requested = reducer(state, { type: 'BUY_APARTMENT', financed: false });
    const next = reducer(requested, { type: 'SETTLE_PAYMENT', cashAmount: 30000, bankAmount: 0 });
    expect(getPlayer(next, 'player-1').apartment.kind).toBe('OWNED_CASH');
  });

  it('érvénytelen fizetési megosztás (nem adja ki a pontos összeget) no-op', () => {
    const state = atSpace({ position: 5 });
    const requested = reducer(state, { type: 'BUY_CAR', financed: false });
    expect(reducer(requested, { type: 'SETTLE_PAYMENT', cashAmount: 9000, bankAmount: 0 })).toBe(requested);
  });

  it('önkéntes vásárlás visszavonható CANCEL_PAYMENT-tel, kötelező mezőfizetés nem', () => {
    const state = atSpace({ position: 5 });
    const requested = reducer(state, { type: 'BUY_CAR', financed: false });
    const cancelled = reducer(requested, { type: 'CANCEL_PAYMENT' });
    expect(cancelled.turnPhase).toBe('RESOLVING_SPACE');
    expect(getPlayer(cancelled, 'player-1').car).toEqual({ kind: 'NONE' });
    expect(getPlayer(cancelled, 'player-1').cash).toBe(18000);

    const afterRoll = reducer(updatePlayer(twoPlayerState(), 'player-1', { position: 0 }), { type: 'ROLL_MOVE_DICE', value: 4 }); // 4-es mező, PAY 40
    expect(afterRoll.turnPhase).toBe('AWAITING_PAYMENT');
    expect(reducer(afterRoll, { type: 'CANCEL_PAYMENT' })).toBe(afterRoll);
  });
});

describe('reducer — bútor', () => {
  it('csak lakással rendelkező játékos vehet bútort', () => {
    const state = atSpace({ position: 11 });
    expect(reducer(state, { type: 'BUY_FURNITURE', item: 'konyhabutor' })).toBe(state);
  });

  it('lakással rendelkező játékos megveheti a konyhabútort', () => {
    const state = atSpace({ position: 11, apartment: { kind: 'OWNED_CASH', pricePaid: 30000 } });
    const requested = reducer(state, { type: 'BUY_FURNITURE', item: 'konyhabutor' });
    const next = reducer(requested, { type: 'SETTLE_PAYMENT', cashAmount: 1000, bankAmount: 0 });
    expect(getPlayer(next, 'player-1').furniture.konyhabutor).toBe(true);
    expect(getPlayer(next, 'player-1').cash).toBe(18000 - 1000);
  });

  it('megosztott fizetés (készpénz + folyószámla) is levonódik mindkét forrásból', () => {
    const state = atSpace({ position: 11, apartment: { kind: 'OWNED_CASH', pricePaid: 30000 }, bankAccount: { balance: 2000 } });
    const requested = reducer(state, { type: 'BUY_FURNITURE', item: 'konyhabutor' });
    const next = reducer(requested, { type: 'SETTLE_PAYMENT', cashAmount: 600, bankAmount: 400 });
    expect(getPlayer(next, 'player-1').furniture.konyhabutor).toBe(true);
    expect(getPlayer(next, 'player-1').cash).toBe(18000 - 600);
    expect(getPlayer(next, 'player-1').bankAccount).toEqual({ balance: 1600 });
  });
});

const OWNED_CAR: OwnershipStatus = { kind: 'OWNED_CASH', pricePaid: 10000 };

describe('reducer — biztosítás', () => {
  it('megköthető a 9-es mezőn, ha van autója', () => {
    const state = atSpace({ position: 9, car: OWNED_CAR });
    const requested = reducer(state, { type: 'BUY_INSURANCE', policy: 'car' });
    const next = reducer(requested, { type: 'SETTLE_PAYMENT', cashAmount: 100, bankAmount: 0 });
    expect(getPlayer(next, 'player-1').insurance.car).toBe(true);
    expect(getPlayer(next, 'player-1').cash).toBe(18000 - 100);
  });

  it('autóbiztosítás NEM köthető, amíg a játékosnak nincs autója', () => {
    const state = atSpace({ position: 9 });
    expect(reducer(state, { type: 'BUY_INSURANCE', policy: 'car' })).toBe(state);
  });

  it('életbiztosítás autó/lakás nélkül is köthető (nincs előfeltétele)', () => {
    const state = atSpace({ position: 9 });
    const requested = reducer(state, { type: 'BUY_INSURANCE', policy: 'life' });
    expect(requested.turnPhase).toBe('AWAITING_PAYMENT');
  });

  it('megköthető a lakásbiztosítás, ha van lakása', () => {
    const state = atSpace({ position: 9, apartment: { kind: 'OWNED_CASH', pricePaid: 30000 } });
    const requested = reducer(state, { type: 'BUY_INSURANCE', policy: 'home' });
    const next = reducer(requested, { type: 'SETTLE_PAYMENT', cashAmount: 100, bankAmount: 0 });
    expect(getPlayer(next, 'player-1').insurance.home).toBe(true);
  });

  it('lakásbiztosítás NEM köthető, amíg a játékosnak nincs lakása', () => {
    const state = atSpace({ position: 9 });
    expect(reducer(state, { type: 'BUY_INSURANCE', policy: 'home' })).toBe(state);
  });

  it('alacsony készpénzű, de elég folyószámla-egyenlegű játékos is megkötheti (totalWealth alapú affordability)', () => {
    const state = atSpace({ position: 9, cash: 50, bankAccount: { balance: 500 }, car: OWNED_CAR });
    const requested = reducer(state, { type: 'BUY_INSURANCE', policy: 'car' });
    expect(requested.turnPhase).toBe('AWAITING_PAYMENT');
    const next = reducer(requested, { type: 'SETTLE_PAYMENT', cashAmount: 50, bankAmount: 50 });
    expect(getPlayer(next, 'player-1').insurance.car).toBe(true);
    expect(getPlayer(next, 'player-1').cash).toBe(0);
    expect(getPlayer(next, 'player-1').bankAccount).toEqual({ balance: 450 });
  });

  it('autólopás után elvész az autóbiztosítás is', () => {
    const base = twoPlayerState();
    const card = base.chanceDeck.find((c) => c.effect.kind === 'CAR_THEFT')!;
    const withPlayer = updatePlayer(base, 'player-1', { position: 3, insurance: { life: false, home: false, car: true }, car: OWNED_CAR });
    const state: GazdalkodjOkosanState = {
      ...withPlayer,
      turnPhase: 'RESOLVING_SPACE',
      pendingMandatoryChanceDraw: true,
      chanceDeck: [card, ...withPlayer.chanceDeck.filter((c) => c !== card)],
    };
    const afterDraw = reducer(state, { type: 'DRAW_CHANCE_CARD' });
    const next = reducer(afterDraw, { type: 'ACK_CHANCE_CARD' });
    expect(getPlayer(next, 'player-1').car).toEqual({ kind: 'NONE' });
    expect(getPlayer(next, 'player-1').insurance.car).toBe(false);
  });
});

describe('reducer — kórház', () => {
  it('landolás a 13-as mezőn kórházba küldi, de a kör csak "Kör vége"-re adódik át', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 12 });
    const afterRoll = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 }); // 12 -> 13
    expect(getPlayer(afterRoll, 'player-1').inHospital).toBe(true);
    expect(afterRoll.turnPhase).toBe('RESOLVING_SPACE');
    expect(afterRoll.currentPlayerIndex).toBe(0);
    const next = reducer(afterRoll, { type: 'END_TURN' });
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('1-es vagy 6-os dobással azonnal kiléphet és mozog is', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 13, inHospital: true });
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 6 });
    expect(getPlayer(next, 'player-1').inHospital).toBe(false);
    expect(getPlayer(next, 'player-1').position).toBe(19);
  });

  it('nem-1/6 dobással bent marad, a próbálkozás számít, de a kör csak "Kör vége"-re adódik át', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 13, inHospital: true });
    const afterRoll = reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 });
    expect(getPlayer(afterRoll, 'player-1').inHospital).toBe(true);
    expect(getPlayer(afterRoll, 'player-1').hospitalRollAttempts).toBe(1);
    expect(afterRoll.turnPhase).toBe('RESOLVING_SPACE');
    expect(afterRoll.currentPlayerIndex).toBe(0);
    const next = reducer(afterRoll, { type: 'END_TURN' });
    expect(next.currentPlayerIndex).toBe(1);
  });

  it('a 3. próbálkozástól bármilyen dobással kiléphet', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 13, inHospital: true, hospitalRollAttempts: 2 });
    const next = reducer(state, { type: 'ROLL_MOVE_DICE', value: 3 });
    expect(getPlayer(next, 'player-1').inHospital).toBe(false);
    expect(getPlayer(next, 'player-1').position).toBe(16);
  });
});

describe('reducer — 41-es mező (italbolt büntetés)', () => {
  it('fizet és a következő dobása kimarad', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { position: 40 });
    const afterRoll = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 }); // 40 -> 41
    expect(afterRoll.turnPhase).toBe('AWAITING_PAYMENT');
    const next = reducer(afterRoll, { type: 'SETTLE_PAYMENT', cashAmount: 20, bankAmount: 0 });
    expect(getPlayer(next, 'player-1').cash).toBe(18000 - 20);
    expect(getPlayer(next, 'player-1').skipNextRoll).toBe(true);
  });

  it('a következő körben nem mozdul, a kör csak "Kör vége"-re adódik át', () => {
    const withPenalty = updatePlayer(twoPlayerState(), 'player-1', { skipNextRoll: true });
    const afterRoll = reducer(withPenalty, { type: 'ROLL_MOVE_DICE', value: 5 });
    expect(getPlayer(afterRoll, 'player-1').position).toBe(0); // nem mozdult
    expect(getPlayer(afterRoll, 'player-1').skipNextRoll).toBe(false);
    expect(afterRoll.turnPhase).toBe('RESOLVING_SPACE');
    expect(afterRoll.currentPlayerIndex).toBe(0);
    const next = reducer(afterRoll, { type: 'END_TURN' });
    expect(next.currentPlayerIndex).toBe(1);
  });
});

describe('reducer — tűzeset és autólopás Szerencsekártyák', () => {
  function stateWithCardOnTop(playerPatch: Partial<Player>, effectKind: 'FIRE_EVENT' | 'CAR_THEFT'): GazdalkodjOkosanState {
    const base = twoPlayerState();
    const card = base.chanceDeck.find((c) => c.effect.kind === effectKind)!;
    const withPlayer = updatePlayer(base, 'player-1', { position: 3, ...playerPatch });
    return {
      ...withPlayer,
      turnPhase: 'RESOLVING_SPACE',
      pendingMandatoryChanceDraw: true,
      chanceDeck: [card, ...withPlayer.chanceDeck.filter((c) => c !== card)],
    };
  }

  it('tűzeset biztosítással: a berendezés teljes árát kifizeti, majd elveszik a bútor', () => {
    const state = stateWithCardOnTop(
      { insurance: { life: false, home: true, car: false }, furniture: { konyhabutor: true, mosogep: false, hutoszekreny: false, mosogatogep: false, tuzhely: false, szobabutor: false } },
      'FIRE_EVENT',
    );
    const afterDraw = reducer(state, { type: 'DRAW_CHANCE_CARD' });
    const next = reducer(afterDraw, { type: 'ACK_CHANCE_CARD' });
    expect(getPlayer(next, 'player-1').cash).toBe(18000 + 1000);
    expect(getPlayer(next, 'player-1').furniture.konyhabutor).toBe(false);
  });

  it('tűzeset biztosítás nélkül: nincs kifizetés, a 9-es mezőre kerül', () => {
    const state = stateWithCardOnTop({ position: 3 }, 'FIRE_EVENT');
    const afterDraw = reducer(state, { type: 'DRAW_CHANCE_CARD' });
    const next = reducer(afterDraw, { type: 'ACK_CHANCE_CARD' });
    expect(getPlayer(next, 'player-1').cash).toBe(18000);
    expect(getPlayer(next, 'player-1').position).toBe(9);
  });

  it('autólopás biztosítással: az eddig kifizetett összeget kapja, max 10.000 EUR-t, a hitel megszűnik', () => {
    const state = stateWithCardOnTop(
      { insurance: { life: false, home: false, car: true }, car: FINANCED_CAR }, // totalPrice 15000, remainingBalance 13000 -> paidSoFar 2000
      'CAR_THEFT',
    );
    const afterDraw = reducer(state, { type: 'DRAW_CHANCE_CARD' });
    const next = reducer(afterDraw, { type: 'ACK_CHANCE_CARD' });
    expect(getPlayer(next, 'player-1').cash).toBe(18000 + 2000);
    expect(getPlayer(next, 'player-1').car).toEqual({ kind: 'NONE' });
  });

  it('autólopás biztosítással, ha a kifizetett összeg meghaladná a 10.000 EUR-t, a plafon érvényesül', () => {
    const almostPaidOffCar: OwnershipStatus = { kind: 'FINANCED', plan: { totalPrice: 15000, remainingBalance: 500, perTurnPayment: 500 } };
    const state = stateWithCardOnTop({ insurance: { life: false, home: false, car: true }, car: almostPaidOffCar }, 'CAR_THEFT');
    const afterDraw = reducer(state, { type: 'DRAW_CHANCE_CARD' });
    const next = reducer(afterDraw, { type: 'ACK_CHANCE_CARD' });
    expect(getPlayer(next, 'player-1').cash).toBe(18000 + 10000);
  });
});

describe('reducer — azonnali kamat-Szerencsekártya (id 8, 15%)', () => {
  it('a folyószámla-egyenleg 15%-át azonnal jóváírja', () => {
    const base = twoPlayerState();
    const card = base.chanceDeck.find((c) => c.effect.kind === 'IMMEDIATE_INTEREST')!;
    const withAccount = updatePlayer(base, 'player-1', { position: 3, bankAccount: { balance: 1000 } });
    const state: GazdalkodjOkosanState = {
      ...withAccount,
      turnPhase: 'RESOLVING_SPACE',
      pendingMandatoryChanceDraw: true,
      chanceDeck: [card, ...withAccount.chanceDeck.filter((c) => c !== card)],
    };
    const afterDraw = reducer(state, { type: 'DRAW_CHANCE_CARD' });
    const next = reducer(afterDraw, { type: 'ACK_CHANCE_CARD' });
    expect(getPlayer(next, 'player-1').bankAccount).toEqual({ balance: 1150 });
  });
});

describe('reducer — csőd', () => {
  it('ha a soron lévő játékos nem tudja kifizetni a kötelező mezőárat, kiesik és a berendezése visszaszáll a bankra', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', {
      position: 27,
      cash: 10,
      furniture: { konyhabutor: true, mosogep: false, hutoszekreny: false, mosogatogep: false, tuzhely: false, szobabutor: false },
    });
    const afterBankrupt = reducer(state, { type: 'ROLL_MOVE_DICE', value: 1 }); // 27 -> 28-as mező, TESCO 300 EUR
    expect(getPlayer(afterBankrupt, 'player-1').bankrupt).toBe(true);
    expect(getPlayer(afterBankrupt, 'player-1').cash).toBe(0);
    expect(getPlayer(afterBankrupt, 'player-1').furniture.konyhabutor).toBe(false);
    expect(afterBankrupt.turnPhase).toBe('RESOLVING_SPACE'); // a kör NEM adódik át automatikusan
    expect(afterBankrupt.currentPlayerIndex).toBe(0);
    const next = reducer(afterBankrupt, { type: 'END_TURN' });
    expect(next.currentPlayerIndex).toBe(1);
  });
});

describe('reducer — győzelmi feltétel', () => {
  it('a győzelem csak END_TURN-nél kerül kiértékelésre, ha minden feltétel teljesül', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', {
      position: 20,
      cash: 5000,
      apartment: { kind: 'OWNED_CASH', pricePaid: 30000 },
      car: { kind: 'OWNED_CASH', pricePaid: 10000 },
      furniture: { konyhabutor: true, mosogep: true, hutoszekreny: true, mosogatogep: true, tuzhely: true, szobabutor: true },
      insurance: { life: false, home: false, car: true },
    });
    const readyToEnd = { ...state, turnPhase: 'RESOLVING_SPACE' as const };
    const next = reducer(readyToEnd, { type: 'END_TURN' });
    expect(next.status).toBe('FINISHED');
    expect(next.winnerId).toBe('player-1');
  });

  it('bármelyik hiányzó feltétel (pl. autóbiztosítás) megakadályozza a győzelmet', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', {
      cash: 5000,
      apartment: { kind: 'OWNED_CASH', pricePaid: 30000 },
      car: { kind: 'OWNED_CASH', pricePaid: 10000 },
      furniture: { konyhabutor: true, mosogep: true, hutoszekreny: true, mosogatogep: true, tuzhely: true, szobabutor: true },
      insurance: { life: false, home: false, car: false },
    });
    const readyToEnd = { ...state, turnPhase: 'RESOLVING_SPACE' as const };
    const next = reducer(readyToEnd, { type: 'END_TURN' });
    expect(next.status).toBe('IN_PROGRESS');
  });
});

describe('reducer — kör vége és extra dobás', () => {
  it('extra dobás esetén a soron lévő játékos marad, nem lép tovább a kör', () => {
    const state = updatePlayer(twoPlayerState(), 'player-1', { extraRollsPending: 1 });
    const readyToEnd = { ...state, turnPhase: 'RESOLVING_SPACE' as const };
    const next = reducer(readyToEnd, { type: 'END_TURN' });
    expect(next.currentPlayerIndex).toBe(0);
    expect(next.turnPhase).toBe('AWAITING_ROLL');
    expect(getPlayer(next, 'player-1').extraRollsPending).toBe(0);
  });

  it('extra dobás nélkül a következő játékosra száll a kör', () => {
    const state = { ...twoPlayerState(), turnPhase: 'RESOLVING_SPACE' as const };
    const next = reducer(state, { type: 'END_TURN' });
    expect(next.currentPlayerIndex).toBe(1);
  });
});
