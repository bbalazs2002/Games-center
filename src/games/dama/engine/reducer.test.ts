import { describe, expect, it } from 'vitest';
import { createInitialState } from './initialState';
import { reducer } from './reducer';
import { king, man, pos, stateWith, withPieces } from './testHelpers';

describe('reducer — kezdőállapot', () => {
  it('LIGHT kezd, 12-12 bábu a táblán', () => {
    const state = createInitialState();
    expect(state.currentPlayer).toBe('LIGHT');
    const pieces = state.board.flat().filter(Boolean);
    expect(pieces).toHaveLength(24);
    expect(pieces.filter((p) => p?.player === 'LIGHT')).toHaveLength(12);
    expect(pieces.filter((p) => p?.player === 'DARK')).toHaveLength(12);
  });
});

describe('reducer — sima lépés', () => {
  it('érvényes lépés után a bábu mozog és a kör átadódik', () => {
    // A távoli DARK bábu csak azért kell, hogy a DARK-nak legyen lépése —
    // enélkül a teszt véletlenül a győzelem-detektálást is triggerelné.
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')],
        [pos(0, 7), man('DARK')],
      ]),
    });
    const next = reducer(state, { type: 'MOVE', from: pos(5, 0), to: pos(4, 1) });

    expect(next.board[5][0]).toBeNull();
    expect(next.board[4][1]).toEqual(man('LIGHT'));
    expect(next.currentPlayer).toBe('DARK');
    expect(next.chainCaptureFrom).toBeNull();
    expect(next.status).toBe('IN_PROGRESS');
  });

  it('érvénytelen célmezőre lépés no-op (ugyanaz a state-referencia)', () => {
    const state = stateWith({ board: withPieces([[pos(5, 0), man('LIGHT')]]) });
    const next = reducer(state, { type: 'MOVE', from: pos(5, 0), to: pos(3, 0) });
    expect(next).toBe(state);
  });

  it('kötelező ütés szabálya: nem-ütő lépés érvénytelen, ha máshol ütés lehetséges', () => {
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')],
        [pos(4, 1), man('DARK')], // (5,0)-nak van ütése
        [pos(5, 4), man('LIGHT')], // ennek csak sima lépése volna
      ]),
    });
    const next = reducer(state, { type: 'MOVE', from: pos(5, 4), to: pos(4, 3) });
    expect(next).toBe(state);
  });
});

describe('reducer — ütés', () => {
  it('ütés eltávolítja a bábut, és kör vált, ha nincs további ütés', () => {
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')],
        [pos(4, 1), man('DARK')],
      ]),
    });
    const next = reducer(state, { type: 'MOVE', from: pos(5, 0), to: pos(3, 2) });

    expect(next.board[4][1]).toBeNull();
    expect(next.board[3][2]).toEqual(man('LIGHT'));
    expect(next.currentPlayer).toBe('DARK');
    expect(next.chainCaptureFrom).toBeNull();
  });

  it('láncütés: a kör nem vált, amíg ugyanaz a bábu tovább üthet', () => {
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')],
        [pos(4, 1), man('DARK')],
        [pos(2, 3), man('DARK')],
        [pos(5, 4), man('LIGHT')], // ne legyen egyedüli LIGHT bábu — mellékszereplő a láncütés-kényszer teszteléséhez
        [pos(0, 7), man('DARK')], // ne fogyjon el az összes DARK bábu — ez a teszt a láncütésről szól, nem a győzelemről
      ]),
    });

    const afterFirstHop = reducer(state, { type: 'MOVE', from: pos(5, 0), to: pos(3, 2) });
    expect(afterFirstHop.currentPlayer).toBe('LIGHT');
    expect(afterFirstHop.chainCaptureFrom).toEqual(pos(3, 2));
    expect(afterFirstHop.board[4][1]).toBeNull();

    // Lánc közben más bábuval lépni tilos.
    const illegalOtherPiece = reducer(afterFirstHop, { type: 'MOVE', from: pos(5, 4), to: pos(4, 3) });
    expect(illegalOtherPiece).toBe(afterFirstHop);

    const afterSecondHop = reducer(afterFirstHop, { type: 'MOVE', from: pos(3, 2), to: pos(1, 4) });
    expect(afterSecondHop.board[2][3]).toBeNull();
    expect(afterSecondHop.board[1][4]).toEqual(man('LIGHT'));
    expect(afterSecondHop.currentPlayer).toBe('DARK');
    expect(afterSecondHop.chainCaptureFrom).toBeNull();
    expect(afterSecondHop.status).toBe('IN_PROGRESS');
  });
});

describe('reducer — promóció', () => {
  it('sima lépéssel az utolsó sorra érve a bábu dámává válik', () => {
    const state = stateWith({ board: withPieces([[pos(1, 0), man('LIGHT')]]) });
    const next = reducer(state, { type: 'MOVE', from: pos(1, 0), to: pos(0, 1) });
    expect(next.board[0][1]).toEqual(king('LIGHT'));
  });

  it('döntés: promóció megszakítja a láncütést, akkor is, ha lenne további ütés', () => {
    const state = stateWith({
      board: withPieces([
        [pos(2, 1), man('LIGHT')],
        [pos(1, 2), man('DARK')],
        [pos(1, 4), man('DARK')], // (0,3)-ból mint király tudna ütni, de a promóció után nem folytatódik
      ]),
    });
    const next = reducer(state, { type: 'MOVE', from: pos(2, 1), to: pos(0, 3) });

    expect(next.board[0][3]).toEqual(king('LIGHT'));
    expect(next.currentPlayer).toBe('DARK');
    expect(next.chainCaptureFrom).toBeNull();
  });
});

describe('reducer — győzelem-detektálás', () => {
  it('ha az ellenfél utolsó bábuját is leütik, a lépő fél nyer', () => {
    const state = stateWith({
      board: withPieces([
        [pos(5, 0), man('LIGHT')],
        [pos(4, 1), man('DARK')], // DARK egyetlen bábuja
      ]),
    });
    const next = reducer(state, { type: 'MOVE', from: pos(5, 0), to: pos(3, 2) });
    expect(next.status).toBe('LIGHT_WON');
  });
});
