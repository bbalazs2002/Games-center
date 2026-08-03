# Hotel-0a — Specifikáció: helyi vertikum (motor + 3D tábla-renderer + N-fős hot-seat)

**Státusz:** Implementálva (motor + 3D renderer + hot-seat UI), `tsc`/`eslint`/`vitest`/`vite build` mind zöld — több élő böngészős/hot-seat playtest-kör is lezajlott, plusz az árverés-mechanika teljes átdolgozása (lásd a 9. szakasz "Xdik kérés" bejegyzéseit, legutóbb 2026-08-04).
**Utolsó frissítés:** 2026-08-04
**Kapcsolódik:** [Projekt-conception.md](./Projekt-conception.md) (fejlesztési sorrend 4. pontja), [dama-0a-specifikacio.md](./dama-0a-specifikacio.md) (az itt is követett minta: framework-agnosztikus reducer, core/games szeparáció, `PlayerController`)

> **Miért a Hotel jön a Dáma után, nem a tervezett sorrend szerinti következő (kisebb) lépés?** A te döntésed: a Hotel egyszerre igényel 3+ fős szoba-/kör-logikát, 3D tábla-renderert és (a nagyobb state-méret miatt) a `GameRoom` mezőnkénti `@colyseus/schema`-ra váltását — ez a platform eddigi legnagyobb architekturális ugrása. Ha ezt most, egy alaposan letesztelt vertikumban oldjuk meg, a később következő játékok (Gazdálkodj okosan, Monopoly, majd Catan) nagyrészt kész infrastruktúrára építhetnek.

## 1. Cél és hatókör

**Hotel-0a** a Dáma "Fázis 0a + Fázis 1" mintáját követi: **tisztán helyi (hot-seat, egy gépen körbeadva), multiplayer nélkül**, de már a végleges motorral és a végleges (bár placeholder-assetes) 3D renderelővel. A cél annak bizonyítása, hogy:
- a motor N főre (nem csak 2-re) és egy teljesen más pálya-topológiára (körbejárható pálya, nem rács) is ugyanúgy framework-agnosztikus reducer mintában írható, mint a Dámáé;
- a tábla-renderelő réteg 2D↔3D cserélhetősége a gyakorlatban is működik (nem csak elméletben);
- a `core/games` szeparációs elv (lásd Fázis 0a §2.5) N-fős, gazdasági jellegű játékokra is kiterjed.

**Hatókörben van:**
- Hotel motor (state, action-ok, reducer) — telek-vásárlás (ide értve a félárú kivásárlást), soros épület-építés + kert speciális kockával, ingyen-mezők, lépcső/éjszaka-alapú bérleti díj, árverés, feladás, N-fős körvezérlés, **utoljára-marad (kieséses) győzelem**
- `LoopTrackBoard3D` — generikus, körbejárható pályát renderelő 3D komponens (Three.js + React Three Fiber), geometriai placeholder alakzatokkal
- Egy kör alakú, a tábla felett lebegő, becsukható akció-menü az aktív játékos számára (lásd 5. szakasz)
- N-fős (2–4, bővíthetően megtervezve) hot-seat játékmenet (`HotelGamePage` + egy új `HotelSetupPage` a játékosszám/nevek megadásához)

**Nincs hatókörben (külön, jövőbeli fázis):**
- Multiplayer (Hotel-0b)
- Végleges 3D assetek/textúrák (Hotel-0c)
- AI ellenfél (Hotel-0d)
- Részvény/befektetés mechanika — **megerősítve, hogy ez a valódi példányotokban sincs**, nem kell rá helyet hagyni a state-ben sem

## 2. A valódi szabályok (megerősítve, 2026-07-24)

> A korábbi feltételezésem (nemzetközi Teuber/Ravensburger "Hotel") **tévesnek bizonyult** — a ti példányotok egy jóval részletesebb, egyedi szabályrendszerű játék, névre szóló hotelekkel, speciális építési-engedély-kockával és lépcső/éjszaka-mechanikával. Az alábbi szöveg és táblázatok **a te leírásod szó szerint**, ez a mostantól hiteles forrás — a 3. szakasztól kezdve ehhez igazítottam az architektúrát. A pontos számokat (árak, díjak) továbbra is **konfigurációs adatként**, nem a motor logikájába égetve tervezem, hogy egy esetleges további pontosítás ne igényeljen kódváltoztatást.
>
> A korábban nyitva hagyott szabály-értelmezési kérdések (félárú kivásárlás, építési-engedély-kocka hatóköre, "+ kert" tarifa, a pálya pontos mező-sorrendje) mind lezárva — lásd 8. szakasz.

**Játékszabály:**
- 2–4 fő, körbejárható pálya (zárt hurok, nem elágazó), de nem négyzet alakú (board.HEIC), dobókockával lépkedve.
- +2 épület a pályán (csak dekoráció): városháza (city-hall), bank
- Mezőtípusok:
  - **Start:** Itt nem történik semmi
  - **Vásárlás:** A mező melletti üres telkeket meg lehet venni. Ha a telek üres, de egy játékos már megvette, akkor féláron lehet tőle megvenni.
  - **Építkezés:** Építhetsz a saját telkedre. Pontosan meg kell adni, hogy melyik telekre és mennyi épületet kívánsz felépíteni. Az épületeket csak sorban lehet felépíteni. Egyszerre több telekre is építhetsz. Ezután egy speciális dobókockával "építési engedélyt kell kérni". A kertre lehet építési engedélyt kérni, de nem kötelező. Egy körben többször is megismételhető ez a folyamat.
  - **Ingyen lépcső:** Egy lépcsőt lehelyezhetsz valamelyik hoteled mellé. Ha nincs hoteled, akkor 100 pénzt kapsz. Ha minden hoteled mellett megteltek a helyek, akkor a legdrágább lépcső árát kapod meg (a lépcsők ára telkenként változik).
  - **Ingyen épület:** Ingyen felépíthetsz egy épületet valamelyik telkedre. Ha minden telkeden, minden épület meg van építve, akkor a legdrágább árát kapod meg. Ha nincs telked, akkor nem történik semmi.
- **Építési engedély:** Az épületek megépítése előtt dobni kell egy különleges kockával, aminek az oldalai különböző dolgokat jelentenek:
  - zöld (3x): Megépítheted a megadott épületeket
  - H: Ingyen építheted meg az épületeket
  - 2: Dupla áron KELL megépítened az épületeket
  - piros: Nem építhetsz, és a körben már nem is próbálhatod újra
- **Lépcsők:** Ha olyan mezőre lépsz, ami mellett van lépcső (egy mezőn max. egy lépcső lehet, akkor is, ha több hotellel szomszédos), akkor dobnod kell, hogy mennyi éjszakát töltesz a hozzá tartozó hotelben. Ettől függően fizetsz a hotel tulajdonosának.
- **Győzelmi feltétel:** Az nyer, aki utoljára marad.
- **Csőd**: ha egy játékos nem tud fizetni, csődbe megy, de a JÁTÉK maga nem ér véget emiatt.
- **Árverezés:** Ha egy játékos nem tud fizetni, akkor elárverezheti egy hoteljét. A bank automatikusan megadja érte a felépítésének költségének a felét (pl.: A telek került 500-ba, és van rajta egy épület, ami 1000-be kerül. A bank ezért 750-et ad érte). Ennél a többi játékos ajánlhat többet. A banknál lévő, elárverezett hotelt ugyan annyiért lehet megvenni, amennyit a bank adott érte, de csak egy mellette lévő Vásárlás mezőre lépve.
- **Feladás:** Egy játékos feladhatja. Ilyenkor a hoteljei a bankhoz kerülnek, mintha elárverezte volna őket.
- **Különleges sávok:** A pályán két különleges sáv van (két mező között), amit átlépve a következő történik:
  - **+2000:** A játékos 2000 pénzt kap
  - **Lépcső:** Abban a körben, amikor ezt a mezőt átlépi, a játékos lépcsőt vásárolhat azokra a telkekre, amiket birtokol (1 lépcső/hotel/kör, azaz egy körben, egy hotelre csak egy lépcsőt lehet vásárolni).
- **bankjegyek:** 50, 100, 500, 1000, 5000
- **kezdőtőke:** 15 000/fő — megerősítve (2026-07-24, korábban implementáció-közi becslés volt, lásd 9.1 szakasz)
- **Mezőfoglaltság:** Egy mezőn legfeljebb egy játékos állhat. Ha egy játékos olyan mezőre lépne, amin már áll valaki, akkor a következő mezőre lép — ha az is foglalt, ismét eggyel tovább, amíg szabad mezőt nem talál. Utólag megerősítve (2026-07-24) — a Start mezőre is vonatkozik, lásd 9.2 szakasz.
- **Parkoló:** a Start mező mellett van egy külön, "nulladik" mező, a parkoló — innen indul minden játékos, ezért a kezdőállapotban NEM a Start mezőn állnak. A parkoló a kezdés után nem vesz részt a köreiben (nem lehet rálépni, nem számít bele a huroknak) — utólag megerősítve (2026-07-24), lásd 9.2 szakasz.

**Hotelek:** 
1. Waikiki
  - 5 épület + kert
  - **telek ára:** 2500
  - **lépcső ára:** 200
  - **épületek ára:** 3500, 2500, 2500, 1750, 1750
  - **kert ára:** 2500
  - **éjszakák díja:**

    | éjszakák | 1 | 2 | 3 | 4 | 5 | 6 |
    |-|-|-|-|-|-|-|
    | 1 épület | 200 | 400 | 600 | 800 | 1000 | 1200 |
    | 2 épület | 350 | 700 | 1050 | 1400 | 1750 | 2100 |
    | 3 épület | 500 | 1000 | 1500 | 2000 | 2500 | 3000 |
    | 4 épület | 500 | 1000 | 1500 | 2000 | 2500 | 3000 |
    | 5 épület | 650 | 1300 | 1950 | 2600 | 3250 | 3900 |
    | + kert   | 1000 | 2000 | 3000 | 4000 | 5000 | 6000 |

2. Royal
  - 4 épület + kert
  - **telek ára:** 2500
  - **lépcső ára:** 200
  - **épületek ára:** 3600, 2600, 1800, 1800
  - **kert ára:** 3000
  - **éjszakák díja:**

    | éjszakák | 1 | 2 | 3 | 4 | 5 | 6 |
    |-|-|-|-|-|-|-|
    | 1 épület | 150 | 300 | 450 | 600 | 750 | 900 |
    | 2 épület | 300 | 600 | 900 | 1200 | 1500 | 1800 |
    | 3 épület | 300 | 600 | 900 | 1200 | 1500 | 1800 |
    | 4 épület | 450 | 900 | 1350 | 1800 | 2250 | 2700 |
    | + kert   | 600 | 1200 | 1800 | 2400 | 3000 | 3600 |

3. L'etoile
  - 5 épület + kert
  - **telek ára:** 3000
  - **lépcső ára:** 250
  - **épületek ára:** 3300, 2200, 1800, 1800, 1800
  - **kert ára:** 4000
  - **éjszakák díja:**

    | éjszakák | 1 | 2 | 3 | 4 | 5 | 6 |
    |-|-|-|-|-|-|-|
    | 1 épület | 150 | 300 | 450 | 600 | 750 | 900 |
    | 2 épület | 300 | 600 | 900 | 1200 | 1500 | 1800 |
    | 3 épület | 300 | 600 | 900 | 1200 | 1500 | 1800 |
    | 4 épület | 300 | 600 | 900 | 1200 | 1500 | 1800 |
    | 5 épület | 450 | 900 | 1350 | 1800 | 2250 | 2700 |
    | + kert   | 750 | 1500 | 2250 | 3000 | 3750 | 4500 |

4. Boomerang
  - 1 épület + kert
  - **telek ára:** 500
  - **lépcső ára:** 100
  - **épületek ára:** 1800
  - **kert ára:** 250
  - **éjszakák díja:**

    | éjszakák | 1 | 2 | 3 | 4 | 5 | 6 |
    |-|-|-|-|-|-|-|
    | 1 épület | 400 | 800 | 1200 | 1600 | 2000 | 2400 |
    | + kert   | 600 | 1200 | 1800 | 2400 | 3000 | 3600 |

5. Taj Mahal
  - 3 épület + kert
  - **telek ára:** 1500
  - **lépcső ára:** 100
  - **épületek ára:** 2400, 1000, 500
  - **kert ára:** 1000
  - **éjszakák díja:**

    | éjszakák | 1 | 2 | 3 | 4 | 5 | 6 |
    |-|-|-|-|-|-|-|
    | 1 épület | 100 | 200 | 300 | 400 | 500 | 600 |
    | 2 épület | 100 | 200 | 300 | 400 | 500 | 600 |
    | 3 épület | 200 | 400 | 600 | 800 | 1000 | 1200 |
    | + kert   | 300 | 600 | 900 | 1200 | 1500 | 1800 |

6. Safari
  - 3 épület + kert
  - **telek ára:** 2000
  - **lépcső ára:** 150
  - **épületek ára:** 2600, 1200, 1200
  - **kert ára:** 2000
  - **éjszakák díja:**

    | éjszakák | 1 | 2 | 3 | 4 | 5 | 6 |
    |-|-|-|-|-|-|-|
    | 1 épület | 100 | 200 | 300 | 400 | 500 | 600 |
    | 2 épület | 100 | 200 | 300 | 400 | 500 | 600 |
    | 3 épület | 250 | 500 | 750 | 1000 | 1250 | 1500 |
    | + kert   | 500 | 1000 | 1500 | 2000 | 2500 | 3000 |

7. President
  - 4 épület + kert
  - **telek ára:** 3500
  - **lépcső ára:** 250
  - **épületek ára:** 5000, 3000, 2250, 1750
  - **kert ára:** 5000
  - **éjszakák díja:**

    | éjszakák | 1 | 2 | 3 | 4 | 5 | 6 |
    |-|-|-|-|-|-|-|
    | 1 épület | 200 | 400 | 600 | 800 | 1000 | 1200 |
    | 2 épület | 400 | 800 | 1200 | 1600 | 2000 | 2400 |
    | 3 épület | 600 | 1200 | 1800 | 2400 | 3000 | 3600 |
    | 4 épület | 800 | 1600 | 2400 | 3200 | 4000 | 4800 |
    | + kert   | 1100 | 2200 | 3300 | 4400 | 5500 | 6600 |

8. Fujiyama
  - 3 épület + kert
  - **telek ára:** 1000
  - **lépcső ára:** 100
  - **épületek ára:** 2200, 1400, 1400
  - **kert ára:** 500
  - **éjszakák díja:**

    | éjszakák | 1 | 2 | 3 | 4 | 5 | 6 |
    |-|-|-|-|-|-|-|
    | 1 épület | 100 | 200 | 300 | 400 | 500 | 600 |
    | 2 épület | 100 | 200 | 300 | 400 | 500 | 600 |
    | 3 épület | 200 | 400 | 600 | 800 | 1000 | 1200 |
    | + kert   | 400 | 800 | 1200 | 1600 | 2000 | 2400 |


## 3. Adatmodell: state és action-ok

`src/shared/games/hotel/engine/` — ugyanaz a felépítés, mint a Dámánál (`state.ts`, `actions.ts`, `reducer.ts`, `rules.ts`, `selectors.ts`, `initialState.ts`). **Ez a szakasz a 2. szakasz valódi szabályaihoz igazítva teljesen újraírva** — a korábbi (Teuber-feltételezésen alapuló) verzió tévesen generikus "ár + bérleti-szint-tömb" telek-modellt és kör-limites győzelmet írt le.

```typescript
// state.ts
export type PlayerId = string;

/** A 8 elnevezett hotel (Waikiki, Royal, ...) konfigurációja — a 2. szakasz táblázataiból. */
export interface HotelConfig {
  id: string; // pl. 'waikiki'
  name: string;
  lotPrice: number;
  staircasePrice: number;
  buildingPrices: number[]; // soros — pl. Waikiki: [3500, 2500, 2500, 1750, 1750]
  gardenPrice: number;
  /** nightlyRates[épített épületek száma - 1][éjszakák száma - 1] */
  nightlyRates: number[][];
  /** a "+ kert" sor az éjszaka-táblából — külön tömb, mert nem az épület-szám indexeli */
  gardenNightlyRates: number[];
}

export interface HotelLot extends HotelConfig {
  /** null = a bank a tulajdonos (kezdetben minden telek ilyen) — lásd 8. szakasz megerősítése. */
  ownerId: PlayerId | null;
  buildingsBuilt: number; // 0..buildingPrices.length, csak sorban nőhet
  hasGarden: boolean;
  hasStaircase: boolean; // legfeljebb egy lépcső mezőnként — lásd BoardSpace.staircaseForLotId
  /**
   * Ha árverés/feladás után a bankhoz került vissza, ez az ár (amit a bank
   * fizetett érte) érvényes a visszavásárláskor a lotPrice helyett — null,
   * ha még sosem volt árverésen (ilyenkor a sima lotPrice számít).
   */
  bankBuybackPrice: number | null;
}

export type SpaceType = 'START' | 'PURCHASE' | 'CONSTRUCTION' | 'FREE_STAIRCASE' | 'FREE_BUILDING';

export interface BoardSpace {
  id: string;
  type: SpaceType;
  /**
   * Mely telek(ek) vannak fizikailag e mező mellett — KÉT különböző célra:
   * (1) PURCHASE mezőknél funkcionálisan korlátoz: csak az itt felsorolt
   *     telek(ek) vásárolhatók meg innen.
   * (2) Bármely mezőnél (típustól függetlenül) meghatározza, hogy melyik
   *     hotel(ek) lépcsője kerülhet ide — lásd staircaseForLotId.
   * CONSTRUCTION/FREE_STAIRCASE/FREE_BUILDING mezőknél NEM korlátoz semmit —
   * ott a játékos bármelyik saját telkét választhatja, megerősítve (8. szakasz).
   */
  adjacentLotIds: string[];
  /**
   * Legfeljebb egy lépcső mezőnként, akkor is, ha a mező több hotellel
   * szomszédos (adjacentLotIds.length > 1) — megerősítve (8. szakasz). Az
   * Ingyen lépcső akciónál a motor egy szabad (staircaseForLotId === null)
   * mezőt keres, aminek adjacentLotIds-jában szerepel a választott telek.
   */
  staircaseForLotId: string | null;
}

export interface SpecialLane {
  /** Két mező KÖZÖTT van, átlépéskor (nem rálépéskor) sül el */
  afterSpaceIndex: number;
  effect: 'BONUS_2000' | 'STAIRCASE_PURCHASE_RIGHT';
}

export interface Player {
  id: PlayerId;
  name: string;
  cash: number;
  position: number; // index a `board` tömbben
  bankrupt: boolean;
}

/**
 * Egy Hotel-kör több fázisból áll (ellentétben a Dáma egyetlen MOVE-action-es
 * körével) — a turnPhase szabja meg, mely action-ök érvényesek éppen.
 */
export type TurnPhase =
  | 'AWAITING_ROLL'              // a kör eleje, mozgás-dobásra vár
  | 'RESOLVING_SPACE'            // a landolt mező típusa alapján döntésre vár (vásárlás/építés/ingyen mező)
  | 'AWAITING_BUILDING_PERMIT'   // Építkezés mezőn, a speciális kockára vár
  | 'AWAITING_NIGHTS_ROLL'       // lépcsős mezőre lépve, hány-éjszaka dobásra vár
  | 'AUCTION_IN_PROGRESS'        // egy hotel árverés alatt, a többi játékos licitálhat
  | 'TURN_COMPLETE';             // END_TURN engedélyezett

export interface PendingAuction {
  lotId: string;
  highestBid: number;
  highestBidderId: PlayerId | null;
}

export type HotelStatus = 'IN_PROGRESS' | 'FINISHED';

export interface HotelState {
  board: BoardSpace[]; // zárt hurok, fix hosszúságú — DRAFT elrendezés, lásd 3.1 és 8. szakasz
  specialLanes: SpecialLane[];
  lots: HotelLot[]; // a 8 elnevezett hotel, HotelConfig-okból inicializálva
  players: Player[];
  currentPlayerIndex: number;
  turnPhase: TurnPhase;
  lastDiceRoll: number | null;
  lastBuildingPermitRoll: 'GREEN' | 'FREE' | 'DOUBLE' | 'RED' | null;
  pendingAuction: PendingAuction | null;
  status: HotelStatus;
  winnerId: PlayerId | null; // csak FINISHED állapotban — az utolsó nem-csődbe-ment játékos
}
```

```typescript
// actions.ts — a több-fázisú kör miatt jóval bővebb, mint a Dáma egyetlen MOVE-je
export type HotelAction =
  | { type: 'ROLL_MOVE_DICE' }
  | { type: 'BUY_LOT'; lotId: string } // Vásárlás mezőn — a `lotId`-nak szerepelnie kell a landolt mező adjacentLotIds-jában; egységes mechanika, akár a bank (teljes ár, vagy bankBuybackPrice), akár másik játékos (féláras kényszer-kivásárlás) a jelenlegi tulajdonos
  | { type: 'START_CONSTRUCTION'; plan: { lotId: string; buildingCount: number }[] } // Építkezés mezőn, egy vagy több saját telekre
  | { type: 'ROLL_BUILDING_PERMIT' } // a speciális kockával, a START_CONSTRUCTION terv jóváhagyásához
  | { type: 'TAKE_FREE_STAIRCASE'; lotId?: string } // Ingyen lépcső mezőn
  | { type: 'TAKE_FREE_BUILDING'; lotId?: string } // Ingyen épület mezőn
  | { type: 'ROLL_NIGHTS' } // lépcsős mezőre lépve
  | { type: 'BUY_STAIRCASE_RIGHT'; lotId: string } // a "Lépcső" különleges sáv átlépésekor, saját telekre
  | { type: 'START_AUCTION'; lotId: string } // ha nem tud fizetni
  | { type: 'PLACE_BID'; amount: number }
  | { type: 'FORFEIT' } // feladás — a hotelek a bankhoz kerülnek, mint árverésnél
  | { type: 'END_TURN' };
```

**Kör-felépítés egy játékoson belül** (a `rules.ts`-ben validálva, `turnPhase` vezérelve, ugyanúgy, mint ahogy a Dáma `chainCaptureFrom` mezője korlátozta az érvényes lépéseket): `ROLL_MOVE_DICE` → pozíció frissül, esetleges különleges sáv-átlépés feloldva → a landolt mező típusától függően `RESOLVING_SPACE` (Vásárlás/Építkezés/Ingyen mezők) → Építkezés esetén `ROLL_BUILDING_PERMIT` a speciális kockával → ha a mező szomszédos egy lépcsővel, `AWAITING_NIGHTS_ROLL` → `ROLL_NIGHTS` → bérleti díj fizetése a tulajdonosnak → ha a soron lévő játékos nem tud fizetni, `START_AUCTION` vagy `FORFEIT` → `END_TURN` zárja a kört, lépteti `currentPlayerIndex`-et a következő **nem csődbe ment** játékosra. Amikor a nem-csődbe-ment játékosok száma 1-re csökken, a reducer `status: 'FINISHED'`-re vált és beállítja a `winnerId`-t.

**core/games szeparációs teszt (Fázis 0a §2.5 mintája) — a valódi szabályok fényében ÁRNYALVA:** a motor **általános váza** (board + telkek + N-fős körvezérlés + `LoopTrackBoard3D` renderer) valószínűleg újrahasználható lesz a Gazdálkodj okosan/Monopoly számára, DE ennek a konkrét Hotel-változatnak több **egyedi mechanikája** van (építési-engedély-kocka, lépcső/éjszaka-rendszer, félárú kivásárlás), amik nem feltétlenül azonosak egy másik C-klaszteres játékéval — ezek külön, a Hotel `rules.ts`-ében élnek, nem a `core/renderers` vagy egyéb game-agnosztikus rétegben. Ez korrekció a korábbi (túl magabiztos) állításomhoz képest.

Lásd: [`docs/diagrams/hotel-0a-engine-class-diagram.puml`](./diagrams/hotel-0a-engine-class-diagram.puml) (frissítve az új adatmodellel).

### 3.1 Pálya-elrendezés — megerősítve

> A pálya **pontos vizuális formája** (hullámos "S" alak, Royal és Fujiyama körbefutó hurokkal, L'Etoile a középső díszes plázában) nem számít a Hotel-0a motorjának/rendererének — a `LoopTrackBoard3D` egyszerű geometriai placeholderrel dolgozik (5. szakasz), a valódi forma a Hotel-0c ("assets") kör témája. Az alábbi **mező-sorrend és hotel-hozzárendelés** viszont már a te megerősített adatod, ez a hiteles forrás a `board`/`specialLanes` inicializálásához.

Óramutató járása szerinti haladás, Starttól indulva:

| Sorszám | Mező | Hotel-hivatkozás |
|---|---|---|
| 1. | Start | |
| 2. | Építkezés | fujiyama |
| 3. | Vásárlás | fujiyama, boomerang |
| 4. | Építkezés | fujiyama, boomerang |
| 5. | Vásárlás | fujiyama, boomerang |
| 6. | Építkezés | fujiyama, boomerang |
| 7. | Ingyen lépcső | fujiyama |
| - | *(speciális sáv)* 2000 | |
| 8. | Építkezés | |
| 9. | Vásárlás | letoile |
| 10. | Vásárlás | letoile, president |
| 11. | Ingyen épület | letoile, president |
| 12. | Vásárlás | royal, president |
| 13. | Építkezés | royal, president |
| 14. | Vásárlás | royal, president |
| 15. | Építkezés | royal, president |
| 16. | Vásárlás | royal, president |
| 17. | Építkezés | royal, waikiki |
| 18. | Vásárlás | royal, waikiki |
| 19. | Ingyen lépcső | royal, waikiki |
| 20. | Építkezés | royal, waikiki |
| 21. | Vásárlás | royal, waikiki |
| 22. | Vásárlás | tajmahal, letoile |
| 23. | Építkezés | tajmahal, letoile |
| 24. | Vásárlás | tajmahal, letoile |
| 25. | Ingyen épület | tajmahal, letoile |
| 26. | Építkezés | tajmahal |
| - | *(speciális sáv)* Lépcső-vásárlási jog | |
| 27. | Építkezés | safari |
| 28. | Építkezés | safari |
| 29. | Vásárlás | safari, letoile |
| 30. | Ingyen lépcső | safari, letoile |
| 31. | Építkezés | safari |

Összesen 31 mező + 2 speciális sáv. Mivel ez egy konkrét, egyedi (nem sablonból ismétlődő) elrendezés, a `board`/`specialLanes` a `initialState.ts`-ben ezzel a táblázattal egyező, explicit literál tömbként lesz felírva — nincs `generateBoard()`-szerű mintagenerálás, mert az itt nem is illik a valós, szabálytalan elrendezéshez.

**Funkcionális vs. csak tájékoztató hotel-hivatkozás (megerősítve):**
- **Vásárlás** mezőknél az `adjacentLotIds` **korlátoz** — csak a felsorolt telek(ek) vehetők meg onnan.
- **Építkezés**, **Ingyen lépcső**, **Ingyen épület** mezőknél a táblázat hotel-oszlopa **nem korlátoz semmit** — a játékos bármelyik saját telkét választhatja, függetlenül attól, melyik mezőn áll. (A 8. mezőnél, ami a bank mellett van, ezért nincs is hotel-hivatkozás — ott ez amúgy sem számítana.)
- **Lépcsők elhelyezése**: ha egy mezőn van lépcső, az pontosan egy szomszédos hotelhez tartozik, még akkor is, ha a mező több hotellel is szomszédos (pl. a 3. mező fujiyama-val ÉS boomeranggal is szomszédos, de legfeljebb az egyikük lépcsője kerülhet oda). Az Ingyen lépcső akciónál a motor egy szabad (még lépcső nélküli) mezőt keres, aminek `adjacentLotIds`-jában szerepel a játékos által választott telek.

A pálya közepén van a Fujiyama, a L'Etoile, a Royal és a bank, ebben a sorrendben. A pálya szélén pedig a start-parkoló (innen indulnak a játékosok bábui/autói), Boomerang, városháza, President, Waikiki, Taj Mahal, Safari, ebben a sorrendben — ez a vizuális elrendezés a Hotel-0c "assets" körben lesz releváns, a `LoopTrackBoard3D` placeholder-geometriáját nem befolyásolja.

## 4. Kör-vezérlés N fő esetén — miért más ez, mint a Dámánál

A Dáma `currentPlayer: 'LIGHT' | 'DARK'` egy egyszerű bináris flip. Hotelnél `currentPlayerIndex: number`, ami `players.length`-en körbefordul, és **át kell ugorjon** a csődbe ment játékosokon:

```typescript
function nextActivePlayerIndex(state: HotelState): number {
  let index = state.currentPlayerIndex;
  do {
    index = (index + 1) % state.players.length;
  } while (state.players[index].bankrupt && index !== state.currentPlayerIndex);
  return index;
}
```

**Győzelem-ellenőrzés (2. szakasz szerint javítva):** minden csőd/feladás után a reducer megszámolja a nem-csődbe-ment játékosokat — ha pontosan 1 marad, `status: 'FINISHED'` és `winnerId` az ő azonosítója. Ez a Dámától eltérő, **kieséses** győzelmi minta (nem kör-limit/pontszám-alapú, ahogy korábban tévesen feltételeztem).

Ez a `currentPlayerIndex`-es minta az oka, hogy a **Hotel-0b**-ben a `GameRoom.assignPlayerSlot`/`isPlayersTurn` absztrakcióit N-fősre kell generalizálni (jelenleg egy 2-elemű `TPlayerSlot` enumra van írva, lásd `docs/dama-0b-multiplayer-specifikacio.md` §6) — de ez már a **következő** fázis feladata, itt (Hotel-0a) még csak helyi hot-seat módban, `PlayerController`-en (Fázis 0a §6) keresztül fut, hálózat nélkül. A 2–4 fős tartomány (megerősítve, 8. szakasz) nem lesz hardcode-olva `players.length`-be — bármilyen N-re működik, hogy később bővíthető legyen.

## 5. 3D pálya-renderer: `LoopTrackBoard3D`

**Új NPM-függőségek** (jelenleg nincsenek a projektben): `three`, `@react-three/fiber`, `@react-three/drei` (utóbbi az `OrbitControls`-hoz és egyszerű primitív-segédekhez).

`src/client/renderers/loop-track-3d/LoopTrackBoard3D.tsx` — a `GridBoard2D` (lásd `src/client/renderers/grid-2d/GridBoard2D.tsx`) mintáját követi: **tisztán prezentációs**, semmit nem tud a Hotel szabályairól, csak azt kapja meg propokban, hogy mit rajzoljon ki, és kattintást jelent vissza.

```typescript
export interface LoopTrackSpace<TSpaceData> {
  id: string;
  data: TSpaceData;
}

export interface LoopTrackBoard3DProps<TSpaceData, TToken> {
  spaces: LoopTrackSpace<TSpaceData>[];
  renderSpace: (data: TSpaceData) => ReactNode; // R3F elemek (mesh/geometry), NEM sima HTML
  tokens: { spaceIndex: number; token: TToken }[]; // játékos-bábuk pozíciói
  renderToken: (token: TToken) => ReactNode;
  onSpaceClick?: (spaceId: string) => void;
}
```

A mezők pozícióját a komponens maga számolja (a mezők számából egy egyenletes, lekerekített téglalap alakú hurkot generál — `computeLoopPositions(count): Vector3[]`, tisztán geometriai segédfüggvény, nem tartalmaz játék-specifikus tudást). `<Canvas>` + `<OrbitControls>` (drei) fix, felülnézet-közeli kamerával indul. A mezők és bábuk **egyszerű geometriai primitívek** (doboz a mezőknek, magasságuk az épület-szinttel nő; kúp/gömb a játékos-tokeneknek, játékosonként eltérő szín) — ugyanaz a "placeholder assets a Fázis 0/1-ben" elv, mint amit a `Projekt-conception.md` már rögzít, csak most először él ténylegesen 3D-ben.

**core/games szeparációs teszt itt is:** működne-e ugyanez a renderer Monopolyhoz vagy Gazdálkodj okosanhoz, csak a `spaces`/`renderSpace` cseréjével? Igen — ezért kerül `client/renderers/`-be, nem `client/games/hotel/`-be, pontosan úgy, ahogy a `GridBoard2D` is a Sakk/Malom/Dáma közös renderere.

**Interakció — szándékosan NEM 3D-raycasting-alapú a v1-ben, megerősítve (8. szakasz):** a `LoopTrackBoard3D` csak megjelenít (vizuális élmény), a tényleges kör-akciók egy külön UI-elemen futnak. Screen-space HTML/SVG overlay a `<Canvas>` fölött (CSS `position: absolute`, nem a 3D jelenet része).

**`PlayerActionWheel` — valódi körcikkes tárcsa (2026-07-24, a `assets/Hotel/UI-menu.png` vázlat alapján, lásd 9.2 szakasz):**
- Game-agnosztikus renderer: `src/client/ui-kit/WheelMenu.tsx` — egy `count` opciónak megfelelő számú körcikkre (SVG `<path>` "donut wedge"-ekre) osztott tárcsa, mindegyik körcikkben piktogram (`lucide-react`) + felirat. A **használhatatlan opciók is megjelennek**, csak szürkén, nem kattinthatóan — nem tűnnek el, hogy a tárcsa alakja kör-ről körre kiszámítható maradjon.
- A tárcsa közepén (a "donut lyukban") két gomb: **Vissza** (csak akkor látszik, ha a menü nem a gyökérszinten van) és **X** (bezárás — ekkor csak egy kis kör gomb marad a játékos nevével, ami újranyitja).
- **Többszintes menü** (`src/client/games/hotel/ui/hotelMenuLevels.tsx`): gyökér-szint mindig ugyanazokkal a fő cselekvésekkel (Dobás, Vásárlás, Építkezés, Éjszakák dobása, Építési engedély, Lépcső vásárlása, Árverés, Feladás, Kör vége), almenükkel a többválasztásos esetekhez (pl. Vásárlás → melyik telek, ha a mező kettőhöz is szomszédos; Építkezés → telek → épület/kert). A navigációs verem (`MenuLevel[]`) a `PlayerActionWheel` saját, tranziens UI-állapota, nem a `HotelState` része.

Lásd: [`assets/Hotel/UI-menu.png`](../assets/Hotel/UI-menu.png) — a te vázlatod, ami alapján a tárcsa készült.

Lásd: [`docs/diagrams/hotel-0a-renderer-architecture.puml`](./diagrams/hotel-0a-renderer-architecture.puml) — a Dáma (2D/rács) és a Hotel (3D/hurok) renderer-rétegének cserélhetőségét mutatja be.

## 6. Kliens-oldali UI vázlat

```
src/client/games/hotel/
  ui/
    HotelSetupPage.tsx      # ÚJ koncepció — játékosszám (2-4) + nevek megadása, mielőtt a motor elindul
    HotelGamePage.tsx       # a DamaGamePage mintája: transport + LoopTrackBoard3D + PlayerActionWheel
    PlayerActionWheel.tsx   # ÚJ — kör alakú, lebegő, becsukható akció-menü (5. szakasz)
```

A `HotelSetupPage` az egyetlen ténylegesen új UI-fogalom a Dámához képest — a Dáma mindig fix 2 fős volt, itt a hot-seat indításhoz előbb be kell gyűjteni a játékosszámot (2–4, megerősítve) és a neveket, mielőtt `createInitialState(players)` lefut. Ugyanúgy `LocalGameTransport`-tal indul, mint a Dáma hot-seat módja (lásd Fázis 0a §6.2) — a `GameTransport`/`PlayerController` absztrakciók változtatás nélkül újrahasználhatók, mert eleve N-fősre lettek tervezve (nem 2-re hardcode-olva), így a későbbi bővítés (több mint 4 fő) sem igényel itt átírást.

## 7. Mappastruktúra-változások

```
package.json                          # MÓDOSUL — three, @react-three/fiber, @react-three/drei hozzáadva

src/
  shared/
    games/
      hotel/
        engine/
          state.ts, actions.ts, reducer.ts, rules.ts, selectors.ts, initialState.ts  # ÚJ
          (+ .test.ts fájlok, a Dáma mintáját követve)

  client/
    renderers/
      loop-track-3d/
        LoopTrackBoard3D.tsx           # ÚJ — game-agnosztikus, körbejárható pálya 3D renderelése
        computeLoopPositions.ts        # ÚJ — tiszta geometriai segédfüggvény
    games/
      hotel/
        ui/
          HotelSetupPage.tsx           # ÚJ
          HotelGamePage.tsx            # ÚJ
          PlayerActionWheel.tsx        # ÚJ — kör alakú lebegő akció-menü, Hotel-specifikus (nem game-agnosztikus)
    shell/
      gamesRegistry.ts                 # MÓDOSULT — hotel bejegyzés hozzáadva (routes.tsx változatlan,
                                        # a GameLoader már eleve generikusan, a registry alapján tölt be
                                        # minden helyi játékot — Dáma mintája szerint)
```

## 8. Nyitott pontok

**Lezárva, az első kör alapján:**
- [x] Szabályváltozat — a 2. szakaszban pontosítva, a te leírásod a hiteles forrás.
- [x] Részvény-mechanika — nincs a valódi játékban, kimarad, nincs is hely fenntartva rá a state-ben.
- [x] `LoopTrackBoard3D` interakció — nem kattintható 3D tábla; helyette kör alakú, lebegő, becsukható `PlayerActionWheel` (lásd 5. szakasz).
- [x] Játékosszám — 2–4 fő, de a motor N-re, nem hardcode-olt konstansra épül, hogy bővíthető maradjon.

**Lezárva, a `board.png` fotó alapján (harmadik kör, 2026-07-24):**
- [x] Start mező helye — a Safari és Fujiyama között (a piros irány-nyíllal jelölve).
- [x] Régió-sorrend és óramutató-irány — lásd 3.1 szakasz.

**Lezárva, a te pontos mező-listád alapján (negyedik kör, 2026-07-24):**
- [x] **A teljes 31 mezős pálya-elrendezés megerősítve** — lásd 3.1 szakasz, immár nem draft, hanem a `initialState.ts` közvetlen forrása.
- [x] A két speciális sáv helye megerősítve: "2000" a Fujiyama/Boomerang-szakasz után, "Lépcső-vásárlási jog" a Taj Mahal-szakasz előtt.
- [x] Építkezés/Ingyen mezők hotel-hivatkozása **nem korlátoz** — bármelyik saját telek választható onnan; a lépcső-elhelyezés viszont igen, egy mezőn legfeljebb egy lépcső lehet, egy konkrét hotelhez rendelve.

**Szabály-értelmezési kérdések — lezárva (második kör, 2026-07-24):**
- [x] Féláras kivásárlás: **kötelező eladás** — a vásárlást kezdeményező játékos egyoldalúan kikényszerítheti, nincs tulajdonosi beleegyezés. `BUY_LOT` tehát feltétel nélküli tulajdon-átruházás, ha a landolt Vásárlás mező szomszédos telke másvalakié.
- [x] Építési-engedély-kocka: **egy dobás vonatkozik az egész `START_CONSTRUCTION` tervre** (nem telkenként külön) — ez már eddig is így volt modellezve (`ROLL_BUILDING_PERMIT` egy önálló, a teljes tervet lezáró akció).
- [x] "+ kert" sor az éjszaka-táblázatban: **felváltja** az épület-szám szerinti sort, önálló legfelső tarifaszint — a `gardenNightlyRates` külön tömbként való modellezése (3. szakasz) ezt már helyesen tükrözi.
- [x] Bank-tulajdonú hotel visszavásárlása: **igen, ugyanaz a mechanika, mint az eredeti vásárlás** — eredetileg is a bank a telkek tulajdonosa (`ownerId: null`), és bármikor megvehető, amikor a játékos olyan mezőre lép, aminek az `adjacentLotIds` listájában szerepel az adott telek. Az egyetlen különbség az ár: normál esetben `lotPrice`, árverés utáni bank-tulajdon esetén a bank által fizetett `bankBuybackPrice` — ezt a 3. szakasz `HotelLot` típusa most már külön mezőként tárolja.

**Lezárva (ötödik kör, 2026-07-24):**
- [x] "Ha minden hoteled mellett megteltek a helyek, akkor a legdrágább lépcső árát kapod meg" — **megerősítve**: a saját, birtokolt hoteljeid közül a legdrágább lépcső-ár, nem a globálisan legdrágább.

**Minden nyitott pont lezárva — a terv implementálásra kész.**

## 9. Implementáció (2026-07-24)

Elkészült: a teljes motor (`state.ts`, `hotelConfigs.ts`, `actions.ts`, `rules.ts`, `reducer.ts`, `selectors.ts`, `initialState.ts` + `rules.test.ts`/`reducer.test.ts`, 34 teszt), a `LoopTrackBoard3D`/`computeLoopPositions` game-agnosztikus renderer, valamint a `HotelSetupPage`/`HotelGamePage`/`PlayerActionWheel` kliens-oldali UI. `gamesRegistry.ts` bővítve — a Hotel elérhető `/games/hotel/local` alól, a Dáma mintáját követve (`GameLoader` dinamikusan tölti be, `React.lazy`-n keresztül, külön code-split chunk-ban — ellenőrizve `vite build`-del: a fő bundle mérete nem nőtt, a Three.js-t is tartalmazó Hotel-chunk különálló, csak akkor töltődik le, ha valaki ténylegesen megnyitja a Hotelt).

**Ellenőrizve:** `tsc --noEmit` (kliens+szerver), `eslint .`, `vitest run`, `vite build`. Élő böngészős tesztet **te végeztél** (nekem nincs böngésző-automatizálási eszközöm ebben a környezetben) — ez már talált is egy valódi hibát, lásd 9.2 szakasz.

### 9.1 Implementáció közbeni döntések, amik nem szerepeltek explicit a tervben

- **A dobott értékek (mozgás-kocka, építési-engedély-kocka, éjszaka-kocka) az action-ökben utaznak** (`{type: 'ROLL_MOVE_DICE', value: number}` stb.), a kliens generálja őket (`Math.random()`), a reducer csak felhasználja — így a reducer továbbra is tiszta/determinisztikus és tesztelhető marad, ugyanaz az elv, mint a Dáma motorjánál. A tervdokumentum action-vázlata ezt még nem tartalmazta explicit.
- **`PLACE_BID`/`PASS_BID` egy `bidderId` mezőt is kapott** — árverés közben ugyanis NEM a soron lévő játékos cselekszik, hanem bármelyik másik, még nem passzolt játékos, ami eltér a kódbázis eddigi "minden action a soron lévő játékosra vonatkozik" mintájától.
- **Kezdőtőke: 15 000/fő — utólag megerősítve (2026-07-24).** Az implementáció idején még becslés volt (a te leírásod nem tartalmazta), de közben megerősítetted — a 2. szakasz mostantól tartalmazza. Továbbra is konfigurációs adatként (`STARTING_CASH` konstans `initialState.ts`-ben), nem logikába égetve.
- **Kör-építés v1 UI-egyszerűsítés:** bár a reducer/`START_CONSTRUCTION` egyszerre több telekre/épületre szóló tervet is támogat (a terv szerint), a `PlayerActionWheel` v1-ben mindig csak EGY épület (vagy a kert) építését ajánlja fel egy gombbal — ha valaki egy körben többször akar építeni, egymás után, külön építési-engedély-dobásokkal teheti meg (ezt maga a szabály is megengedi: "Egy körben többször is megismételhető ez a folyamat"). A motor kész a bővítésre, csak a UI egyszerűsített.
- **Árverés licitálása fix, 100-as lépésközzel** (`BID_INCREMENT`), nem szabadon beírható összeggel — elkerüli egy külön form/input UI megépítését v1-ben.
- **`LoopTrackBoard3D` mező-színezése típus szerint**, nem hotelenként — mivel egy mező akár 2 különböző hotelhez is tartozhat (`adjacentLotIds`), nincs egyértelmű "ez a mező ennyi épületet mutat" leképezés; ez a döntés összhangban van azzal, hogy a pontos vizuális megjelenítés úgyis Hotel-0c feladata.

### 9.2 Böngészős teszt közben talált és javított hibák (2026-07-24)

**Első hiba — "Jutalom átvétele" gomb ismételten kattintható volt.** Ingyen lépcső/Ingyen épület mezőn, ha a játékosnak nem volt (vagy nem volt hely számára), a "Jutalom átvétele" gomb a jutalom kifizetése UTÁN sem tűnt el a `PlayerActionWheel`-ből — a `RESOLVING_SPACE` fázisban a menü minden render alkalmával újraszámolta ugyanazt a gombot, tehát tetszőlegesen sokszor rá lehetett kattintani, minden kattintás újra fizetett. **Javítás — a te javaslatod alapján:** az Ingyen lépcső/Ingyen épület mezők most **teljesen automatikusan** oldódnak fel, közvetlenül a rálépéskor (`ROLL_MOVE_DICE` feldolgozása közben, mielőtt a `PlayerActionWheel` egyáltalán megjelenne) — nincs többé `TAKE_FREE_STAIRCASE`/`TAKE_FREE_BUILDING` action, nincs gomb, tehát nincs mit ismételni. A célpont-telek kiválasztása (melyik saját hotelhez kerüljön a lépcső/épület) is automatikus lett (az első jogosult telek), mivel úgyis csak egy géppel eldönthető, egyértelmű választás. Új reducer-teszt igazolja, hogy egy megismételt `ROLL_MOVE_DICE` a landolás után no-op (`turnPhase` már nem `AWAITING_ROLL`).

**Második kérés — a dobott kockaértékek nem látszottak sehol.** A `lastDiceRoll` mezőt szétválasztottuk `lastMoveRoll`/`lastNightsRoll`-ra (hogy a mozgás- és éjszaka-dobás ne írja felül egymást a kijelzőn), és a `HotelGamePage` most egy kis állapotsorban mutatja mindhárom kockát (mozgás, éjszakák, építési engedély — utóbbi magyar felirattal: zöld/H/2/piros), amíg az adott játékos köre tart.

**Harmadik kérés — épület felépítésekor nem jelent meg semmi vizuálisan a telken.** A `LoopTrackBoard3D` mezői mostantól annyi kis dobozt "húznak fel" egymásra (`buildingsBuilt` szerint), ahány épület van a hozzájuk tartozó telke(ke)n — mivel egy mező akár 2 hotelhez is tartozhat (`adjacentLotIds`), a magasabb épületszámú telek számít (a döntés indoklása az 5. szakaszban leírt kétértelműséggel azonos: a pontos, hotelenkénti vizuális leképezés Hotel-0c feladata, itt csak annyi a cél, hogy "legalább egy doboz" tényleg megjelenjen). A lépcső-jelölő henger emiatt kicsit arrébb került, hogy ne fedje a doboz-tornyot.

**Negyedik kérés — hiányzó szabály: egy mezőn legfeljebb egy játékos állhat.** Ezt eddig a motor egyáltalán nem kezelte. Új `resolveLandingPosition` függvény (`rules.ts`) a dobott lépésszám alkalmazása után, amíg a célmező foglalt (más, nem csődbe ment játékos áll rajta), egyesével tovább tolja a landolást — a `ROLL_MOVE_DICE` ezt használja a korábbi egyenes `(pozíció + dobás) % hossz` számítás helyett. A speciális sávok (2. szakasz) az így megnövelt teljes lépésszámmal számolnak, tehát egy csak a "tovább-tolás" közben átlépett sáv (pl. "+2000") is helyesen érvényesül.

Első nekifutásra a Start mezőt kivettem a szabály alól (feltételezve, hogy a kezdőállapot miatt kell a kivétel), de ez **tévesnek bizonyult, javítva**: valójában van egy külön, a Starttól eltérő "nulladik" mező, a **parkoló** — innen indul minden játékos, és a parkoló a kezdés után nem is vesz részt a köreiben (rá lépni sem lehet menet közben). Emiatt a Start mostantól **teljesen normál mezőként** viselkedik, rá is vonatkozik a mezőfoglaltsági szabály — a kivétel a parkolóra száll át, ami viszont architekturálisan nem is a 31 mezős `board` tömb tagja (`PARKING_POSITION = -1`, a `board`-indexelés előtti, "virtuális" kezdőhely — a meglévő "+1 lépésenként" mozgás-számítás emiatt külön esetkezelés nélkül helyesen kezeli, mert `-1 + 1 = 0` pontosan a Start mezőre esik). A `LoopTrackBoard3D`-ben a parkolóban álló játékosok egyelőre vizuálisan a Start mezőnél jelennek meg (ez csak megjelenítési közelítés, a valós `position` állapotot nem érinti).

**Ötödik kérés — a `PlayerActionWheel` legyen valódi körcikkes tárcsa, többszintes menüvel, és az építkezésnél lehessen több épületet is egyszerre kijelölni.** Ez a legnagyobb UI-átalakítás eddig, két részből áll:

1. **Új, game-agnosztikus `WheelMenu` komponens** (`src/client/ui-kit/`) — SVG "donut wedge" körcikkek, mindegyikben `lucide-react` piktogram + felirat, a `assets/Hotel/UI-menu.png` vázlatod alapján. A használhatatlan opciók is látszanak (szürkén, letiltva), ahogy kérted. Középen Vissza (csak nem-gyökér szinten) + X (bezárás, ekkor egy kis kör gombra zsugorodik, ami a játékos nevét mutatja).
2. **Többszintes menü-hierarchia** (`hotelMenuLevels.tsx` + a `PlayerActionWheel` saját navigációs verme) — a gyökérszint mindig ugyanazt a 9 fő cselekvést mutatja (kontextustól függően engedélyezve/letiltva), almenükkel ott, ahol több választás lehetséges. Az **Építkezés → telek → épület** ág támogatja a többszörös kijelölést: minden "+1 épület"/"+ kert" kattintás egy külön, tranziens (nem `HotelState`-beli) kijelölés-listához adódik hozzá, amit egy **külső panel** mutat a tárcsa mellett (nem a tárcsa maga) — ott lehet egyenként törölni egy-egy kijelölést, "Mégse"-vel az egészet elvetni, vagy "Építési engedélyt kér"-rel egy `START_CONSTRUCTION` action-ben, egyszerre, az összes kijelölt tétellel elküldeni. A reducer maga már eleve támogatta a több-tételes tervet (3. szakasz) — ez most tényleg kihasználásra kerül a UI-ban is, nem csak egy-egy épületre szűkítve, mint a korábbi v1 egyszerűsítésben.

A navigáció automatikusan gyökérre és üres kijelölésre reset-el, ha új mezőre lép a játékos, vagy másik játékos jön (elkerülve, hogy egy be nem fejezett építkezés-kijelölés "ott ragadjon" egy másik körre).

**Ellenőrizve (mind az öt kérés után):** `tsc`, `eslint`, `vitest` (66/66 teszt), `vite build` — mind zöld. Új függőség: `lucide-react` (piktogramok).

**Hatodik kérés — a Vásárlás almenü nem lépett vissza a gyökérmenübe, plusz három kisebb finomítás.** Élő teszt közben találtad: az almenüben egy telek kiválasztása lefuttatta a `BUY_LOT`-ot, de a `PlayerActionWheel` navigációs verme (`stack`) a `purchase-lots` szinten ragadt, mert csak a `confirmConstruction`/`cancelConstruction` állította vissza explicit gyökérre — egyetlen más almenü-akció sem tette ezt.

**Javítás — egységesített, minden almenü-akcióra érvényes szabály:** `PlayerActionWheel` most egy `dispatchAndReturnToRoot` wrappert ad át minden szint slice-számoló függvényének (a nyers `dispatch` helyett) — minden olyan gomb, ami ténylegesen game action-t küld (nem csak almenübe navigál), a küldés UTÁN automatikusan visszaáll a gyökérre. Ez nemcsak a Vásárlást javítja, hanem mellékesen egy addig rejtett hibát is: egy lezárt árverés után az `auction-bidding` szint üres slice-listát adott volna vissza (`0/0` osztás az `WheelMenu` szögszámításban) — ez most nem fordulhat elő, mert a lezáró licit/passz után is visszaugrunk gyökérre.

Eközben megkérted, hogy nézzem meg a menüelemek frissülését is — ez a `computeSlices` felépítéséből adódóan már eddig is minden render alkalmával friss `state`-ből számolódott, tehát a "nem frissül" élmény ugyanennek a navigációs hibának volt a tünete (rossz szinten maradt a tárcsa), nem külön probléma.

Két további, ezzel egy körben kért finomítás:
- **Egyetlen opció esetén se ugorjon át a menü az almenün** — a `buySlice` korábban közvetlenül dobta a `BUY_LOT`-ot, ha épp csak egy telek volt vehető, kihagyva a `purchase-lots` szintet. Most mindig belép az almenübe, függetlenül az elemszámtól. Ehhez kellett egy `WheelMenu`-beli hiba is: egyetlen körcikk esetén a szög `360°`, egy 360°-os SVG ívet viszont nem lehet egyetlen `A` paranccsal helyesen kirajzolni (kezdő- és végpont egybeesik, elfajuló path) — a `wedgePath` most `359.99°`-ra korlátozza a maximális kitöltést, ami vizuálisan teljes körnek látszik, de érvényes ívet ad.
- **"Építési engedélyt kér" azonnal dobjon is** — korábban a gomb csak a `START_CONSTRUCTION`-t küldte el, utána külön, a gyökérmenübe visszatérve kellett rákattintani egy önálló "Építési engedély" cikkre a tényleges dobáshoz. Most a `confirmConstruction` egy kattintásban küldi mindkét action-t (`START_CONSTRUCTION`, majd rögtön `ROLL_BUILDING_PERMIT`), a gyökérmenüből pedig eltűnt a külön "Építési engedély" cikk (nincs rá már szükség, sosincs olyan állapot, amikor ezt önmagában kellene kattintani).

**Hetedik kérés — "szeretném látni, milyen telkeim vannak, mikor én következem."** Új `OwnedLotsPanel` a `HotelGamePage`-en, a tárcsával szemközt (bal felül) — a soron lévő játékos saját telkeit listázza (`getOwnedLots` selector), telkenként épület-darabszámmal (`x/y épület`), és ha van, "kert"/"lépcső" jelzéssel (utóbbi a `board`-on keresztül, mivel a lépcső-tulajdon nem a `HotelLot`-on, hanem a mezőn van nyilvántartva).

**Ellenőrizve (mind a hét kérés után):** `tsc`, `eslint`, `vitest` (66/66 teszt), `vite build` — mind zöld.

**Nyolcadik kérés — az építkezés-menü mégis csak kétszintes legyen, mert a kert-építés sorrendje eleve rögzített.** A hatodik/hetedik körben bevezetett háromszintes Építkezés→telek→épület ág felesleges volt: mivel a kertet csak az összes épület megléte után lehet megépíteni, egy adott telken mindig egyértelmű, mi a "következő" tétel (a következő sorszámú épület, vagy — ha minden épület megvan — a kert). A `construction-lot-detail` szint és a `constructionLotDetailSlices` függvény megszűnt; a `constructionLotSlices` (Építkezés almenü) most telkenként EGY gombot ad, ami mindig a telek következő, meghatározott lépését kínálja fel (pl. "Waikiki: 3. épület (2500)", majd a legördülő megépítése után automatikusan "Waikiki: Kert (2500)"-re vált) — a kattintás nem navigál sehova, csak a kijelölés-listához adja hozzá a tételt, úgyhogy egymás után több telekről/tételről is lehet választani ugyanazon a szinten.

Ezzel egy körben kérted, hogy a kiválasztott-építkezések panel mutassa az össz-költséget és annak duplázott értékét (a "2-es" építési-engedély-dobás miatt) — a panel most a lista alatt egy "Össz. költség: X (dupla dobásnál: 2X)" sort mutat, a meglévő `computeConstructionCost` selectorral számolva.

**Kilencedik kérés — az épületek ne a mezőkre, hanem melléjük kerüljenek, a kör belsejébe vagy külsejébe.** Mivel ez sehol nem szerepelt korábban leírva a tervben, rákérdeztem: **megerősítve — Royal, Fujiyama és L'Etoile a kör belsejében, a másik öt hotel (Waikiki, Boomerang, Taj Mahal, Safari, President) a kör külsején helyezkedik el.** Ez tisztán renderelési tény, nem játékállapot, ezért egy új `HOTEL_SIDE` konstansban él kliens-oldalt (`HotelGamePage.tsx`), nem a motorban. A `LoopTrackBoard3D` (game-agnosztikus renderer) most minden mezőhöz átad egy `inward: [number, number]` egységvektort is (a mező középpontjától a hurok középpontja felé mutat) — ez általános, bármely jövőbeli hurok-alapú játék (Gazdálkodj okosan, Monopoly) számára újrahasználható, nem Hotel-specifikus. A `renderHotelSpace` az épület-dobozokat mostantól a mező mellé, `inward`/`outward` irányba eltolva rajzolja (két külön torony, mivel egy mező akár 2, ELTÉRŐ oldalon lévő hotelhez is tartozhat, pl. a fujiyama+boomerang mező — ez a korábbi, "csak a magasabb épületszámú telek számít" egyszerűsítést váltja fel egy pontosabb, oldalankénti számolással: `insideBuildings`/`outsideBuildings`, mindkettő a saját oldalán lévő szomszédos telkek maximuma).

**Ellenőrizve (mind a kilenc kérés után):** `tsc`, `eslint`, `vitest` (66/66 teszt), `vite build` — mind zöld.

**Tizedik kérés — architekturális: az engine kényszerítse ki MINDEN lépés validációját, ne csak az építkezés sorrendjét, és egy `GetValidAction`-szerű metódus adja a UI-nak (és később az AI-nak) a lehetséges lépéseket.** A kilencedik kör kapcsán kiderült, hogy `isValidConstructionPlan` (`reducer.ts`) nem ellenőrizte a kert-előtt-épület sorrendet — ez rávilágított egy általánosabb hiányosságra: a `PlayerActionWheel`/`hotelMenuLevels.tsx` eddig **saját maga** számolta ki, mely lépések engedélyezettek (telek vásárolható-e, telek építhető-e, stb.), a reducer `apply*` függvényei pedig ettől **függetlenül**, saját, részben eltérő inline feltételekkel validáltak — két, egymástól függetlenül karbantartott szabály-forrás, ami pont ezt a fajta rést engedte át. Megoldás, a Dáma motorjának mintájára (ahol a `reducer` és a `getValidMoves` selector ugyanazokat a `rules.ts`-beli függvényeket — `findCaptureMoves`, `findSimpleMoves` — hívja, nem duplikálja a logikát):

1. **`rules.ts` bővült egy "action legality" szekcióval** — minden egyes action-típushoz egy `can*` predikátum (`canRollMoveDice`, `canRollNights`, `canRollBuildingPermit`, `canForfeit`, `canEndTurn`, `canBuyLot`, `canStartConstruction`, `canBuyStaircaseRight`, `canStartAuction`, `canPlaceBid`, `canPassBid`), plusz a hozzájuk tartozó listázó/generáló függvények (`getConstructionEligibleLots`, `getStaircaseEligibleLots`, `getAuctionableLots`, `getRemainingBidderIds`, `getNextBidAmount`). Új, kulcsfontosságú függvény: **`getNextConstructionStep(lot, pendingBuildingCount, pendingGarden)`** — az egyetlen hely, ahol az épület-előbb-mint-kert sorrend eldől; a korábban a UI-ban élt azonos logikát váltja fel. Az `isValidConstructionPlan` (korábban `reducer.ts`-ben, csak ott) átköltözött ide, exportálva, és **megerősítve**: mostantól elutasítja, ha egy plan-tétel kertet kér úgy, hogy a tétel alkalmazása után még nem lenne kész minden épület, és azt is, ha egy tétel se épületet, se kertet nem ad hozzá (no-op tétel).
2. **`reducer.ts` minden `apply*` függvénye immár ezekre a megosztott predikátumokra hivatkozik** saját inline feltételek helyett — a reducer ettől kezdve garantáltan és kizárólag ugyanazt a szabályhalmazt érvényesíti, amit a UI/AI is lát.
3. **`selectors.ts` kapott egy `getValidActions(state): HotelValidActions` aggregáló függvényt** — ez a kért "GetValidAction" metódus: egyetlen hívással megadja, mi engedélyezett éppen most (dobható-e a kocka, mely telkek vehetők meg, mely telkeken mi a következő építési lépés és mennyibe kerül, mely telkeken vásárolható lépcsőjog, mely telkek árverezhetők, ki licitálhat és mennyiért, feladható-e a kör, véget érhet-e a kör). Emellett javítva egy régóta lappangó hiba is: a korábbi `getBuyableLots`/`getCurrentSpace` nem szűrt tényleges vehetőségre (csak "szomszédos telek", tulajdonjogot/árat nem nézte) és `state.board[-1]`-re futott volna, ha valaki a parkolóból hívja meg — mindkettő javítva.
4. **`hotelMenuLevels.tsx` átírva, hogy `getValidActions(state)`-ből olvasson**, ne saját maga számolja újra a jogosultságokat — a privát `buyableLotsAt`/`constructionEligibleLots`/`staircaseEligibleLots` helyi függvények és a UI-oldali `BID_INCREMENT` konstans megszűntek, mindegyik a motorból jön. Ez egyúttal a `rootSlices` komplexitását is csökkentette (a korábbi `buySlice`/`constructionSlice`/`staircaseRightSlice`/`auctionSlice` segédfüggvényekre már nincs szükség, a `rootSlices` most egy sík lista, mezőnként a `getValidActions` egy-egy mezőjével).

Új tesztek (83/83 összesen a projektben): `rules.test.ts`-ben `getNextConstructionStep` (sorrend-kikényszerítés), `isValidConstructionPlan` (elutasítja a kert-előbb-mint-épület tervet és a no-op tételt), `canBuyLot`/`canStartConstruction`; `reducer.test.ts`-ben egy közvetlen `START_CONSTRUCTION`-teszt, ami bizonyítja, hogy a motor — nem csak a UI — elutasítja a hibás sorrendű tervet; új `selectors.test.ts` fájl a `getValidActions`-höz.

**Fontos későbbi vonatkozás:** ez a `getValidActions` pontosan az az interfész, amit a Hotel-0d AI majd használni fog a döntéshozatalhoz (a Fázis 0c Dáma-AI-hoz hasonlóan "szimulált input" elven — az AI egy valós, engedélyezett action-t választ ki innen, sosem kerülhet ki a reducer validációján).

**Ellenőrizve:** `tsc` (kliens + `typecheck:server`), `eslint` (teljes projekt), `vitest` (83/83 teszt), `vite build` — mind zöld.

**Tizenegyedik kérés — kinyitható napló panel, ami minden eddigi eseményt mutat (vásárlás, építkezés, lépés, pénzmozgás).** A napló strukturált adatként él az engine-ben, nem előre formázott szövegként — ugyanaz az elv, mint a `BuildingPermitResult`-nál: a motor marad UI-/nyelv-agnosztikus, a kliens alakítja magyar mondattá. Ez azért is fontos, mert a `HotelState` (és benne a napló) a Hotel-0b multiplayer-szinkron alapja lesz — ha a napló a kliensben élne, minden játékos külön, esetleg eltérő naplót látna.

- **`state.ts`: új `LogEntry` unió** (14 esemény-típus: `MOVED`, `BONUS_2000`, `STAIRCASE_RIGHT_ACTIVATED`, `LOT_BOUGHT`, `CONSTRUCTION_PERMIT_ROLLED`, `NIGHTS_STAY`, `FREE_STAIRCASE_GRANTED`, `FREE_BUILDING_GRANTED`, `STAIRCASE_RIGHT_BOUGHT`, `AUCTION_STARTED`, `BID_PLACED`, `BID_PASSED`, `AUCTION_RESOLVED`, `FORFEITED`, `GAME_WON`) + `HotelState.log: LogEntry[]` (append-only, kezdetben üres).
- **`rules.ts`: `appendLog(state, entry)` helper.**
- **`reducer.ts`: minden `apply*` függvény (és a `resolveFreeStaircase`/`resolveFreeBuilding`/`resolveAuction`/`checkWinCondition` belső segédfüggvények) most naplóz**, amikor ténylegesen történik valami — egy elutasított/no-op action-nél (a `can*` predikátumok miatt) NEM kerül be semmi a naplóba, tehát a napló pontosan azt mutatja, ami valóban megtörtént a játékban.
- **Kliens: `formatLogEntry.ts`** (`src/client/games/hotel/ui/`) — a `LogEntry`-ket magyar mondatokká alakítja, telek-/játékosnevek feloldásával az aktuális `state`-ből. Az ESLint komplexitás-korlát miatt a formázás négy kis segédfüggvényre van bontva esemény-kategóriánként (mozgás, vagyon, árverés, egyéb), ugyanaz a minta, mint korábban a `reducer`/`rootSlices` felbontásánál.
- **Új `GameLogPanel` komponens** — alapból csukott (egy "Napló (N)" gomb a bal alsó sarokban), kinyitva egy görgethető, legújabb-elöl listát mutat. `HotelGamePage.tsx`-be bekötve az `OwnedLotsPanel` (bal fent) és `PlayerActionWheel` (jobb fent) mellé, negyedik sarokként.

Új tesztek `reducer.test.ts`-ben (89/89 teszt összesen): napló kezdetben üres, `MOVED` bejegyzés az első dobásnál, `BONUS_2000` a `MOVED` mellett sáv-átlépéskor, elutasított action nem naplóz, `LOT_BOUGHT` a tényleges árral, `CONSTRUCTION_PERMIT_ROLLED` a feloldott (duplázott) összköltséggel, `FORFEITED`+`GAME_WON` együtt egy feladásnál.

**Ellenőrizve:** `tsc` (kliens + `typecheck:server`), `eslint` (teljes projekt), `vitest` (89/89 teszt), `vite build` — mind zöld.

**Tizenkettedik kérés — Feladásnál rákérdezés egy modal ablakban.** A "Feladás" tárcsa-gomb eddig azonnal elküldte a `FORFEIT` action-t. A már meglévő, generikus `Modal` komponenst használva (`src/client/ui-kit/Modal.tsx`, ugyanaz, amit a `LobbyPage` is használ szoba-létrehozásnál) a gomb most csak egy megerősítő ablakot nyit ("Feladod a játékot? Minden telked a bankhoz kerül..." + Mégse/Igen, feladom gombok), és csak a tényleges megerősítésre megy ki a `FORFEIT`. A `rootSlices` (`hotelMenuLevels.tsx`) kapott egy új `onRequestForfeit` paramétert erre a célra, a `PlayerActionWheel` pedig egy `forfeitConfirmOpen` állapotot (a szokásos player-/mező-váltáskor resetelődő state-ek közé véve, hogy ne ragadjon nyitva más körre).

**Ellenőrizve:** `tsc`, `eslint`, `vitest` (89/89 teszt), `vite build` — mind zöld.

**Tizenharmadik kérés — kiesett játékos bábuja le a tábláról, és a soron lévő játékos neve mellett a bábuja színe is látszódjon.** `HotelGamePage.tsx`: a `tokens` lista most kiszűri a csődbe ment (`player.bankrupt`) játékosokat, mielőtt a `LoopTrackBoard3D`-nek átadná — a bábujuk egyszerűen nem jelenik meg többé a táblán (a `Player.bankrupt` mezőt a `FORFEIT` action már eddig is beállította, csak a renderer nem használta). Az állapotsor ("Soron van: ...") most egy kör alakú színmintát és a magyar színnevet (piros/kék/zöld/sárga, a `PLAYER_COLORS` tömbbel párhuzamos `PLAYER_COLOR_NAMES`) is mutatja a soron lévő játékos neve mellett.

**Ellenőrizve:** `tsc`, `eslint`, `vitest` (89/89 teszt), `vite build` — mind zöld.

**Tesztlefedettség-ellenőrzés (2026-07-24) — hiányzó tesztek pótolva.** Rákérdeztél, van-e teszt a lépcső vásárlására, az éjszakákra és az árverésre. Kiderült: az éjszakák (`ROLL_NIGHTS`) rendben lefedettek voltak, az árverés csak részben (egyetlen, adósság-kiváltotta, 2 szereplős útvonal, éllapotok nélkül), a **lépcső vásárlása (`BUY_STAIRCASE_RIGHT`) pedig egyáltalán nem volt tesztelve**. Pótolva:

- `reducer.test.ts`: új `BUY_STAIRCASE_RIGHT` blokk (5 teszt: sikeres vásárlás+lépcső-elhelyezés, jog nem aktív, nem saját telek, ugyanazon telekre kétszer egy körben, nincs elég pénz).
- `reducer.test.ts`: új `auction bidding edge cases` blokk, szándékosan **4 szereplős** játékkal (2 szereplőnél egyetlen passz mindig lezárja az árverést, tehát a "több jogosult licitáló még hátra van, az árverés nyitva marad" ág korábban sosem futott le ténylegesen) — 6 teszt: nyitva marad 1 passz után, lezárul az utolsó előtti licitáló passzánál is, kikényszerítő (auctioneer) nem licitálhat sajátjára, licitnek meg kell haladnia a jelenlegi legmagasabbat, licitáló nem licitálhat többet mint amennyi pénze van, már passzolt licitáló nem léphet újra.
- `rules.test.ts`: közvetlen predikátum-tesztek `canBuyStaircaseRight`/`canPlaceBid`/`canPassBid`-re (11 teszt), ugyanabban a stílusban, mint a korábbi `canBuyLot`/`canStartConstruction` blokk.

Összesen 111/111 teszt (89 → 111, +22 új). **Ellenőrizve:** `tsc`, `eslint`, `vitest` (111/111), `vite build` — mind zöld.

**Tizennegyedik kérés (2026-07-23) — lépcső elhelyezésénél a mezőt a játékos válassza ki, ne a motor.** Eddig mind a fizetős lépcsővásárlás (`BUY_STAIRCASE_RIGHT`), mind az ingyen lépcső (`FREE_STAIRCASE` mezőre lépés) automatikusan az első szabad, szomszédos mezőt választotta ki. Kérted: fizetős vásárlásnál nyilvánvalóan a megvásárolt telek melletti mezők közül válasszon a játékos, ingyen lépcsőnél pedig bármelyik saját telke melletti szabad mező szóba jöhet.

- **`state.ts`**: új `AWAITING_FREE_STAIRCASE_CHOICE` `turnPhase` — a `FREE_STAIRCASE` mezőre lépés, ha van legalább egy választható (telek, mező) pár, immár nem old fel automatikusan, hanem itt vár a játékos döntésére.
- **`actions.ts`**: `BUY_STAIRCASE_RIGHT` kapott egy kötelező `spaceId` mezőt; új `CHOOSE_FREE_STAIRCASE_SPACE { lotId, spaceId }` action az ingyen-ág lezárásához.
- **`rules.ts`**: a korábbi `findAvailableStaircaseSpace`/`hasAvailableStaircaseSpace` helyett `getStaircaseSpaceOptions(state, lotId)` — az adott telek melletti, még lépcső nélküli mezők listája, mindkét (fizetős/ingyen) ág ezt használja. `canBuyStaircaseRight` mostantól `spaceId`-t is kér és ellenőriz. Új `getFreeStaircaseCandidates(state, playerId)` — az összes saját telek összes szabad szomszédos mezőjének listája — és `canChooseFreeStaircaseSpace`.
- **`reducer.ts`**: a `FREE_STAIRCASE`-mezőre-lépés logikája (`resolveFreeStaircaseLanding`) csak akkor old fel automatikusan (a korábbi készpénz-kifizetéses tartalék-ágakon: nincs saját telek, vagy egyik saját teleknek sincs már szabad szomszédos mezője), ha ténylegesen nincs választható mező — egyébként `AWAITING_FREE_STAIRCASE_CHOICE`-ra állítja a kört. Új `applyChooseFreeStaircaseSpace`. `applyBuyStaircaseRight` a kapott `spaceId`-re helyezi a lépcsőt (nem az elsőre, amit talál).
- **`selectors.ts`**: `getValidActions` kapott `canChooseFreeStaircaseSpace`/`freeStaircaseCandidates` mezőket.
- **`HotelRoom.ts`**: `isValidAction` frissítve mindkét (megváltozott és új) action alakjához.
- **Kliens (`hotelMenuLevels.tsx`, `PlayerActionWheel.tsx`)**: a "Lépcső vásárlása" tárcsa-elem most kétszintű (telek → mező) — a telek kiválasztása már nem küldi el azonnal az action-t, csak a szomszédos szabad mezőket listázó almenübe navigál (`staircase-right-spaces`). Új gyökér-elem, "Lépcső elhelyezése" — ingyen lépcsőnél aktív, minden saját telek minden szabad szomszédos mezőjét egy sík listában mutatja (`free-staircase-spaces`).

Új tesztek: `rules.test.ts` — `canBuyStaircaseRight` kiegészítve `spaceId`-vel (2 új eset: nem szomszédos mező, már foglalt mező), új `getFreeStaircaseCandidates`/`canChooseFreeStaircaseSpace` blokk (5 teszt). `reducer.test.ts` — a meglévő `BUY_STAIRCASE_RIGHT` teszteket kiegészítettük `spaceId`-vel, plusz új tesztek: `AWAITING_FREE_STAIRCASE_CHOICE`-ra állás választható mezővel, `CHOOSE_FREE_STAIRCASE_SPACE` sikeres lezárás, nem-szomszédos mező elutasítása, fázison kívüli no-op, és a készpénz-tartalék ág (nincs több szabad mező egy adott saját telek mellett). Összesen 123/123 teszt (111 → 123, +12 új). A `FREE_BUILDING` (mit épít, melyik telken) szándékosan érintetlen maradt — ott nincs mező-választás, a kérés kifejezetten csak a lépcsőre vonatkozott.

**Ellenőrizve:** `tsc` (kliens + `typecheck:server`), `eslint` (teljes projekt), `vitest` (123/123), `vite build` — mind zöld.

**Tizenötödik kérés (2026-07-24) — kertre nem kötelező építési engedélyt kérni, de a lehetőség megvan.** Kiderült, hogy a motor eddig MINDEN construction plant (épület és/vagy kert) automatikusan végigvitt az építésiengedély-kockán (`AWAITING_BUILDING_PERMIT`) — ez helyes épületekre, de a valódi szabály szerint egy tisztán kert-plan (semmilyen épületet nem kér) kockázat nélkül, fix áron is felépíthető, a kockás út pedig továbbra is opcionálisan választható marad (pl. esély az ingyenes "H" dobásra, cserébe a dupla-ár kockázatáért).

- **`actions.ts`**: új `BUILD_WITHOUT_PERMIT { plan }` action, a meglévő `START_CONSTRUCTION`/`ROLL_BUILDING_PERMIT` páros mellett, nem helyette.
- **`rules.ts`**: `isGardenOnlyPlan(plan)` — igaz, ha minden tétel `buildingCount: 0` és `buildGarden: true`; `canBuildWithoutPermit(state, playerId, plan)` — ugyanazt a helyzetet (`canStartConstruction`) és tervérvényességet (`isValidConstructionPlan`) követeli meg, mint a kockás út, plusz a kert-only megszorítást.
- **`reducer.ts`**: új `applyBuildWithoutPermit` — nincs `pendingConstructionPlan`/`AWAITING_BUILDING_PERMIT` köztes fázis, a terv azonnal, teljes áron (`computeConstructionCost` összegezve, szorzó nélkül) felépül, ugyanazzal a `chargePlayer` adósság-kezeléssel, mint minden más fizetés.
- **`state.ts`**: új `GARDEN_BUILT_WITHOUT_PERMIT` napló-esemény.
- **Kliens**: a construction-kiválasztás panelen (`PlayerActionWheel.tsx`) egy harmadik gomb, "Építés dobás nélkül", ami csak akkor jelenik meg, ha a kiválasztott (`pending`) terv ténylegesen kert-only és `canBuildWithoutPermit` igazat ad — a meglévő "Építési engedélyt kér" gomb változatlanul megmarad választható alternatívaként. `formatLogEntry.ts` kapott egy `GARDEN_BUILT_WITHOUT_PERMIT` ágat is.
- **Szerver**: `HotelRoom.ts` `isValidAction`-je a `BUILD_WITHOUT_PERMIT`-et a `START_CONSTRUCTION`-nal azonos alak-ellenőrzéssel fogadja el (mindkettő egy `ConstructionPlanItem[]` tervet hordoz).

Új tesztek: `rules.test.ts` — `isGardenOnlyPlan`/`canBuildWithoutPermit` blokk (4 teszt). `reducer.test.ts` — új `BUILD_WITHOUT_PERMIT` blokk (3 teszt: sikeres kockamentes kertépítés fix áron, épületet is tartalmazó terv elutasítása, és hogy a kockás út is elérhető marad ugyanarra a helyzetre). Összesen 130/130 teszt (123 → 130, +7 új).

**Ellenőrizve:** `tsc` (kliens + `typecheck:server`), `eslint` (teljes projekt), `vitest` (130/130), `vite build` — mind zöld.

**Tizenhatodik kérés (2026-07-31) — hosszabb hot-seat playtest során talált 3 hiba, plusz egy, a hibakeresés közben felszínre került architekturális hiányosság.**

**Első hiba — Ingyen épület mező (L'etoile-nál) a kertet adta, épület helyett.** A `freeBuildOptionsOf` (`reducer.ts`) minden telekhez a következő épület-szintet ÉS a kertet is felkínálta egyszerre, valahányszor `!lot.hasGarden` — a helyes szabály szerint a kert csak azután választható, hogy MINDEN épület megvan a telken. Mivel L'etoile kertje (4000) drágább, mint bármelyik saját épület-szintje (legdrágább 3300), az "legdrágább elérhető opció" választás (lásd a tizenötödik kérés előtti, "FREE_BUILDING picks the single most expensive..." bekezdést) egy teljesen beépítetlen L'etoile-on is mindig a kertet nyerte. **Javítás:** `freeBuildOptionsOf` mostantól a meglévő `getNextConstructionStep`-et hívja telkenként (ugyanaz az egyetlen hely, ami az épület-előbb-mint-kert sorrendet ismeri, lásd tizedik kérés) — egy telek sosem ajánl egyszerre épületet ÉS kertet, mindig csak a tényleges következő lépését. Emellett a "nincs mit építeni" tartalék-kifizetés (minden saját telek teljesen kész) is javítva: a korábbi `Math.max(...owned.flatMap(lot => [...buildingPrices, gardenPrice]))` (minden szint + kert között keresett maximumot) helyett most `Math.max(...owned.map(lot => lot.buildingPrices[0]))` — a te pontosításod szerint: "az összes saját telke közül a legdrágább főépületének (első épület a telken) az árát kapja meg", sosem kertárat.

**Második hiba — árverésre kényszerítés saját telek nélkül.** Ha egy játékos nem tudott fizetni, és NEM volt semmilyen telke (tehát semmit sem árverezhetett volna el), a motor mégis `AWAITING_DEBT_RESOLUTION`-ba állt, a UI pedig felkínálta az "Árverés" gombot — ami egy üres, semmit nem tartalmazó almenübe vezetett (zsákutca). **Javítás:** a `chargePlayer` és az árverés utáni `afterDebtRaisingAction` mostantól, mielőtt bármikor `AWAITING_DEBT_RESOLUTION`-ba lépne, megnézi, van-e a játékosnak egyáltalán telke (`ownedLotsOf`) — ha nincs, azonnal, automatikusan csődbe megy (nem kell hozzá a saját "Feladás" gombot kattintania), a `FORFEITED` napló-esemény pedig egy új `reason: 'VOLUNTARY' | 'INSOLVENT'` mezőt kapott, hogy a napló (és a formázott üzenet, `formatLogEntry.ts`) egyértelműen megkülönböztesse a szándékos feladást ("feladta a játékot") az automatikus, kényszerű csődöt ("csődbe ment (nem tudta fizetni az adósságát, és nem volt mit elárvereznie)").

**Harmadik kérés — a tárcsa-menü közepén a Vissza/Bezárás gombok kapjanak hátteret és keretet.** A `WheelMenu.module.css` `.backButton`/`.closeButton` eddig `border: none; background: transparent` volt — a tárcsa sötét közép-köre (`.hub`) felett szemmel nehezen volt elkülöníthető, hol az egyik, hol a másik gomb. Mindkettő kapott egy halvány sötét hátteret + arany (a tárcsa többi eleméhez illő) szegélyt (a Bezárás gomb emellett kör alakú "jelvény" lett, nem csak sima × karakter).

**Menet közbeni felfedezés — a lokális (hot-seat) játékok NEM készítettek log fájlt ehhez a partihoz.** A hibák keresésekor kiderült: a `logs/games/` alatti `.jsonl` fájlok mind régi, generikus "Játékos 1/2" nevű teszt-partikból származtak — a tegnapi, valódi négyfős (Zsófi/Doma/Luca/negyedik játékos) parti egyáltalán nem hagyott nyomot. Ok: `LoggingGameTransport` (`src/client/core/transport/`) minden dispatch-nél egy fire-and-forget `POST /api/game-log`-ot küldött a szerverre, ami CSENDBEN elveszett, ha a szerver (`npm run server:dev`) épp nem futott — helyi (hot-seat) játék viszont, tervezetten, szerver nélkül is teljesen játszható, tehát ez egy valós, gyakori eset, nem szélsőséges. **Javítás:** új `gameLogQueue.ts` — minden napló-bejegyzés a hálózati kísérlet ELŐTT egy localStorage-alapú várólistára kerül, és csak a szerver által ténylegesen visszaigazolt (204) küldés után törlődik onnan; egy sikertelen küldés nem vész el, hanem a KÖVETKEZŐ flush-kísérletre vár (minden újabb dispatch-kor, és minden alkalommal, amikor egy új `LoggingGameTransport` példány jön létre — tehát legkésőbb a következő alkalommal, amikor bármelyik helyi játékot megnyitod, ha időközben elindult a szerver). A hálózati kontraktus (a POST teste, a szerver-oldali `localGameLogRoutes.ts`) változatlan — csak a kliens-oldali kézbesítési garancia lett erősebb. Elszigetelt (nem vitest, mivel a projektnek eddig nincs kliens-oldali unit-teszt precedense) logikai ellenőrzéssel igazolva: a várólista sorrendtartóan üríti magát sikeres küldéseknél, egy sikertelen küldésnél megáll (a korábbiakat nem veszíti el, a későbbieket nem próbálja meg előbb), és egy újbóli, sikeres flush a korábban leragadt bejegyzéseket is felküldi.

**Tizenhetedik kérés (2026-08-03) — újabb playtest-kör 4 hibával, plusz egy önállóan felfedezett, sokkal szélesebb architekturális hiba.**

**Első hiba — az építési terv és a telek-vásárlás modál gombjainak hiányzott a stílusa.** Mindkettő a generikus kék/szürke `Button` alapszínt mutatta a Hotel arany/sötét témája helyett. Ok: `HotelGamePage.tsx` (a teljes parti-képernyő gyökere) sosem hívta meg `useGameTheme('hotel')`-t — minden MÁS Hotel-oldal (setup, lobby, szabály-modál) igen, csak ez nem, így a `--shell-*` CSS-változók (amiket a megosztott `Button`/`Select` stb. olvas) sosem kerültek be a fába. **Javítás:** `themeClass = useGameTheme('hotel')`, alkalmazva mindkét gyökér `<div className={styles.page}>`-re. Ez önmagában megoldotta az építési terv panelt (nincs portálban), de a telek-vásárlás modál ÖNMAGÁBAN NEM javult — kiderült, hogy a `ui-kit/Modal` `document.body`-ra portálódik (lásd saját doksi-kommentjét), ami KÍVÜL esik a témázott gyökér DOM-részfáján, tehát a CSS custom property-k öröklődése nem ér el odáig. Minden Hotel-modál közös `hotelModalTheme.module.css`-e (`.hotelModal`) eddig csak háttér/szöveg-színt állított, `--shell-*`-et nem — ez a hiányzó láncszem, most pótolva ugyanazokkal az értékekkel, mint `hotelTheme.module.css`. Mivel ez a megosztott modál-wrapper, egyetlen helyen javítva minden Hotel-modál (vásárlás, játékos-infó, telek-adatlap) egyszerre profitál belőle.

**Második hiba — a Start mezőre érkezés automatikusan véget vetett a körnek, elveszítve egy ugyanabban a dobásban megszerzett lépcső-vásárlási jogot.** Ha egy dobás egyszerre lépte át a lépcső-vásárlási-jog sávot ÉS ért Start mezőre, a `staircasePurchaseRightActive: true` beállítás és az azt azonnal törlő `finishTurn()` (a régi "Start automatikusan véget vet a körnek" szabály) ugyanabban a reducer-hívásban futott le — a jog láthatatlanul elveszett, mielőtt a `turnPhase` valaha `RESOLVING_SPACE`-be jutott volna. Kérted: **"Egyáltalán ne legyen soha automatikus kör vége akció"** — a Start mostantól pontosan úgy viselkedik, mint bármelyik más, semmit nem kínáló mező: `RESOLVING_SPACE`-be kerül, a játékosnak a meglévő "Kör vége" gombbal KELL lezárnia a kört (mind `applyRollMoveDice`, mind `applyRollNights` érintett volt — utóbbiban ez holt kód volt, mert a Starton sosem lehet lépcső, de a szimmetria kedvéért ott is törölve). Az egyetlen továbbra is automatikus kör-lezárás a csőd (`forfeitPlayer`) — ez tudatosan MEGMARADT, mert egy csődbe ment játékosnak szó szerint nincs semmilyen elérhető akciója (a "Kör vége" gomb sem), tehát valakinek muszáj automatikusan továbbadnia a kört.

**Harmadik hiba — a `public/` mappába kerültek felesleges (fel nem használt) képek.** `public/assets/hotel/buildings/{Hotel}/IMG_*.jpg` (raw referenciafotók a 3D modellezéshez), `car/car-*.jpg` és `stairs/stairs-*.jpg` — mindhárom ~14MB — a `full-board.glb` (a mára KÉSZ, végleges 3D modell, épület/autó/lépcső geometriával együtt) megjelenése óta semmire nem hivatkozott a futó kód (grep-pel megerősítve). Ezek eredetileg a Hotel-0c.2 modellezési munkádhoz kerültek a `public/`-ba (5. szakasz, hogy bármelyik gépről elérhetők legyenek), de mostanra tisztán holt súly minden felhasználónak. **Javítás:** törölve a `public/`-ból (git rm), a `scripts/resize-hotel-images.mjs` már nem másolja be újra (a `buildings`/`car`/`stairs` source-target párok kivéve) — a nyers fotók változatlanul megvannak `assets/Hotel/raw-png/{buildings,car,stairs}/` alatt (gitignore-olt), ha egy jövőbeli modell-revízió mégis hivatkozna rájuk.

**Negyedik hiba — "eltűntek az animációk" (építés, pénzmozgás).** Ez két különálló okra bomlott:
- **Szűk eset:** ha egy `NIGHTS_STAY` bérleti díj TERHELÉS ugyanabban a dispatch-ban csődbe is juttatta a fizető játékost (nincs telke elárverezni), a `forfeitPlayer` azonnal továbblépteti a kört — mire React renderel, a `CashFlourishOverlay` már az ÚJ soron lévő játékos `playerId`-jét kapja, a régi töltő teljesítette a fizetést, de a lebegő "−összeg" sosem talál egyező `playerId`-t, és néma csendben elmarad. **Javítás:** a `StatusChip` most egy rövid ideig (a lebegő animáció élettartamáig, 1.2s) "kitartja" a kilépő játékos adatlapját, ha az ő nevükben történt a pénzmozgás, mielőtt átvált az új soron lévőre — így a flourish talál gazdát, mielőtt eltűnne a kártya, amin megjelenhetne.
- **Sokkal szélesebb, valódi gyökér-ok:** a `useNewItemsSince` hook (minden napló-vezérelt animáció — pénz-lebegtetés ÉS a telek-frissen-vásárolt szín-pulzálás — közös alapja) a saját `useRef`-jét KÖZVETLENÜL a render-törzsben módosította, nem egy effektben. React 18 StrictMode fejlesztői módban (`npm run dev`, ami alatt minden playteszt zajlik) egy komponens render-függvényét MINDEN valódi frissítéshez KÉTSZER hívja meg (az egyik eredményét eldobja) — az ELSŐ (eldobott) hívás már előreállította a `previousLengthRef`-et az új hosszra, így a MÁSODIK (valódi) hívás `items.length <= previousLength`-et lát, és `[]`-t ad vissza — MINDEN EGYES alkalommal, 100%-ban reprodukálhatóan. Élesben (production build, StrictMode nélkül) ez sosem jelentkezett volna, de dev módban (minden helyi playteszt) az ÖSSZES log-vezérelt animáció (nem csak a fenti szűk eset) némán, megbízhatóan elmaradt. **Megerősítve** egy gyors, ideiglenes StrictMode-kikapcsolással (a flourish azonnal, megbízhatóan megjelent), majd **javítva helyesen**: a ref-frissítés átkerült egy `useEffect`-be (React saját ajánlott mintája "tiszta render, mellékhatás effektben" elvhez) — StrictMode visszakapcsolva, élesben újra tesztelve, a flourish ismét megbízhatóan megjelenik. Az építés-pop-in animáció (tisztán mount-vezérelt, nem `useNewItemsSince`-alapú) ettől a hibától sosem volt érintett — külön, élő ellenőrzéssel megerősítve, hogy a telek-vásárlás/építkezés-folyam a maga egészében helyesen működik.

**Ötödik kérés — egységes, letisztult hibaoldal az egész projektben.** Eddig SEHOL nem volt kezelve egy nem létező URL vagy egy elkapatlan render/loader hiba — mindkettő a React Router saját, teljesen stílus nélküli alapértelmezett hibaképernyőjére futott ki; egy ismeretlen `gameId` (`GameLoader.tsx`) pedig egy csupasz, class nélküli `<p>Ismeretlen játék: ...</p>`-t mutatott. Új, játék-független `ErrorPage`/`RouteErrorPage` (`src/client/shell/ErrorPage.tsx`) — ugyanaz a semleges "shell" vizuális nyelv, mint a `HomePage`/`LoginPage`-é (mert egy router-szintű hiba játék-kontextus NÉLKÜL is történhet). Bekötve a router legfelső `errorElement`-jeként (lefedi a 404-et ÉS bármelyik útvonal dobott hibáját is), és lecserélve a `GameLoader` csupasz `<p>`-jét is ugyanerre a komponensre.

**Ellenőrizve:** `tsc --noEmit` (0 hiba), `eslint .` (0 hiba, csak a projektben megszokott komplexitás-warningok), teljes `vitest run` (301/301 zöld, 2 új/frissített `reducer.test.ts` teszt a Start-mező viselkedésére), élő Playwright ellenőrzés StrictMode BE állapotban: gomb-színek (arany, mindkét helyen), Start-mezőn átlépő lépcső-jog megmarad, telek-vásárlás/építkezés pénz-lebegtetés megbízhatóan megjelenik, 404-oldal és ismeretlen-játék oldal egyaránt a témázott `ErrorPage`-t mutatja.

Új/frissített tesztek: `reducer.test.ts` — a `FREE_BUILDING` teszt-blokk 3 tesztre bővült (garden-előbb-mint-épület elutasítva, garden felkínálva ha minden épület kész, tartalék-kifizetés csak a legdrágább főépület ára), az adósság-teszt kettévált (van saját telek → `AWAITING_DEBT_RESOLUTION`; nincs saját telek → azonnali `INSOLVENT` csőd). `npm run test:hotel`: 121/121 zöld. **Ellenőrizve:** `tsc` (kliens + szerver), `eslint` (teljes projekt, 0 hiba — a projektben már megszokott szintű komplexitás-figyelmeztetéseken felül új nem keletkezett), teljes `vitest run` (295/295).

**Tizennyolcadik kérés (2026-08-04) — az árverés mechanikájának teljes átdolgozása.** Kérted: (1) az árverező bármikor (nem csak csőd közelében) kijelölhesse az eladni kívánt saját telkét; (2) a többi játékos EGYMÁS UTÁN kapja meg a kört, szabadon beírható összeggel vagy passzal; (3) a legtöbbet ajánló nyer, mindenki passza esetén a bank; (4) a játék az árverező körében folytatódik. A régi mechanika ezzel szemben: árverés KIZÁRÓLAG fizetésképtelenség esetén indulhatott (`AWAITING_DEBT_RESOLUTION`), és a licitálás "bárki, bármikor" modellt követett — a tárcsa egyszerre mutatta MINDEN hátralévő licitáló "+100"/"Passz" gombját, fix 100-as lépésközzel.

- **`state.ts`**: `PendingAuction` új `currentBidderId: PlayerId` mezője — kinek a köre van most licitálni/passzolni.
- **`rules.ts`**: `canStartAuction`/`getAuctionableLots` kibővítve — a régi `AWAITING_DEBT_RESOLUTION`-ös (kényszerített) ág VÁLTOZATLANUL megmaradt, MELLÉ került a `RESOLVING_SPACE`-es (önkéntes, bármikor a saját körön) ág, mindkettő ugyanazt a `PendingAuction`/`AUCTION_IN_PROGRESS` gépezetet használja. `canPlaceBid`/`canPassBid` mostantól a `currentBidderId`-t (és — védekező, kétrétegű ellenőrzésként — a `passedPlayerIds`-t is) nézi, nem "bárki, aki még nem passzolt". A fix `BID_INCREMENT` (100) megszűnt: `getNextBidAmount` → `getMinimumBidAmount` = `highestBid + 1` — bármilyen, ennél nagyobb összeg érvényes.
- **`reducer.ts`**: `applyStartAuction` az induló `currentBidderId`-t a VALÓDI asztali ülésrend szerint számolja (`nextBidderInRotation`) — az árverező utáni következő szék, az árverezőt átugorva, a tábla végén visszafordulva az elejére. Ugyanez a függvény szolgálja a licitálás/passzolás UTÁNI következő-licitáló számítást is (`maybeResolveAuction`) — egyetlen helyen dől el, ki jön ezután. **Valódi hiba menet közben, élő teszt közben találva és javítva**: az első verzió `eligibleBidderIds(auctioneerId)[0]`-t használt kezdő licitálóként, ami az árverező SAJÁT székpozícióját figyelmen kívül hagyva mindig "az 1. játékos, kivéve ha ő az árverező" sorrendet adta — tehát ha a 2. játékos árverezett, tévesen az 1. (nem a 3.) játékos jött volna először, visszaugorva az asztal elejére ahelyett, hogy a következő székkel folytatná. Javítva: a rotáció a teljes `state.players` ülésrenden fut, csak az árverezőt/csődbe-mentet/már-passzoltat hagyja ki.
- **Kliens**: a tárcsa "Árverés" eleme mostantól `canStartAuction`-re épül (a saját körön bármikor elérhető, ha van eladható telek), a lot-választás a wheel-en marad (`auction-lots` szint, átnevezve a régi `debt-auction-lots`-ból). A tényleges licitálás viszont NEM fér már a tárcsa-szelet-rendszerbe (szabad szám kell, nem előre kattintható lista) — `AUCTION_IN_PROGRESS` alatt a teljes tárcsát felváltja egy új `AuctionBidPanel` (`PlayerActionWheel.tsx`): kiírja, ki jön, egy szám-mezőt (min. érvényes összeggel placeholder-ként) és "Licitál"/"Passzol" gombokat. Online multiplayer `interactive` gating (`isWheelInteractive`, `HotelGamePage.tsx`) frissítve — a régi "bárki hátralévő licitáló" ellenőrzés helyett a `currentBidderId`-t nézi.
- **AI** (`shared/games/hotel/ai/`): `actionEnumerator.ts`/`index.ts`/`simulate.ts` mind egyszerűsödött — a régi "válaszd az első hátralévő licitálót (önkényes, de konzisztens választás)" heurisztika helyett most a VALÓS, egyértelmű `pendingAuction.currentBidderId`-t olvassák — nem csak egyszerűbb, de pontosabban modellezi a valódi (immár tényleg szigorúan sorban álló) licitálást is. Az AI licitáló lépése továbbra is a minimális érvényes összeget (`highestBid + 1`) ajánlja fel — a szabad szám-beírás emberi kényelmi funkció, a keresésnek nem kell minden lehetséges összeget bejárnia.
- **Colyseus séma** (`HotelStateSchema.ts`/`hotelStateCodec.ts`): `AuctionSchema` új `currentBidderId: 'string'` mezője, szinkronizálva mindkét irányban — online multiplayer módban is helyesen működik az új, szigorúan sorban álló licitálás.

Új/frissített tesztek: `reducer.test.ts` — új `reducer — voluntary auction` blokk (önkéntes indítás `RESOLVING_SPACE`-ből pendingDebt nélkül, tulajdon-ellenőrzés, az árverező saját körben marad, szabad összeg elfogadása, a székrend-javítás regressziós tesztje nem-1. székes árverezővel), a régi kétjátékos-teszt frissítve (egyetlen licitáló licitje AZONNAL lezár, felesleges második `PASS_BID` eltávolítva). `rules.test.ts` — `canPlaceBid`/`canPassBid` blokk kiegészítve a sorrenden-kívüli-akció elutasításával. `selectors.test.ts` — új teszt az önkéntes `canStartAuction`-re és a telek nélküli játékos zsákutca-védelmére (ugyanaz az elv, mint a 2026-07-31-i debt-auction javításnál). `npm run test:hotel`: 129/129 zöld.

**Ellenőrizve:** `tsc --noEmit` (0 hiba), `eslint .` (0 hiba, csak megszokott komplexitás-warningok), teljes `vitest run` (309/309 zöld), élő Playwright ellenőrzés 3 fős hot-seat parti végig: telek vásárlás közvetlenül utána önkéntes árverés indítása (nem csőd-közeli állapotban), szabad szám beírásával licit (600), a kör helyesen halad tovább a következő licitálóra, mindenki passza után a legmagasabb licitáló nyer (a lot tulajdonjoga és a pénz is helyesen mozog), az árverező a saját körében marad (a tárcsa visszaáll a normál gyökér-menüre), és a telek nélküli játékosnál az "Árverés" helyesen inaktív.
