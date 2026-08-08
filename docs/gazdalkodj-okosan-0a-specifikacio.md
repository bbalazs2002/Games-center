# Gazdálkodj okosan-0a — Specifikáció: motor + N-fős hot-seat (Tesco-kiadás)

**Státusz:** TERVEZVE — kód még nem készült, ez a jóváhagyásra váró specifikáció.
**Utolsó frissítés:** 2026-08-08
**Kapcsolódik:** [Projekt-conception.md](./Projekt-conception.md) (C-klaszter: Hotel, Gazdálkodj okosan, Monopoly, Ladders and snakes — "a Hotel-en megépült 3D/N-fős/AI infrastruktúra nagyrészt újrafelhasználható"), [hotel-0a-specifikacio.md](./hotel-0a-specifikacio.md) (ugyanez a minta: framework-agnosztikus reducer, körbejárható pálya, `LoopTrackBoard3D`)

## 0. Forrás — ne a "jól ismert" változatot feltételezzük

A [[feedback_boardgame_workflow]] tanulsága (Hotel, Ramses) itt is beigazolódott: a jelenleg kereskedelmi forgalomban kapható, hivatalos 2023-as "Gazdálkodj okosan!" kiadás szabályát előzetesen lekértem az internetről (forint alapú, GENERALI/OTP szponzorokkal) — **ez NEM a ti példányotok**. A ti fizikai dobozotok egy **külön, régebbi Tesco-promóciós kiadás**, saját, eurós valutával és teljesen más szponzorkészlettel (doboz: kék alapon EU-csillagok, "gazdálkodj okosan Társasjáték", bal alsó sarokban TESCO logó).

**Hiteles forrás mostantól:** `assets/GazdalkodjOkosan/` (a repóban, `.gitignore`-ban nem kizárt helyi mappa a felhasználótól kapott anyagokkal):
- `images/box.png` — a doboz fotója
- `images/board.png` — **a fizikai tábla fotója (2026-08-08 óta rendelkezésre áll)** — a 41 mező pontos elrendezését, óramutató járása szerinti haladási irányát (a Start mezőnél balra mutató nyíl → bal felé, majd a bal oldalon felfelé, tetején jobbra, jobb oldalon lefelé — azaz óramutató járása szerint) és a mezőkre nyomtatott árakat mutatja. **Ez a legmagasabb prioritású forrás mező-ár kérdésekben** — több esetben pontosabb/eltérő a szabálykönyv narratív szövegénél (lásd 2.5 szakasz javításai).
- `jatekszabaly.txt` — a nyomtatott szabálykönyv (5 oldal) legépelt szövege
- `szerencsekartyak.json` — 35 db Szerencsekártya legépelt szövege (a `id` mezők sorszámozása esetleges, a felhasználó szerint javítható/újraszámozható)
- felhasználói pontosítás (2026-08-08, chat) a hiányzó tétel-árakról (5., 9., 11., 19./39., 33., 38. mező)

## 1. Cél és hatókör

**Gazdálkodj okosan-0a** a Dáma/Hotel "Fázis 0a" mintáját követi: **tisztán helyi (hot-seat, egy gépen körbeadva), multiplayer nélkül**, a végleges motorral. Mivel a C-klaszter (Hotel, Gazdálkodj okosan, Monopoly) explicit módon a Hotelen megépült infrastruktúrára épül, ez a fázis **újrahasználja**:
- a `LoopTrackBoard3D` generikus, körbejárható pálya-rendererét (Hotel-0a) — geometriai placeholderrel, amíg a valódi tábla-fotó és a belőle készülő assetek meg nem érkeznek (Gazdálkodj okosan-0c, Hotel mintájára);
- a `core/games` szeparációs elvet — csak az, ami Hotel ÉS Gazdálkodj okosan ÉS Monopoly számára is szó szerint azonos kód lenne, kerül `core/`-ba.

**Hatókörben van:**
- A motor (state, action-ok, reducer, `rules.ts`, `selectors.ts`) — pálya-bejárás, készpénz + folyószámla, lakás- és autóvásárlás (készpénz vagy részlet), bútorvásárlás, biztosítások, Szerencsekártyák, csőd, győzelmi feltétel ellenőrzése, teljes eseménynaplózás (`log: LogEntry[]`, lásd 3.1 szakasz)
- N-fős (2–6) hot-seat játékmenet, `LoopTrackBoard3D` placeholder-geometriával
- A 41 mező és a 35 Szerencsekártya teljes, adatvezérelt (nem kódba égetett) definíciója

**Nincs hatókörben (külön, jövőbeli fázis, a Hotel mintáját követve):**
- Multiplayer (0b)
- Végleges vizuál/assetek — tábla-textúra, mező-ikonok, bútor-illusztrációk, szponzor-logók (0c) — a tábla-fotó megérkezése után
- AI ellenfél (0d)
- Az eredeti fizikai játék "vágd ki a bútorlapokat" előkészítő lépése digitálisan értelmetlen, nincs is rá szükség a motorban

## 2. A valódi szabályok

### 2.1 Alapmenet

- 2–6 fő, mindenki 18.000 EUR készpénzzel indul.
- Kockadobás → lépés a nyíl irányába (óramutató járása szerint) → a landolt mező utasítása.
- A START mezőn **áthaladva** 2.000 EUR, **rálépve** 4.000 EUR jár.
- **Irány mindig előre:** a játékosok kizárólag óramutató járása szerint (előre) haladnak — ez a Szerencsekártyák `MOVE_TO` hatására is igaz, felhasználói hangsúlyozás (2026-08-08). A motor sosem "teleportál" egyenesen a célmezőre: a jelenlegi pozíciótól előre haladva számolja ki az utat, és ha eközben áthalad a START mezőn (vagy pontosan arra lép), a szokásos START-bónusz (2.000 áthaladva / 4.000 rálépve) **ugyanúgy jár**, mint egy kockadobás utáni lépésnél. A szabálykönyv ezt kifejezetten példával is illusztrálja: *"Ha pl. valaki a 16-os mezőn az utasítás szerint a 8-as mezőre kell lépjen, mivel áthaladt a START mezőn, megilleti a 2.000 euró."* — ez azért fordulhat elő, mert 8 < 16, tehát az előre haladó út a Starton át vezet. Lásd 3. szakasz, közös `advanceForward` segédfüggvény.
- **Győzelmi feltétel** (a szabálykönyv szó szerinti megfogalmazása): elsőként megszerzi a lakást (teljes kifizetéssel) ÉS berendezi ÉS megszerzi az autót (teljes kifizetéssel) ÉS kifizeti az autóbiztosítást, ÉS eközben/ezután marad legalább **2.000 EUR**-ja.
- **Csőd:** aki fizetésképtelenné válik, kiesik — meglévő berendezési tárgyait vissza kell adnia a banknak. Berendezést a játékosok egymásnak **nem** adhatnak el.
- **Kórház (13-as mező):** csak 1-es vagy 6-os dobással lehet kilépni; a 3. kör után bármilyen dobással.
- **Készpénz és folyószámla — két KÜLÖN nyilvántartott összeg** (felhasználói pontosítás, 2026-08-08), játékosonként legfeljebb 1 folyószámlával. **A nyitás ÉS a befizetés kizárólag a 8-as mezőn lehetséges** (amikor a játékos éppen ott áll — mindegy, hogy dobással vagy Szerencsekártyával érkezett oda) — javítva (2026-08-08): korábban tévesen bárhonnan elérhetőnek jelöltem. Nyitáskor a játékos azonnal bankkártyát is kap. **A kivétel viszont bármikor, bárhol lehetséges** — és ugyanígy a folyószámláról közvetlenül is lehet fizetni bárhol/bármikor (funkcionálisan egyenértékű egy előzetes kivétellel), nincs mezőhöz kötve.
- **Kamat:** a folyószámla-egyenleg után **7%** kamat jár, a **8-as mezőn áthaladva vagy arra rálépve** — a szabálykönyv szövege tévesen a 2-es mezőt említette, felhasználói pontosítás szerint a helyes mező a 8-as (ahol egyébként a számlanyitás is történik).
- **BKV-bérlet:** kizárólag a 2-es mezőn vásárolható meg (200 EUR, egyszeri) — a 15-ös és 27-es mező **nem vásárlási pont**, ott a bérlet ténye csak feltételt jelent, venni nem lehet. **Mindkét mező hatása feltételes: csak akkor érvényes, ha a játékosnak már van bérlete** — javítva (2026-08-08): korábban tévesen csak a 15-öst jelöltem feltételesnek, a 27-es Szerencsekártya-húzása is ugyanígy bérlethez kötött. Bérlet nélkül sem a 15-ös, sem a 27-es mezőnek nincs hatása.
- **Kötelező törlesztés időzítése:** az autó- és a lakáshitel törlesztő részlete abban a **körben esedékes, amelyben a játékos DOBÁSSAL (`ROLL_MOVE_DICE`) áthalad a START mezőn, vagy arra rálép** — javítva (2026-08-08): ha a START-áthaladás/rálépés Szerencsekártya `MOVE_TO` hatására történik, a pénzbónusz (2.000/4.000) ugyanúgy jár, de **törlesztés NEM válik esedékessé** ilyenkor. A törlesztés csak dobás utáni mozgáshoz kötött, nem minden körben, és nem field-hez (5/19/39) kötve. A törlesztés **nem automatikus**: a soron lévő játékosnak ezt kell az adott kör **kötelező első lépéseként** végrehajtania (`PAY_CAR_INSTALLMENT`/`PAY_APARTMENT_INSTALLMENT`), mielőtt bármi mást tehetne — lásd a 3. szakasz `AWAITING_MANDATORY_INSTALLMENT` fázisát. Ha a játékos nem tudja kifizetni, a csőd-szabály lép életbe (fent).

### 2.2 Lakás- és autóvásárlás

| | Készpénz | Hitelre (összesen) | Kezdő részlet | Törlesztő/kör |
|---|---|---|---|---|
| **Autó** (5-ös mező, Citroën C4) | 10.000 EUR | 15.000 EUR | 2.000 EUR | 500 EUR |
| **Lakás** (19-es VAGY 39-es mező) | 30.000 EUR | 35.000 EUR | 15.000 EUR | 500 EUR |

- A törlesztés időzítése mindkettőnél azonos: a START mezőn való áthaladáshoz/rálépéshez kötött, mezőtől (5/19/39) függetlenül — lásd 2.1 szakasz. A 19-es és 39-es mező tehát **ugyanaz a vásárlási lehetőség**, csak két helyen a pályán; mivel a törlesztés nem mezőhöz kötött, nem kérdés, melyiken kell fizetni.

### 2.3 Bútor

| Mező | Tétel | Ár |
|---|---|---|
| 11 | Konyhabútor (HANÁK) | 1.000 EUR |
| 33 | Mosógép (Electrolux) | 300 EUR |
| 33 | Hűtőszekrény (Electrolux) | 200 EUR |
| 33 | Mosogatógép (Electrolux) | 300 EUR |
| 33 | Tűzhely (Electrolux) | 200 EUR |
| 38 | Szobabútor | 3.000 EUR |

Csak a 11-es, 33-as, 38-as mezőkön vásárolható, és **csak akkor, ha a játékosnak már van lakása**. A "berendezés teljes" győzelmi feltétel **mind a 6 különálló tételt** megköveteli (konyhabútor + 4 Electrolux-tétel + szobabútor) — felhasználói megerősítés (2026-08-08): "Minden bútort meg kell vásárolni + az autót + az autó biztosítást + min. 2000 EUR-val kell rendelkezni."

### 2.4 Biztosítás (9-es mező, ALLIANZ HUNGÁRIA)

| Típus | Ár |
|---|---|
| Életbiztosítás | 200 EUR |
| Lakásbiztosítás | 100 EUR |
| Autóbiztosítás | 100 EUR |

Az autóbiztosítás kifizetése a győzelmi feltétel része. A lakás- és autóbiztosítás emellett védelmet ad a Szerencsekártyák tűzeset/autólopás eseményei ellen (2.6 szakasz).

### 2.5 A pálya 41 mezője

*(a teljes, szó szerinti mezőszöveg forrása: `assets/GazdalkodjOkosan/jatekszabaly.txt` — itt csak a mechanikai hatás, a UI-szöveg onnan töltendő be. Az árak forrása a `board.png` tábla-fotó, a felhasználó által ellenőrzött és javított összegekkel — ez eltért/pontosabb volt, mint a szabálykönyv narratív szövege több mezőnél.)*

| Mező | Típus | Hatás |
|---|---|---|
| START | — | áthaladva 2.000, rálépve 4.000 EUR |
| 1 | fizetés | 200 EUR (PARWAN szőnyeg) |
| 2 | BKV-bérlet | 200 EUR (csak első alkalommal; 2/15/27-en újra ingyenes ha már megvette) |
| 3, 10, 16, 23, 32, 37 | Szerencsekártya | húzás a pakli tetejéről, végrehajtás, vissza a pakli aljára |
| 4 | fizetés | 40 EUR (ZILA Kávéház) |
| 5 | autóvásárlás | 2.2 szakasz |
| 6 | fizetés | 100 EUR (mulató) |
| 7 | flavor | nincs kötelezettség (sport) |
| 8 | bank | **egyetlen hely, ahol folyószámla nyitható és befizetés tehető rá** (kivétel/fizetés a számláról bárhol lehetséges, lásd 2.1); áthaladva/rálépve **7% kamat jár a folyószámla-egyenleg után** |
| 9 | biztosítás | 2.4 szakasz |
| 11 | konyhabútor | 2.3 szakasz (csak lakással) |
| 12 | flavor | nincs kötelezettség (Állat- és Növénykert) |
| 13 | kórház | 1-es/6-os dobásig (v. 3. kör után bármi) nem mozoghat |
| 14 | fizetés | 80 EUR (DEICHMANN cipő) |
| 15 | jutalom (feltételes) | extra dobás, **csak ha van BKV-bérlete** — nem vásárlási pont |
| 17 | fizetés | 20 EUR (mozi) |
| 18 | fizetés | 60 EUR (ALEXANDRA könyv) |
| 19, 39 | lakásvásárlás | 2.2 szakasz |
| 20 | fizetés | 100 EUR (GSM) |
| 21 | fizetés | 280 EUR (Club Tihany) |
| 22 | flavor | nincs kötelezettség (Nemzeti Galéria) |
| 24 | fizetés | 40 EUR (visegrádi hajókirándulás) |
| 25 | fizetés | 40 EUR (Kakas étterem) |
| 26 | flavor | nincs kötelezettség (Margitsziget) |
| 27 | Szerencsekártya (feltételes) | húzás, **csak ha van BKV-bérlete** — ha nincs, nincs hatás; nem vásárlási pont |
| 28 | fizetés | 300 EUR (Tesco) |
| 29 | flavor | nincs kötelezettség (Halászbástya) |
| 30 | fizetés | 300 EUR (Vista utazási iroda) |
| 31 | fizetés | 20 EUR (Pick) |
| 33 | bútor (Electrolux) | 2.3 szakasz (csak lakással) |
| 34 | fizetés | 300 EUR (Sky Europe) |
| 35 | fizetés | 20 EUR (Mézesmackó) |
| 36 | fizetés | 20 EUR (Mammut mozi) |
| 38 | szobabútor | 2.3 szakasz (csak lakással) |
| 40 | fizetés | 20 EUR (Invitel) |
| 41 | fizetés + büntetés | 20 EUR, és a következő körben nem dobhat |

A fenti árak a felhasználó által ellenőrzött/javított tábla-fotó alapján véglegesnek tekinthetők. A ténylegesen ingyenes flavor-mezők: 7, 12, 22, 26, 29 (a 13-as a Kórház, külön mechanika, nem "flavor").

### 2.6 Szerencsekártyák (35 db)

A `szerencsekartyak.json` alapján, hatás szerint csoportosítva — a pontos szöveg és a mezőszám-hivatkozások onnan töltendők be futásidőben, nem kódba égetve:

- **Pénznyeremény** (Totó/Lottó/munkajutalom/"újítás") — fix összeg jóváírása: 400, 800, 1.000, 2.000, 2.500, 6.000, 10.000 EUR (7 kártya)
- **Fizetés + mezőre lépés** — a játékos átkerül egy adott mezőre, és ott a mező (vagy a kártya) szerinti összeget fizeti: pl. Club Tihany (→21, 280 EUR + extra dobás), Sky Europe (→START, 300 EUR), Pick (→31, 20 EUR), Tesco kedvezménnyel (→28, 240 EUR) (4 kártya)
- **Csak mezőre lépés, fizetés nélkül** (a landolt mező saját szabálya alkalmazandó) — Alexandra(→18), víz/gázszámla(→8, 40 EUR), Margitsziget(→26), Zila(→4), Hanák(→11), Invitel(→40), Electrolux(→33), Kakas(→25), Citroën(→5), Vista(→30), mulató(→6, 100 EUR), Visegrád(→24), Parwan(→1), takarékossági emlékeztető(→8, `id 41`, lásd lent) (14 kártya)
- **Bútornyeremény** — a kártyán megnevezett bútortételt megkapja a játékos; ha már megvan neki, a bank készpénzben kifizeti az ellenértékét (a szabálykönyv explicit szabálya); a "BNV sorsjáték szobabútor" kártyánál külön eset: ha nincs lakása, 3.000 EUR készpénzt kap helyette (3 kártya: mosógép, mosogatógép, szobabútor)
- **Tűzeset** — elveszíti a teljes berendezését; ha van lakásbiztosítása, az ALLIANZ kifizeti **a berendezés teljes (eredeti vásárlási) árát** — felhasználói megerősítés (2026-08-08). Ha nincs biztosítása, a 9-es mezőre kerül, ahol azonnal köthet biztosítást (a jelenlegi kárára ez már nem vonatkozik) (1 kártya)
- **Autólopás** — elveszíti az autóját, és a hátralévő hitel (ha volt) **megszűnik** (nem kell tovább törleszteni). Ha van autóbiztosítása, az ALLIANZ kifizeti **az eddig kifizetett összeget, de legfeljebb 10.000 EUR-t** — felhasználói megerősítés (2026-08-08). Ha nincs biztosítása, a 9-es mezőre kerül (1 kártya)
- **Közvetlen fizetés, mezőre lépés nélkül** — előfizetés (Hetek 40 EUR, Népszava 60 EUR) (2 kártya)
- **Azonnali kamat-kártya** (1 db, `id: 8`): *"Jól takarékoskodtál, ezért az OTP Bank Rt. a Lakossági folyószámlán elhelyezett pénzed után 15% kamatot fizet."* — felhasználói pontosítás (2026-08-08): a korábbi OCR-hibás "1527" helyesen **15%**, a szöveg is javítva a `szerencsekartyak.json`-ban. **Azonnali, egyszeri kamat-jóváírás**: a húzás pillanatában a folyószámla-egyenleg 15%-a jóváírásra kerül (a 8-as mező 7%-ától eltérő, magasabb, egyszeri bónuszráta) → `IMMEDIATE_INTEREST` (ratePercent: 15).
- **`id 41`** (a legmagasabb sorszámú, "utolsó" kártya — mező 41 a pálya utolsó mezője): *"Takarékoskodj! A megtakarított pénzedet tartsd a Lakossági folyószámládon, melyre OTP Bank Rt. 7 90 kamatot fizet. Lépj a 8-as mezőre!"* — javítva (2026-08-08): korábban tisztán flavornak (`NO_OP`) jelöltem, ez HIBÁS volt — a takarékossági tanács csak akkor értelmes, ha a kártya ténylegesen a 8-as mezőre is küldi a játékost (ahol most már, az előző pontosítás óta, kizárólag befizetés/nyitás lehetséges). Effektus: `MOVE_TO(targetIndex: 8)`, fizetés nélkül — a szöveg is bővítve a `szerencsekartyak.json`-ban.

## 3. Adatmodell: state és action-ok

`src/shared/games/gazdalkodjOkosan/engine/` — a Dáma/Hotel mintáját követve: `state.ts`, `actions.ts`, `reducer.ts`, `rules.ts`, `selectors.ts`, `initialState.ts`, plusz adatvezérelt konfiguráció (`boardConfig.ts`, `chanceCards.ts`) — **egyik mező-szöveg vagy kártya-szöveg sem kódba égetve**, hogy a felhasználó utólag (pl. a tábla-fotó/pontosítások birtokában) módosíthassa kód nélkül.

### 3.1 Tervezési elv: nyílt információ + mezőnkénti frissítésre alkalmas state

Felhasználói kérés (2026-08-08), előretervezve a Hotel tanulsága alapján:

- **Teljesen nyílt game state — nincs maszkolás.** Ellentétben Gwenttel (rejtett kéz/pakli, `toPublicGwentState`), Gazdálkodj okosanban minden játékos mindent lát — készpénzt, folyószámla-egyenleget, hiteleket, mindenkiét. Ez a Dáma/Hotel mintáját követi (lásd `hotel-0b-multiplayer-specifikacio.md` 3. szakasza: *"Online UI-nézet: nyílt információ... Nincs rejtett információ egyik játékos elől sem."*). **Következmény a jövőbeli 0b fázisra:** nem kell játék-specifikus maszkoló réteget írni — a szerver ugyanazt a state-et küldi minden kliensnek, a UI csak azt korlátozza, KI cselekedhet éppen (mint Hotelnél a `PlayerActionWheel`: máskor is látható, csak inaktív).
- **Mezőnkénti ("field-by-field") frissítésre alkalmas szerkezet, már MOST betervezve.** Hotel-0a-ban utólag derült ki (Hotel-0b tervezésekor), hogy egy korlátlanul növekvő `log: LogEntry[]` tömb sima state-replace mellett minden apró változásnál (pl. egyetlen `cash`-módosítás) a TELJES state-et újraküldené egy Colyseus-szinkronban — ez vezetett a Hotel-0b-s mezőnkénti `@colyseus/schema`-refaktorhoz (`ArraySchema`, csak a ténylegesen változott mezők diffelése). Hogy Gazdálkodj okosan-0b ne igényeljen hasonló utólagos retrofit-et, a 0a adatmodell már most ezekkel a szabályokkal készül:
  - Rögzített hosszúságú tömbök (`board`: 42, `players`: 2–6) — bővítés/rendezés helyett mindig **index szerint** frissülnek a bennük lévő objektumok mezői.
  - **Nincs `Set`/`Map`** a state-ben — ezek sem JSON.stringify-jal, sem `@colyseus/schema`-val nem szinkronizálhatók közvetlenül. Helyettük `Record<K, boolean>` (lásd `Player.furniture`) vagy `K[]` tömb.
  - `log: LogEntry[]` (lásd lent) **már 0a-ban bevezetve**, JSON-szerializálható, diszkriminált unió alakban — a 0b-ben így csak becsomagolás kell (`ArraySchema<string>`, elemenként `JSON.stringify(LogEntry)`, a Hotel-0b-ben bevált minta), nem új mező utólagos bevezetése.

```typescript
// state.ts
export type PlayerId = string;
export type FurnitureItemId = 'konyhabutor' | 'mosogep' | 'hutoszekreny' | 'mosogatogep' | 'tuzhely' | 'szobabutor';

export interface InstallmentPlan {
  totalPrice: number; // a hitelre vásárlás teljes ára (pl. autó: 15.000) — a paidSoFar = totalPrice - remainingBalance számításhoz kell (autólopás kártya kifizetéséhez, lásd 2.6)
  remainingBalance: number;
  perTurnPayment: number; // 500 EUR mindkét hiteltípusnál
}

export type OwnershipStatus =
  | { kind: 'NONE' }
  | { kind: 'OWNED_CASH'; pricePaid: number } // egy összegben kifizetve
  | { kind: 'FINANCED'; plan: InstallmentPlan }; // részletre, még van hátralék
  // FINANCED -> OWNED_CASH-nek megfelelő véglegesített állapotba vált, amikor a plan.remainingBalance eléri a 0-t

export interface Player {
  id: PlayerId;
  name: string;
  cash: number;
  /** null = nincs nyitva folyószámla; legfeljebb 1 db/játékos. A készpénz és a
   *  számla-egyenleg KÜLÖN nyilvántartott összeg — felhasználói pontosítás
   *  (2026-08-08), a kettő között bármikor szabadon átvezethető pénz. */
  bankAccount: { balance: number } | null;
  hasBkvPass: boolean; // csak a 2-es mezőn vásárolható; feltétele a 15-ös mező jutalmának
  position: number; // index a board tömbben (0 = START)
  apartment: OwnershipStatus;
  car: OwnershipStatus;
  /** Record, NEM Set — a `Set` sem JSON.stringify-jal, sem egy jövőbeli
   *  `@colyseus/schema`-val nem szinkronizálható közvetlenül; egy Record
   *  minden tétele önmagában mutálható mező, ez a "mezőnkénti frissítésre
   *  alkalmas" tervezési elv (lásd 3.1 szakasz) egyik konkrét alkalmazása. */
  furniture: Record<FurnitureItemId, boolean>;
  insurance: { life: boolean; home: boolean; car: boolean };
  hospitalTurnsRemaining: number; // >0 amíg nem dobhat 1-est/6-ost szabadon
  skipNextRoll: boolean; // a 41-es mező / italbolt büntetése
  extraRollsPending: number; // a 15-ös mező jutalma (csak hasBkvPass esetén jár)
  bankrupt: boolean;
}

export type SpaceType =
  | 'START'
  | 'FLAVOR' // nincs kötelezettség
  | 'PAY' // fix összeg
  | 'PAY_AND_SKIP' // fix összeg + következő kör kihagyása (41-es mező)
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
  label: string; // rövid azonosító, pl. "zila-kavehaz" — a tényleges UI-szöveg az assetekből
  amount?: number; // PAY / PAY_AND_SKIP / BKV_PASS ára
  furnitureItems?: FurnitureItemId[]; // FURNITURE_PURCHASE mezőknél, árral együtt (lásd FurnitureCatalog)
  /** true a 15-ös (EXTRA_ROLL_REWARD) ÉS a 27-es (CHANCE) mezőn — mindkettő
   *  hatástalan, ha a játékosnak nincs BKV-bérlete, javítva (2026-08-08):
   *  korábban tévesen csak a 15-öst jelöltem feltételesnek. */
  requiresBkvPass?: boolean;
}

export type ChanceCardEffect =
  | { kind: 'MONEY_DELTA'; amount: number }
  | { kind: 'MOVE_TO'; targetIndex: number; thenPay?: number } // mindig ELŐRE (óramutató irányba) számolt lépés a jelenlegi pozíciótól `advanceForward`-dal — ha eközben áthalad/rálép a START-ra, a normál 2.000/4.000 START-bónusz ugyanúgy jár, mint kockás lépésnél (felhasználói hangsúlyozás, 2026-08-08). A célmező saját (nem-START) effektje NEM fut le automatikusan — a kártya explicit `thenPay`-je írja le, mi történjen ott
  | { kind: 'GAIN_FURNITURE'; item: FurnitureItemId; cashIfAlreadyOwned: number; cashIfNoApartment?: number }
  | { kind: 'FIRE_EVENT' } // lakásbiztosítással a berendezés TELJES árát fizeti ki a bank, egyébként nincs kifizetés — megerősítve (2026-08-08)
  | { kind: 'CAR_THEFT' } // autóbiztosítással az eddig kifizetett összeget fizeti ki, max. 10.000 EUR-t; a hátralévő hitel mindenképp megszűnik — megerősítve (2026-08-08)
  | { kind: 'EXTRA_ROLL' }
  | { kind: 'IMMEDIATE_INTEREST'; ratePercent: number }; // `id 8` kártya — 15%, egyszeri jóváírás a jelenlegi folyószámla-egyenlegre, lásd 2.6

export interface ChanceCard {
  id: string;
  text: string; // teljes, eredeti kártyaszöveg (UI-ban megjelenik)
  effect: ChanceCardEffect;
}

/**
 * A játék eseménynaplója — Gwent/Hotel/Ramses mintáját követve MOST is
 * bevezetve (felhasználói kérés, 2026-08-08), diszkriminált unióként, hogy
 * JSON-szerializálható maradjon (lásd 3.1 szakasz, mezőnkénti frissítésre
 * alkalmas tervezés). A UI ebből építi a napló-panelt (Hotel `GameLogPanel`
 * mintájára) és — Gwentnél már bevált módon — időzített animációkat is
 * indíthat egy-egy bejegyzés alapján.
 */
export type LogEntry =
  | { type: 'DICE_ROLLED'; playerId: PlayerId; value: number }
  | { type: 'MOVED'; playerId: PlayerId; fromIndex: number; toIndex: number; startBonus: 0 | 2000 | 4000 }
  | { type: 'SPACE_PAYMENT'; playerId: PlayerId; spaceIndex: number; amount: number }
  | { type: 'CHANCE_CARD_DRAWN'; playerId: PlayerId; cardId: string }
  | { type: 'CHANCE_CARD_SKIPPED_NO_PASS'; playerId: PlayerId } // 27-es mező, bérlet nélkül
  | { type: 'BKV_PASS_PURCHASED'; playerId: PlayerId }
  | { type: 'BKV_REWARD_SKIPPED_NO_PASS'; playerId: PlayerId } // 15-ös mező, bérlet nélkül
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
  | { type: 'HOSPITAL_EXITED'; playerId: PlayerId }
  | { type: 'SKIPPED_TURN'; playerId: PlayerId } // 41-es mező büntetése
  | { type: 'BANKRUPT'; playerId: PlayerId }
  | { type: 'GAME_WON'; playerId: PlayerId };

export type TurnPhase =
  | 'AWAITING_ROLL'
  | 'AWAITING_MANDATORY_INSTALLMENT' // a START áthaladása/rálépése miatt esedékes törlesztés(ek) vár(nak) — lásd pendingMandatoryInstallments; ameddig nem üres, más action nem engedélyezett
  | 'RESOLVING_SPACE' // a landolt mező típusától függő döntésre vár (vásárlás/biztosítás/bank stb. — opcionális akciók)
  | 'TURN_COMPLETE';

export type GameStatus = 'IN_PROGRESS' | 'FINISHED';

export interface GazdalkodjOkosanState {
  board: BoardSpace[]; // fix, 42 elemű (0=START, 1-41)
  chanceDeck: ChanceCard[]; // a húzás után a húzott kártya a lista VÉGÉRE kerül
  players: Player[];
  currentPlayerIndex: number;
  turnPhase: TurnPhase;
  /** KIZÁRÓLAG a ROLL_MOVE_DICE tölti fel, ha a dobás nyomán a soron lévő
   *  játékos áthaladt a START-on/rálépett, ÉS van FINANCED autója/lakása —
   *  javítva (2026-08-08): ha a START-áthaladás Szerencsekártya MOVE_TO
   *  hatására történik, a pénzbónusz ugyanúgy jár, de törlesztés NEM válik
   *  esedékessé — ez a mező csakis a dobás-alapú keresztezésre reagál. A
   *  törlesztés nem automatikus, a kör kötelező első lépéseként a
   *  játékosnak magának kell kiváltania. */
  pendingMandatoryInstallments: ('car' | 'apartment')[];
  lastDiceRoll: number | null;
  status: GameStatus;
  winnerId: PlayerId | null;
  log: LogEntry[]; // csak APPEND — lásd 3.1 szakasz a jövőbeli Colyseus-szinkron miatti tervezési okról
}
```

```typescript
// actions.ts
export type GazdalkodjOkosanAction =
  | { type: 'ROLL_MOVE_DICE' }
  | { type: 'PAY_APARTMENT_INSTALLMENT'; amount?: number } // kötelező, ha 'apartment' szerepel a pendingMandatoryInstallments-ban (legalább a perTurnPayment összeggel); az `amount` opcionális, nagyobb törlesztésre (a szabálykönyv szerint engedélyezett)
  | { type: 'PAY_CAR_INSTALLMENT'; amount?: number } // ugyanaz, 'car'-ra
  | { type: 'BUY_APARTMENT'; financed: boolean }
  | { type: 'BUY_CAR'; financed: boolean }
  | { type: 'BUY_FURNITURE'; item: FurnitureItemId }
  | { type: 'OPEN_BANK_ACCOUNT' } // KIZÁRÓLAG a 8-as mezőn (player.position === 8); azonnal bankkártyát is ad; legfeljebb 1x/játékos
  | { type: 'DEPOSIT_TO_ACCOUNT'; amount: number } // cash -> bankAccount, KIZÁRÓLAG a 8-as mezőn — javítva (2026-08-08)
  | { type: 'WITHDRAW_FROM_ACCOUNT'; amount: number } // bankAccount -> cash, bárhol/bármikor
  | { type: 'BUY_INSURANCE'; policy: 'life' | 'home' | 'car' }
  | { type: 'BUY_BKV_PASS' } // csak a 2-es mezőn
  | { type: 'DRAW_CHANCE_CARD' } // Szerencsekártya-mezőn
  | { type: 'END_TURN' };
```

**Közös mozgás-segédfüggvény:** `advanceForward(state, playerId, steps: number)` — a pálya `board.length` (42) szerinti modulo-aritmetikával mindig ELŐRE lépteti a játékost `steps` mezőt, és eközben jóváírja a **pénz-bónuszt**, ha a pálya átfordul (2.000 áthaladva, vagy 4.000, ha pontosan a START-on áll meg). Mind a `ROLL_MOVE_DICE` (steps = dobott érték), mind a Szerencsekártya `MOVE_TO` hatása (steps = `(targetIndex - position + 42) % 42`) **ezt az EGY függvényt hívja** — a pénz-bónusz logika egyetlen helyen él, nem duplikálódik.
A **kötelező törlesztés** viszont NEM része `advanceForward`-nak — azt kizárólag a `ROLL_MOVE_DICE` action-kezelő számítja ki, közvetlenül `advanceForward` visszatérése után, a "történt-e START-keresztezés ÉS ez a hívás `ROLL_MOVE_DICE`-ból jött-e" feltétellel. Egy Szerencsekártya `MOVE_TO` hatása tehát adhat pénzt a START-keresztezésért, de sosem tesz esedékessé törlesztést — javítva (2026-08-08).

**Kör-felépítés** (a Hotel mintáját követve, de annál egyszerűbb — nincs több-lépéses árverés/engedély-mechanika):
`ROLL_MOVE_DICE` → `advanceForward`-dal a pozíció frissül, START-áthaladás/rálépés bónusz jóváírva →
ha ilyenkor van `FINANCED` autója és/vagy lakása, a `pendingMandatoryInstallments` feltöltődik, és a fázis `AWAITING_MANDATORY_INSTALLMENT`-re vált — ebben a fázisban **kizárólag** a megfelelő `PAY_*_INSTALLMENT` action(ök) engedélyezettek, más semmi, amíg a lista ki nem ürül (fizetésképtelenség esetén csőd, lásd 2.1) →
a landolt mező kötelező hatása lefut (PAY, PAY_AND_SKIP, CHANCE — a `requiresBkvPass` mezőknél csak akkor, ha `player.hasBkvPass === true`, egyébként nincs hatás) →
`RESOLVING_SPACE` fázisban a játékos opcionális akciókat hajthat végre (vásárlás, biztosítás, bútor — csak ha a mező ezt engedi; `OPEN_BANK_ACCOUNT`/`DEPOSIT_TO_ACCOUNT` csak a 8-as mezőn állva, `WITHDRAW_FROM_ACCOUNT` viszont mezőtől függetlenül, bármikor elérhető) →
`END_TURN` zárja a kört, és minden `END_TURN`-nél kiértékelődik a győzelmi feltétel (2.1 szakasz) és a csőd-feltétel.

## 4. Nyitott kérdések — státusz

Minden korábban nyitott kérdés lezárva a tábla-fotó és a felhasználói pontosítások alapján (2026-08-08):

- 5 mező (1, 14, 21, 31, 34) a szabálykönyv szövege szerint tévesen "flavor"-nak volt jelölve, valójában fizetős — a felhasználó a tábla-fotó saját ellenőrzésével további két mezőt (25, 30) is pontosított.
- A 8-as mező kamatlába 7%, a kamat-esemény mezője helyesbítve: a **8-as**, nem a 2-es.
- Készpénz és folyószámla **külön** nyilvántartott összeg; max. 1 folyószámla/játékos. **Nyitás és befizetés kizárólag a 8-as mezőn**, kivétel és fizetés a számláról viszont bárhol/bármikor.
- A 15-ös/27-es mező nem vásárlási pont; mindkettő hatása feltételes (van-e már BKV-bérlet).
- Az autó- és lakáshitel törlesztése a START mezőn **dobással** történő áthaladáshoz/rálépéshez kötött, kényszerített-de-kézi akcióként (`AWAITING_MANDATORY_INSTALLMENT`) — Szerencsekártya általi START-keresztezés pénzt ad, de törlesztést NEM tesz esedékessé.
- A győzelemhez mind a 6 bútortétel szükséges.
- Tűzeset: a berendezés teljes ára; autólopás: az eddig kifizetett összeg, max. 10.000 EUR, a hátralévő hitel megszűnik.
- A `szerencsekartyak.json` `id: 8` kártyája **15%-os azonnali, egyszeri kamat-jóváírás** (a szöveg is javítva az assetben); `id: 41` (a pálya utolsó mezőjével megegyező sorszámú kártya) a 8-as mezőre küldi a játékost, hogy a takarékossági tanácsnak ténylegesen legyen mit kezdenie a mostani mező-8-restrikció mellett.
- A Szerencsekártyák sorszámozása javítható — 1–35-re rendezés a `boardConfig.ts`/`chanceCards.ts` implementálásakor.
- Nyílt (nem maszkolt) game state + mezőnkénti frissítésre alkalmas szerkezet (`Record`, nem `Set`; rögzített hosszúságú tömbök) + `log: LogEntry[]` eseménynapló — mind betervezve már 0a-ban, a Hotel-0b utólagos `@colyseus/schema`-refaktorának elkerülésére.

Nincs több nyitott kérdés — a specifikáció jóváhagyásra kész.

## 5. Hatókörön kívül — jövőbeli fázisok

- **0b:** multiplayer (Colyseus szoba, a Hotel `GameRoom` mintáját követve)
- **0c:** valódi vizuál — a beérkező tábla-fotó alapján `LoopTrackBoard3D` konfiguráció, mező-ikonok, bútor-illusztrációk
- **0d:** AI ellenfél

Lásd: [`docs/diagrams/gazdalkodj-okosan-0a-engine-class-diagram.puml`](./diagrams/gazdalkodj-okosan-0a-engine-class-diagram.puml)
