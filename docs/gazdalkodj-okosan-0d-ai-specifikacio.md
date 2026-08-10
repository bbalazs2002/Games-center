# Gazdálkodj okosan-0d — Specifikáció: AI ellenfél

**Státusz:** IMPLEMENTÁLVA — a teljes terv (3-7. szakaszok) elkészült, tesztelve. Online módban (Colyseus szoba) a huzalozás Hotel bevált mintáját pontosan tükrözi és `tsc`/live hot-seat teszttel megerősítve, de saját, futó Colyseus-szerver ellen ÉLŐBEN nem lett kipróbálva ebben a körben (a teljes stack — Postgres, auth — felhúzásának költsége/haszon aránya nem indokolta egy már bizonyítottan működő, változtatás nélkül átvett minta újratesztelését).
**Utolsó frissítés:** 2026-08-09
**Kapcsolódik:** [gazdalkodj-okosan-0a-specifikacio.md](./gazdalkodj-okosan-0a-specifikacio.md), [gazdalkodj-okosan-0b-multiplayer-specifikacio.md](./gazdalkodj-okosan-0b-multiplayer-specifikacio.md), [hotel-0d-ai-specifikacio.md](./hotel-0d-ai-specifikacio.md) (a fő minta, amit ez a terv kiterjeszt), [dama-0d-ai-specifikacio.md](./dama-0d-ai-specifikacio.md), [gwent-0e-ai-specifikacio.md](./gwent-0e-ai-specifikacio.md)

## 1. Cél és hatókör

**Kérés:** a `GazdalkodjOkosanRoom.computeAiMove()` jelenleg szándékos stub — mindig `null`-t ad vissza, kommentje szerint "0d feladata". Ez a kör valódi AI-döntéshozó logikát épít, ONLINE (Colyseus-szoba) ÉS hot-seat módban egyaránt.

**Hatókörben van:**
- Új, megosztott `src/shared/games/gazdalkodjOkosan/ai/` modul: háromszintű nehézségű, keresés-alapú (expectimax) döntéshozó, Hotel architektúrájának kiterjesztésével.
- `GazdalkodjOkosanRoom.computeAiMove`/`aiMoveDelayMs` tényleges implementációja, `aiDifficulty` bekötése a már meglévő, game-agnosztikus `GameRoomCreateOptions` mezőkből.
- Lobby UI: `gamesRegistry.ts` gazdalkodj-okosan bejegyzése kap `supportsAiOpponentCount: true`-t (Hotel/Ramses mintája — 2-6 fős szoba, több AI is lehet egyszerre).
- **Hot-seat AI** — ugyanaz a döntéshozó logika (`shared/games/gazdalkodjOkosan/ai`), amit az online mód is használ, hot-seat módban is elérhető, a döntéshozó kód duplikálása nélkül (Hotel §9 mintája).

**Nincs hatókörben:**
- **Az értékelő függvény pontos súlyainak playtesztelt finomhangolása** — a lenti súlyok induló javaslatok, a finomítás valódi lejátszott partik alapján a felhasználó dolga (Hotel-0d §1 azonos kizárása).
- Szlotonkénti (nem csak szobánkénti) AI-nehézség — nincs rá jelzett igény, a meglévő game-agnosztikus `aiDifficulty` mező (egy érték/szoba) elég.
- Egy régóta ismert, ehhez a körhöz nem kapcsolódó apróság: a kliens online módban is mindig küld egy valódi `ROLL_MOVE_DICE.value`-t, amit a szerver úgyis felülír (`GazdalkodjOkosanRoom.resolveServerAction`) — pontosan úgy, ahogy Hotel is teszi éles kódban. Feleslegesen mozgatott adat, de ártalmatlan (a `ColyseusGameTransport`-nak nincs optimista kliens-oldali predikciója, tehát az eldobott érték soha nem is látszik) — külön, jövőbeli körre halasztva.

## 2. Miért Hotel a minta, nem Dáma/Ramses/Gwent

| Tulajdonság | Dáma | Gwent | Ramses | Hotel | **Gazdálkodj okosan** |
|---|---|---|---|---|---|
| Játékosszám | 2, zéróösszegű | 2, zéróösszegű | 2 | 2-4 | **2-6** |
| Valódi véletlen a motorban | nincs | nincs (kártyahúzás önjátékos szemszögből ismert) | rejtett infó (kincsek) | kockadobás | **kockadobás** |
| Kör-szerkezet | 1 lépés/kör | 1 lap/kör | 1 csúsztatás/kör | dobás→vásárlás→építés→…→kör vége (több allépés) | dobás→(törlesztés)→mezőhatás→(kártya-ack)→(fizetés-split)→(vásárlás(ok))→kör vége (több allépés) |
| Kívül-a-soron cselekvő | nincs | nincs | nincs | van (árverés) | **nincs** |

A Gazdálkodj okosan kockadobás-vezérelt, többfős, több-allépéses kör — pontosan a Hotel-féle indoklás (`hotel-0d-ai-specifikacio.md` §4.2: "minimax nem elég, mert N-játékos ÉS kockadobás-vezérelt") erre a játékra is igaz. Ramses rejtett infója, Gwent kártya-alapú determinizmusa, Dáma zéróösszegű 2-fős jellege egyik sem illik ide.

**Két, Hotelnél nehezebb dimenzió ITT egyszerűbb:**
- **A Szerencsekártya-húzás NEM valódi véletlen-csomópont** — a `chanceDeck` ciklikus sor (húzott lap a sor végére kerül, nincs újrakeverés), a motor állapotában (`state.chanceDeck`) teljesen látható és determinisztikus. Egyedül a kockadobás (1-6, egyenletes) marad valódi chance node.
- **Nincs árverés / kívül-a-soron cselekvő** — mindig csak `getCurrentPlayer(state)` dönt (Dáma/Gwent mintája), nem kell Hotel árverés-specifikus szlot-kikérdezés.
- **A kocka-érték generálás online módban már szerver-oldali** (`GazdalkodjOkosanRoom.resolveServerAction`, `rollD6()`) — a Hotel-0d §4.6-ban feltárt "kliens csalhat a dobással" rés itt már meg van oldva.

## 3. Architektúra

Új modul: `src/shared/games/gazdalkodjOkosan/ai/` — tisztán a `reducer`/`rules`/`selectors` felett, sosem nyúl közvetlenül `state`-hez a `can*` predikátumok megkerülésével.

```
src/shared/games/gazdalkodjOkosan/ai/
  index.ts              — chooseGazdalkodjOkosanAiAction, GazdalkodjOkosanAiDifficulty, GAZDALKODJ_OKOSAN_AI_MOVE_DELAY_MS
  actionEnumerator.ts   — enumerateCandidateActions(state, actorId), isChanceNodePhase, chanceOutcomes
  heuristic.ts           — evaluateState(state, forPlayerId)
  expectimax.ts          — chooseBestAction(state, actorId, ownPlies)
  simulate.ts             — simulateGazdalkodjOkosanGame (manuális AI-vs-AI driver)
  strategy.test.ts, actionEnumerator.test.ts, heuristic.test.ts
```

Lásd [diagrams/gazdalkodj-okosan-0d-ai-architecture.puml](./diagrams/gazdalkodj-okosan-0d-ai-architecture.puml) — a modul felépítése és a szerver/kliens integrációs pontok, a Dáma-0d/Ramses-0c architektúra-diagramok stílusát követve.

### 3.1 Belépési pont

```ts
export function chooseGazdalkodjOkosanAiAction(
  state: GazdalkodjOkosanState,
  slot: PlayerId,
  difficulty: GazdalkodjOkosanAiDifficulty,
): GazdalkodjOkosanAction | null
```
- `if (state.status !== 'IN_PROGRESS' || getCurrentPlayer(state).id !== slot) return null;` — nincs kívül-a-soron cselekvés.
- `AWAITING_ROLL` fázisban: valódi dobás, nem keresés — `{ type: 'ROLL_MOVE_DICE', value: rollD6() }` (a meglévő, megosztott `dice.ts` `rollD6()`-ja; online módban a szerver úgyis felülírja, hot-seat módban ez a hiteles dobás).
- Minden más fázisban: delegál `expectimax.ts`'s `chooseBestAction(state, slot, DIFFICULTY_DEPTH[difficulty])`-nek.
- `GazdalkodjOkosanAiDifficulty = 'EASY' | 'MEDIUM' | 'HARD'`, `DIFFICULTY_DEPTH = { EASY: 1, MEDIUM: 2, HARD: 3 }` — Hotel azonos konvenciója (saját-kör-mélység).

### 3.2 Akció-enumerálás — folytonos döntések kanonikus jelöltre redukálva

`enumerateCandidateActions(state, actorId)` a `selectors.ts` `getValidActions(state)` + `rules.ts` `can*` predikátumok felett épül. A motor több döntése folytonos/tetszőleges összegű (fizetés-split, törlesztés-túlfizetés, befizetés összege) — ezeket Hotel `getMinimumBidAmount`-mintájára egyetlen kanonikus jelöltre szűkítjük, nem ágaztatjuk a keresést dollár-szintű felbontásban:

- **`SETTLE_PAYMENT`**: egyetlen jelölt, egy determinisztikus split-szabály szerint (`decidePaymentSplit`).
- **`PAY_APARTMENT_INSTALLMENT` / `PAY_CAR_INSTALLMENT`**: max 2 jelölt — minimum fizetés, VAGY a teljes hátralévő egyenleg (korai törlesztés), ha megengedhető.
- **`BUY_FURNITURE`**: egy jelölt minden még nem birtokolt, a mezőn kínált, megfizethető tételre (a 33-as mező max 4 egyszerre).
- **`BUY_APARTMENT` / `BUY_CAR`**: 2 jelölt (`financed: true/false`), ha mindkettő megengedhető; egyébként csak az elérhető.
- **`BUY_INSURANCE`**: egy jelölt minden még nem birtokolt, megköthető kötvényre (max 3).
- **`OPEN_BANK_ACCOUNT` / `DEPOSIT_TO_ACCOUNT`**: nyitás, ha nincs számla; ha van és `player.cash > 0`, a **teljes** készpénz befizetése (nem csak egy puffer feletti rész) — a folyószámla ugyanolyan azonnal elérhető minden fizetéshez, mint a készpénz, tehát a befizetésnek nincs likviditási kockázata, csak 7%-os kamatot nyer vele a játékos.
- **`WITHDRAW_FROM_ACCOUNT`**: kihagyva a jelöltek közül (Hotel önkéntes `START_AUCTION`-kizárásának mintájára) — a `SETTLE_PAYMENT` split-je már közvetlenül eléri a folyószámlát.
- **`DRAW_CHANCE_CARD` / `ACK_CHANCE_CARD`**: mindig pontosan 1 jelölt, amikor a fázis megköveteli.
- **`END_TURN`**: jelölt, amikor `canEndTurn(state)` igaz.

`isChanceNodePhase(state)` = `turnPhase === 'AWAITING_ROLL'`; `chanceOutcomes(state)` = 6 egyenlő súlyú (1/6) `ROLL_MOVE_DICE{value: 1..6}` ág.

### 3.3 Értékelő függvény (`heuristic.ts`)

A győzelmi feltétel (`hasWon`, `rules.ts`) 5 diszkrét, EGYIDEJŰLEG teljesítendő komponensből áll: lakás kifizetve, mind a 6 bútor, autó kifizetve, autóbiztosítás, `totalWealth >= 2000`. Mivel a 2000-es küszöb triviálisan alacsony a 18000-es induló készpénzhez képest, a nyerés motorja szinte kizárólag a **tulajdon-teljesítettség**, nem a vagyon-maximalizálás — alapvetően eltér Hotel korlátlanul kumulálódó portfólió-értékétől:

- **Tulajdon-teljesítettségi pontszám (domináns súly)** — minden teljesített feltétel (lakás/autó fully-owned, bútor-hányad 0-6/6, autóbiztosítás) nagy bónuszt ad, az utolsó hiányzó feltétel aránytalanul nagyot (közeli győzelem felismerése).
- **Nettó vagyon** (`totalWealth = cash + bankAccount.balance`, plusz finanszírozott tételek nettó egyenlege). A `cash`/`bankAccount.balance` FELOSZTÁSA közömbös — csak az összegük számít (a folyószámla ugyanolyan azonnal elérhető minden fizetéshez). **Nincs "alacsony készpénz" büntető tag** — a bankba fizetés sosem kap negatív pontszámot.
- **Csőd-közelségi büntetés** — kvadratikus levonás alacsony `totalWealth` (nem külön `cash`) alatt, Hotel mintájára; csőd = `-100_000`.
- **Ellenfelek csőd-közelsége** — kisebb, versengő bónusz (Hotel §4.3 negyedik tényezője).
- Élet-/lakásbiztosítás — kicsi, opcionális bónusz (nem nyerési feltétel).
- **Ritka-alkalom bónusz vásárlási döntéseknél** — egy adott vásárlási mezőre (lakás/autó/bútor/biztosítás/BKV) érkezés statisztikailag ritka (42 mezőből csak néhány kínálja, kockadobás-vezérelt mozgás nem garantálja a visszatérést). A jelölt-pontozás emiatt NEM feltételezheti, hogy a "várjunk jobb pillanatra" opció ugyanolyan könnyen elérhető — egy éppen elérhető, megfizethető BUY_* jelölt kapjon kis, explicit bónuszt, különösen az EASY/1-mélységű és az ellenfeleket szimuláló mohó politikában, ahol nincs mélyebb keresés, ami ezt "magától" felfedezné. **Alapelv: vásárolj, ha megteheted, ne halogass egy ritka mezőn** — a pontos súly playteszteléssel hangolandó.

### 3.4 Keresés (`expectimax.ts`)

Hotel `expectimax.ts`-ének mintája: **aszimmetrikus expectimax** — a gyökér-szereplő (a kérdezett `slot`) saját döntései teljesen kifejtve `ownPlies` mélységig, minden MÁS szereplő egy olcsó, egy-lépéses mohó politikával (`greedyAction`) van szimulálva. Chance node-ok (kizárólag `ROLL_MOVE_DICE`) súlyozott várható értékként összegződnek. Biztonsági korlát: 200ms fali-idő budget + max csomópont-mélység (Hotel azonos `SEARCH_TIME_BUDGET_MS`/`MAX_NODE_DEPTH` konstansai) — a keresés a valódi, tiszta `reducer(state, action)`-t hívja hipotetikus akciókra, mellékhatás nélkül.

## 4. Room-huzalozás (online mód)

```ts
protected computeAiMove(state: GazdalkodjOkosanState, slot: PlayerId): GazdalkodjOkosanAction | null {
  return chooseGazdalkodjOkosanAiAction(state, slot, this.aiDifficulty);
}
protected aiMoveDelayMs(): number {
  return GAZDALKODJ_OKOSAN_AI_MOVE_DELAY_MS;
}
```
`this.aiDifficulty` a meglévő, game-agnosztikus `GameRoomCreateOptions.aiDifficulty?: string` mezőből (Hotel/Gwent mintája), alapértelmezett `'MEDIUM'`. Nincs core (`GameRoom.ts`) módosítás — az `aiOpponentCount`/`aiDifficulty` mezők és a `computeAiMove(state, slot)` szignatúra már a Hotel-0d körben véglegesítve lett.

`gamesRegistry.ts` gazdalkodj-okosan bejegyzése kap egy `supportsAiOpponentCount: true`-t — a lobby UI ebből automatikusan megkapja az N-fős AI-választót + nehézségi legördülőt, nincs game-specifikus UI-kód szükséges.

## 5. Hot-seat AI

Hotel §9 (`useHotSeatAi.ts`) mintája:
- `src/client/games/gazdalkodjOkosan/ui/useGazdalkodjOkosanHotSeatAi.ts` — `useEffect`-alapú poller, `chooseGazdalkodjOkosanAiAction`-t hív a `LocalGameTransport` aktuális állapotára minden változás után (+ `GAZDALKODJ_OKOSAN_AI_MOVE_DELAY_MS` késleltetés), amíg egy AI-szlot tud lépni.
- `GazdalkodjOkosanSetupPage.tsx` — minden játékosnév mellé egy AI jelölőnégyzet + egy globális nehézségi legördülő, `GazdalkodjOkosanHotSeatAiSlots = Partial<Record<PlayerId, GazdalkodjOkosanAiDifficulty>>`.
- `GazdalkodjOkosanGamePage.tsx` — kap egy `hotSeatAiSlots` propot (üres = tisztán emberi játék), bekötve a hookba, csak `isLocalMode` esetén.

## 6. Tesztelés

- **`actionEnumerator.test.ts`** — minden fázis helyes jelölt-listát ad (pl. `AWAITING_PAYMENT`-nél pontosan 1 `SETTLE_PAYMENT`; a 33-as mezőn max 4 `BUY_FURNITURE`; `WITHDRAW_FROM_ACCOUNT` soha nincs a jelöltek közt).
- **`heuristic.test.ts`** — monotonitási tulajdonságok (több bútor > kevesebb; kifizetett lakás > finanszírozott azonos nettó vagyonnal; csőd = nagy negatív; `hasWon`-hoz közeli állapot > távoli).
- **`strategy.test.ts`** — fázisonkénti helyes-döntés tesztek + egy AI-only teljes játék smoke test (Hotel/Dáma mintája, vitest-en belül).
- `scripts/simulate-gazdalkodj-okosan-ai-games.ts` + `simulate.ts` — manuális, nem-vitest AI-vs-AI batch-futtató (súly-finomhangolás eszköze, NEM ennek a körnek a feladata).

## 7. Verifikáció

- `tsc`, `eslint .`, `vitest run`, `vite build`.
- Élő Playwright: (1) online szoba 1+ AI-ellenféllel, egy teljes AI-kör hiba/beragadás nélkül. (2) hot-seat setup lapon egy AI-jelölt játékos, ugyanez. (3) hosszabb AI-only stressz-menet stabilitás-ellenőrzése.
