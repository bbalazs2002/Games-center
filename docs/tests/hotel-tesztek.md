# Hotel — tesztek

Futtatás: `npm run test:hotel` (129 teszt, 4 fájl). Lásd [README.md](./README.md) az általános konvenciókért.

## `src/shared/games/hotel/engine/rules.test.ts` (50 teszt)

A tiszta predikátumok/segédfüggvények — a reducer és a `getValidActions` selector (és később a Hotel-0d AI) is ezekre épül, egyik sem duplikálja a szabály-logikát.

- **`resolveLandingPosition`** (5) — normál landolás szabad mezőn; tovább-tolás egy (majd több egymást követő) foglalt mezőn át; a Start mostantól normál mező (csak a parkoló kivétel); csődbe ment játékosokat a foglaltsági vizsgálat figyelmen kívül hagy.
- **`crossedLanes`** (3) — sáv-átlépés érzékelése lépés közben; nem jelez sávot, amit a lépés nem is ér el; kezeli a tábla végén való átfordulást.
- **`computeNightlyRent`** (2) — az épületszám-sort használja; kert esetén a kert-sort használja a `buildingsBuilt` sor helyett.
- **`computeConstructionCost`** (2) — csak az újonnan épített épületeket összegzi, a már meglévőket nem; hozzáadja a kert árát, ha az is szerepel a tervben.
- **`computeHotelValue` / `computeAuctionOpeningBid`** (1) — a specifikáció-példa: 500 telek + 1000 épület → a bank 750-et ajánl nyitóként.
- **`canForceBuyFromOwner` / `computeLotPurchasePrice`** (3) — egy beépítetlen, játékos-tulajdonú telek féláron kikényszeríthető; egy beépített NEM kényszeríthető ki; egy bank-tulajdonú telek `lotPrice`-t használ, hacsak nincs `bankBuybackPrice`-a (korábbi árverésből).
- **`getNextConstructionStep`** (4) — a következő lépés mindig épület, amíg van hátra; figyelembe veszi az ugyanebben a munkamenetben már kiválasztott épületeket; a kertet csak minden épület megléte után ajánlja fel; `null`-t ad, ha nincs több hozzáadható.
- **`isValidConstructionPlan`** (4) — elfogad egy csak-épületet hozzáadó tervet; elfogad egy olyat, ami egy lépésben fejezi be az összes épületet ÉS hozzáadja a kertet; elutasítja, ha a terv a kertet az épületek befejezése előtt kérné; elutasítja a no-op tételt (se épület, se kert).
- **`isGardenOnlyPlan` / `canBuildWithoutPermit`** (4) — csak akkor igaz, ha minden tétel kizárólag kertet kér, épületet nem; engedélyezi a kockamentes kertépítést, ha minden épület már fel van építve; elutasítja, ha a terv épületet is tartalmaz (az még mindig a kockás utat igényli); elutasítja Építkezés-mezőn kívül/`RESOLVING_SPACE` fázison kívül.
- **`canBuyLot` / `canStartConstruction`** (2) — hamis Vásárlás-mezőn kívül, igaz egy vehető telekkel álló Vásárlás-mezőn; hamis, ha az adott körre már le van zárva az építkezés, még eligible telek esetén is.
- **`canBuyStaircaseRight`** (7) — a mező-választásos lépcsővásárlás minden szabálya: jog nem aktív → hamis még saját telken is; aktív jog → igaz bármely, a telekkel szomszédos mezőre; hamis nem-szomszédos mezőre; hamis már-foglalt mezőre; hamis nem saját telekre; hamis, ha az adott telekre ebben a körben már vásároltunk; hamis, ha nincs elég pénz.
- **`getFreeStaircaseCandidates` / `canChooseFreeStaircaseSpace`** (5) — az összes (telek, mező) jelölt-pár listázása minden saját telekhez; üres lista telek nélküli játékosnál; kizár egy telket, aminek nincs több szabad szomszédos mezője; a választás csak `AWAITING_FREE_STAIRCASE_CHOICE` fázisban engedélyezett; elutasítja nem saját telekre.
- **`canPlaceBid` / `canPassBid`** (13 — a fájl végén, számozatlan összesítésben) — licit csak magasabb és megfizethető összegre; az árverező nem licitálhat sajátjára; már passzolt licitáló nem léphet újra; **a licitálás szigorúan sorban áll (2026-08-04): egy jogosult, de még soron nem lévő licitáló akciója elutasítva, akkor is, ha még nem passzolt** (részletek az árverés-fejezet reducer-tesztjeinél is, lásd lent).

## `src/shared/games/hotel/engine/selectors.test.ts` (8 teszt)

`getValidActions(state)` — az egyetlen hely, amiből a UI (és később az AI) megtudja, mi engedélyezett éppen most; minden mező egy-egy fenti `rules.ts` predikátumra épül.

- Lefedi a dobható kockát, vehető telkeket, építkezési opciókat (áraikkal), lépcső-jogosultságot, árverés/licit állapotot (beleértve az önkéntes, `RESOLVING_SPACE`-ből induló árverést és a telek nélküli játékos zsákutca-védelmét, 2026-08-04), feladás/kör-vég lehetőségét.

## `src/shared/games/hotel/engine/reducer.test.ts` (67 teszt)

A `(state, action) → newState` reducer maga — minden action-típushoz legalább egy happy-path és a releváns elutasítási esetek.

- **`createInitialState`** (1) — mindkét játékos a parkolóban indul, egyenlő készpénzzel, 1. játékos kezd.
- **`ROLL_MOVE_DICE`** (8) — lépés + `RESOLVING_SPACE` Vásárlás-mezőn; "2000" sáv azonnali kifizetése; Start-ra lépés SOSEM automatikus kör-vég (`RESOLVING_SPACE`-be kerül, a "Kör vége" gombbal kell lezárni — 2026-08-03-i javítás), plusz egy regressziós teszt arra, hogy egy Start-ra érkező, ugyanabban a dobásban lépcső-jogot is szerző dobás a jogot megtartja; no-op `AWAITING_ROLL`-on kívül; tovább-tolás foglalt mezőn; a tovább-tolás alatt átlépett sáv is kiváltja a hatását.
- **`BUY_LOT`** (4) — bank-tulajdonú telek teljes áron; nem-szomszédos telek figyelmen kívül hagyva; beépítetlen telek féláron kikényszerítve másik játékostól; beépített telek NEM vehető ki kényszerrel.
- **Építkezés + engedély-kocka** (5) — ZÖLD a tervezett módon épít, teljes áron; INGYEN (H) épít, díjmentesen; DUPLA duplán számláz; PIROS blokkolja a tervet és lezárja a további építkezést a körre; a motor (nem csak a UI) elutasítja, ha a terv a kertet az épületek előtt kérné.
- **`BUILD_WITHOUT_PERMIT`** (3, új) — kockamentes kertépítés teljes áron, ha minden épület már fel van építve; elutasítás, ha a terv épületet is tartalmaz; a kockás út továbbra is elérhető ugyanarra a helyzetre.
- **Ingyen mezők** (8) — INGYEN LÉPCSŐ: 100 fix kifizetés telek nélkül; jogosult telekkel `AWAITING_FREE_STAIRCASE_CHOICE`-ra vár, nem automatizál; kifizeti a legmagasabb lépcsőárat, ha nincs több hely; `CHOOSE_FREE_STAIRCASE_SPACE` lezárja a választást / elutasít nem-szomszédos mezőt / no-op fázison kívül; a jutalom nem vehető fel újra ismételt dobással; INGYEN ÉPÜLET nem csinál semmit telek nélküli játékosnál.
- **Lépcső-bérleti díj (éjszakák)** (3) — vendég fizet, tulajdonos kap; saját szállodában nincs bérleti díj; fedezethiány `AWAITING_DEBT_RESOLUTION`-t indít, nem megy negatívba.
- **`BUY_STAIRCASE_RIGHT`** (6) — a kiválasztott mezőre helyezi a lépcsőt, felszámítja az árat; no-op ha a jog nem aktív / nem saját telek / már vásárolt ebben a körben / nincs elég pénz / a mező nem szomszédos.
- **Adósság-rendezés árveréssel** (2) — az árverési bevétel automatikusan törleszti az adósságot; magasabb licit új tulajdonoshoz viszi a telket (2 fős játékban egyetlen licit AZONNAL lezár, felesleges follow-up `PASS_BID` nélkül).
- **Árverés-szélsőértékek** (6, kifejezetten 4 fős játékkal — 2 főnél egyetlen passz mindig lezárná az árverést, ez a blokk pont az ez-alatti ágakat fedi) — nyitva marad, amíg 1-nél több jogosult licitáló van hátra; lezárul az utolsó előtti passznál; az árverező nem licitálhat sajátjára; a licitnek meg kell haladnia a jelenlegi legmagasabbat; licitáló nem léphet a pénzénél nagyobbat; már passzolt licitáló nem léphet újra.
- **Önkéntes árverés** (5, új, 2026-08-04) — indítható `RESOLVING_SPACE`-ből pendingDebt nélkül is; elutasítva nem saját telekre; az árverező a SAJÁT körében marad a lezárás után (nem adja át a kört); bármilyen, a legmagasabb licitet szigorúan meghaladó összeg elfogadott (nincs fix lépésköz); regressziós teszt a székrend-hibára — a licitálás a VALÓDI ülésrend szerint az árverező utáni székkel kezdődik, nem mindig "az 1. játékossal, ha ő nem az árverező".
- **Feladás és győzelem** (1) — feladáskor minden telek a bankhoz kerül, a játékos csődbe megy, és ha csak 1 nem-csődbe-ment játékos marad, vége a játéknak.
- **`END_TURN`** (1) — a következő nem-csődbe-ment játékosra lép, a köri mezőket visszaállítja.
- **Napló** (6) — üresen indul, `MOVED` az első dobásnál; `BONUS_2000` a `MOVED` mellett sáv-átlépéskor; elutasított/no-op action nem naplóz; `LOT_BOUGHT` a tényleges árral; `CONSTRUCTION_PERMIT_ROLLED` a feloldott (duplázott) összköltséggel; `GAME_WON` a játék végén.
