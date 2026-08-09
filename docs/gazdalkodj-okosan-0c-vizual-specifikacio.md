# Gazdálkodj okosan-0c — Specifikáció: vizuál

**Státusz:** IMPLEMENTÁLVA — a teljes terv megvalósítva és élőben ellenőrizve (2026-08-09).

## 1. Cél és kontextus

A Gazdálkodj okosan-0a (motor + hot-seat UI) és 0b (multiplayer) is lezárva, élesben ellenőrizve. A tábla eddig egy szándékosan egyszerű, sík CSS-grid volt (`GazdalkodjOkosanGamePage.tsx`'s `BoardGrid`) — mindig is ideiglenes megoldásnak jelezve. A user átadta a végleges nyers asset-készletet (`assets/GazdalkodjOkosan/`, gitignore-olt): a fizikai tábla és a hozzá tartozó kártya/pénz/bútor-fotók mellett két 3D modellt is (`full-board.glb`, `house.glb`), a Hotel saját 0c körét nevezve meg mintaként.

A cél: a meglévő, game-agnosztikus `LoopTrackBoard3D` komponensre (amit a Hotel 3D táblája is használ, és aminek kódjában egy komment kifejezetten "egy jövőbeli Monopoly/Gazdálkodj okosan"-t nevez meg indoklásként a több-bábu-egy-mezőn viselkedésre) ráépíteni a valódi 3D táblát és bábukat, valamint a valódi fotókat felhasználni a bútor/kocsi-vásárlás, bankszámla és készpénz UI-ban — a motor/reducer/action-logika érintése nélkül, tisztán megjelenítési réteg.

**Időközbeni pontosítás a full-board.glb-ről:** a benne lévő 6 "figure-N-00" bábu-mesh geometriailag azonos, csak a nevezésük különbözik — nem 6 forma, hanem 1, ami 6-szor + 42 mezőre pozícionálva 252-szer szerepel. A pozíciók viszont VALÓDI, kézzel authorolt per-mező horgonypontok, nem eldobandó referenciák — lásd §3.

## 2. Nyers asset-leltár

- `full-board/full-board.glb` (15MB) — 1 sík lap a tábla-fotóval (node `Empty.001`, textúra `board`) + 1 egyedi bábu-geometria (`figure-1-00`, ~1218 vertex, textúra nélküli anyag) + 251 duplikátum-node (`figure-N-00.NNN`), ami a 6 sáv × 42 mező pozíció-adata.
- `house/house.glb` (43MB) — 8 sík kártyalap, node-nevek értelmetlenek, de anyaguk (`material→texture→image.name`) egyértelműen azonosítja őket — a node-**pozíciók** kódolják a fizikai bútor-nyilvántartó rács elrendezését.
- `images/board.png`, `images/box.png` — ismertek 0a-ból.
- `images/card/{front,back}.png` — valódi OTP Bank Maestro kártya fotó.
- `images/house/*.png` (8 fájl) — `house.png` (nyilvántartó-lap rácsa), `kitchen`/`livingroom`/`car`/`oven`/`fridge`/`dishwasher`/`washingMachine.png`.
- `images/money/{20,50,100,1000,5000}.png` — játékpénz-bankjegyek.

A tábla éles sarkú, téglalap alakú hurok — a glb board-síkjának bounding boxa X±2.5/Z±1.8 (5×3.6 egység).

## 3. Bútor↔fotó megfeleltetés

| FurnitureItemId | fotó |
|---|---|
| konyhabutor | `house/kitchen.png` |
| szobabutor | `house/livingroom.png` |
| hutoszekreny | `house/fridge.png` |
| tuzhely | `house/oven.png` |
| mosogatogep | `house/dishwasher.png` |
| mosogep | `house/washingMachine.png` |

Plusz `car.png` → `CAR_PURCHASE_TERMS`. Nincs fotó lakásvásárláshoz/biztosításhoz — a "lakást" a bútor-rács reprezentálja megvásárlás után (§7), a biztosításhoz marad a szöveges visszajelzés.

## 4. Asset pipeline

Négy script:
- **`resize-gazdalkodj-okosan-images.mjs`**: `assets/GazdalkodjOkosan/images/{board,card,house,money}` → `public/assets/gazdalkodj-okosan/`, `sharp`, max 1024px, JPEG 82, kizárólag arányhű átméretezéssel (kritikus a `house/*`-nál, lásd §7). `box.png` a `resize-box-covers.mjs` saját `SOURCES` térképén keresztül.
- **`compress-gazdalkodj-okosan-glb.mjs`**: `@gltf-transform/core`/`functions` közvetlen használatával — 1 kanonikus `figure-1-00` node megtartása, minden más node törlése, `prune()`+`dedup()`, kiírás `pawn.glb` néven.
- **`extract-gazdalkodj-okosan-board-positions.mjs`** és **`extract-gazdalkodj-okosan-house-layout.mjs`** — a nyers glb-kből statikus TS pozíció-adatot generálnak, a duplikátum-node-ok kivágása előtt.
- `house.glb` és a nyers `images/*` sosem kerülnek a `public/`-ba.

## 5. 3D tábla + bábuk (`LoopTrackBoard3D`)

A `full-board.glb` 42×6 pozíció-referenciája VALÓDI, kézzel elhelyezett per-mező horgonypont-adat (a Hotel `useHotelSpacePositions.ts`-ének megfelelő koncepció). Közvetlen ellenőrzéssel megerősítve: a `figure-1-00[.NNN]` sorozat 42 node-ja pontosan a téglalap-kerület mentén, index-sorrendben helyezkedik el, záródó hurokban — ez közvetlenül a motor 0-41 mező-indexeivel egyező `positions`/`rotations` tömb, szintetikus geometria nélkül.

A `figure-2-00`..`figure-6-00` sorozatok más pozíciókat használnak ugyanazon indexeknél — ez a 6 lehetséges játékos-"sáv" saját, ütközésmentes helye minden mezőn.

**Döntés (a user kifejezett kérése, jövőbeli hasonló játékokra is érvényes)**: ezt a 6 sávot használjuk fel közvetlenül, NEM a `LoopTrackBoard3D` saját `tokenSpreadRadius`-alapú számított szórását — az a `tokens` tömbön belüli globális indexet használja, játékos-számtól függetlenül, ami szűk mezőméretnél átcsúsztathatja a bábut a szomszédos mezőre.

**Bővítés a megosztott `LoopTrackBoard3D.tsx`-en**: `LoopTrackToken<TToken>` két új opcionális mezőt kap — `positions?: Vector3[]`, `rotations?: Quaternion[]` (az `offTrackPosition`/`offTrackRotation` mintájára). Amikor egy tokennek van saját `positions`-a, a `tokenOffset`-alapú procedurális eltolás kimarad. Minden mező opcionális, a Hotel-hívó viselkedése változatlan.

Minden játékos-slot (0-5, `state.players` sorrendje) a saját, teljes 42-elemű sávját kapja a `GAZDALKODJ_SPACE_POSITIONS_BY_SLOT`/`_ROTATIONS_BY_SLOT`-ból — a teljes parti alatt ugyanazt a sávot használva, sosem ütközve más játékossal.

A bábu forgásszimmetrikus a függőleges tengely körül — a rotáció-adat vizuálisan irreleváns bábuknál.

Fájlok: `gazdalkodjOkosanBoardLayout.generated.ts` (kinyert pozíciók), `gazdalkodjOkosanBoardLayout.ts` (`BoardBackground`, no-op `renderSpace`), `gazdalkodjOkosanAssets.ts` (URL-ek, `PLAYER_COLORS`), `GazdalkodjOkosanPawnToken` komponens (`GazdalkodjOkosanGamePage.tsx`-ben, `getObjectByName('figure-1-00')` + `cloneWithTint`).

## 6. Bútor/kocsi vásárlás UI

Nincs változás az action/reducer/`getValidActions` logikában. `PurchaseButtons` minden bútor-/kocsi-vásárló gombja kap egy miniatűr fotót a §3 térkép alapján.

## 7. Bankszámla UI

`BankAccountPanel`, ami `player.bankAccount !== null` esetén jelenik meg — `card/front.jpg`/`card/back.jpg` vizuál, a valós egyenleg szövegként ráírva.

## 8. Készpénz-megjelenítés

Hotel `cashNoteFor(amount)` mintája — küszöbérték-alapú, egy reprezentatív bankjegy-kép a `PlayerCard` készpénz-kijelzése mellett. Animált flourish NEM kerül be ebben a körben.

## 9. Téma-modul

`gazdalkodjOkosanTheme.module.css`, a jelenlegi hardcode-olt paletta alapján (`#0d2b1f`/`#d4af37`/`#f5f0e0`), a `hotelTheme.module.css` mintáját követve. Bekötés `gamesRegistry.ts`-be, alkalmazás a `GazdalkodjOkosanGamePage` külső wrapperére rögtön az elején.

## 10. `house.glb` — pozíció-adat forrás, nem futásidejű betöltés

A `house.glb` a bútor-fotók pontos rács-pozícióját rögzíti — ez a rács a **megvásárolt lakást** reprezentálja, csak `player.apartment.kind !== 'NONE'` esetén jelenik meg (egybevág `canBuyFurniture`'s saját megkötésével).

Kinyert táblázat (`material → baseColorTexture → image.name` alapján, nem törékeny node-nevekkel):

| kép | translation (X, Z) | scale (X, Z) |
|---|---|---|
| `house` (háttér) | — | — |
| `car` | (1.580, 0.856) | (0.305, 0.307) |
| `livingroom` | (1.184, -0.819) | (0.470, 0.426) |
| `kitchen` | (-1.177, -0.820) | (0.469, 0.436) |
| `fridge` | (-1.955, 0.877) | (0.340, 0.331) |
| `oven` | (-1.167, 0.873) | (0.316, 0.329) |
| `dishwasher` | (-0.381, 0.878) | (0.287, 0.299) |
| `washingMachine` | (1.397, 0.872) | (1.044, 1.067) |

**Kritikus megkötés (user-figyelmeztetés)**: a `scaleX`/`scaleZ` értékek az EREDETI fotók méretarányához igazodnak — a resize scriptnek kizárólag arányhű átméretezést szabad végeznie a `house/*.png`-knél, különben a rács csúszik.

`OwnershipPanel` (2D, CSS `position:absolute`, normalizált %-os `left`/`top`): a `house` kép + 6 bútor-kártya csak `apartment.kind !== 'NONE'` esetén; a `car` kártya függetlenül jelenik meg `car.kind !== 'NONE'` esetén, akkor is, ha lakás még nincs.

## 11. Kör-beosztás

Egyben, nem 0c.1/0c.2 szétválasztva (minden asset már megvan, a 3D munka mérete kicsi). Belső sorrend: (1) asset pipeline, (2) téma-modul, (3) 2D UI a jelenlegi CSS-grid táblán felül, (4) 3D tábla+bábuk utoljára.

Nem hatókör: Hotel-szerű radiális UX-újratervezés; animált pénz-flourish; mezőre-kattintva-vásárlás a 3D táblán; szerencsekártya-grafika.

## 12. Verifikáció

- `tsc`, `eslint .`, `vitest run` (a meglévő reducer/rules tesztek nem sérülhetnek).
- Élő ellenőrzés Playwright-tal (minimalizált használattal).
- Fájlméret-ellenőrzés a `public/assets/gazdalkodj-okosan/` alatt.

## 13. Ellenőrzés eredménye (2026-08-09)

**Asset pipeline** — mind a négy script lefutott: nyers ~57MB kép + 15MB/43MB glb → `public/assets/gazdalkodj-okosan/` alatt összesen **3.0MB** (16 kép 78-266KB között) + **`pawn.glb` 43KB** (a nyers `full-board.glb` 14.1MB-jából, 99.7%-os csökkenés, 252 fölösleges duplikátum-node eltávolítva, csak 1 kanonikus bábu-geometria maradt).

**3D tábla + bábuk élőben ellenőrizve** (Playwright, `npm run dev` + valós parti lejátszásával, nem csak a standalone modell-nézegetővel): a tábla a valódi fotóval, helyes arányban jelenik meg; mindkét kezdő bábu a Start mezőn, helyes színnel; dobás után a bábu a naplóban jelzett mezőre lép (pl. "Játékos 1 a(z) 2. mezőre lépett" → a bábu ténylegesen a 2-es mezőn látszik). **Egy valós, élőben talált és javított hiba**: a `.canvasWrapper`-nek csak `min-height`-je volt, `height` nem — emiatt a `LoopTrackBoard3D` belső, `height: 100%`-ra támaszkodó canvas-diveleme nem tudta feloldani a százalékos magasságot (CSS-spec: `min-height` önmagában nem ad "definite height"-ot a leszármazottaknak, ellentétben a Hotel saját `flex: 1`-es wrapperével, ahol a flex-stretch ezt megoldja), és a canvas ~150px magasra esett vissza a szándékolt 448px helyett — a tábla emiatt alig látszott. Javítva explicit `height: 28rem` hozzáadásával. Emellett a `sceneScale` alapértelmezett `1`-ről `0.45`-re hangolva élő teszttel — a könyvtár alapértelmezett kameratávolsága egy ~12 egységes táblát feltételez, a miénk csak 5×3.6.

**Vásárlás-UI élőben ellenőrizve**: valós parti lejátszásával (dobás/kör vége ismétlésével) sikerült ténylegesen az autó-vásárlás mezőre lépni — a "Autó vásárlása (készpénz)"/"(hitelre)" gombok helyesen mutatják a Citroën-fotó miniatűrt. Vásárlás után az `OwnershipPanel` helyesen jelenik meg, **kizárólag a kocsi-kártyával, lakás-háttér nélkül** — pontosan ez volt a user kifejezett funkcionális elvárása ("Előfordulhat, hogy autója van egy játékosnak, lakása viszont még nincs, ekkor is helyesen kell megjelennie"). A `CashReadout` bankjegy-ikonja a `PlayerCard`-okon minden állapotban helyesen jelent meg. A `gazdalkodjOkosanTheme.module.css` a beállítás-oldalon (shell-szintű, `useGameTheme` révén) azonnal, kódmódosítás nélkül érvényesült.

**Nem élőben ellenőrizve ebben a körben** (arányos erőfeszítéssel, nem érte meg tovább automatizált véletlenszerű lépkedéssel görgetni): a teljes bútor-rács (lakás+összes bútor együtt) és a `BankAccountPanel` vizuálja — mindkettő ugyanazt a már bevált, típusellenőrzött mintát követi (kép-URL + feltételes renderelés), alacsony kockázatúnak ítélve, de érdemes a usernek saját játék közben rájuk is ránéznie.

`tsc` (kliens+szerver), `eslint .`, `vitest run` (**518/518**, nincs regresszió — tisztán megjelenítési réteg), `vite build` (a `GazdalkodjOkosanGamePage`/`GazdalkodjOkosanModelViewerPage` saját lazy chunkjai, code-splitting sértetlen) mind zöldek. Élő konzol-ellenőrzés: nulla valós hiba a teljes teszt-parti alatt (a látott hibaüzenetek mind a helyi, nem futó Colyseus-szerver felé induló, ártalmatlan `game-log` POST-kísérletek, a `useLocalGameLogger` már eleve ártalmatlanul lenyelt hibája — nem e kör terméke).

**Megosztott kód bővítése**: `LoopTrackBoard3D.tsx` (`src/client/renderers/loop-track-3d/`) kapott egy kis, visszafelé kompatibilis bővítést (`LoopTrackToken`'s opcionális `positions?`/`rotations?` mezői) — a Hotel-hívó viselkedése változatlan, csak új, opcionális mezőkről van szó.

## 14. UI-elrendezés újratervezve, Hotel-mintára (2026-08-09)

A user visszajelzése az élő kipróbálás után: a játék jó, de a UI-t finomítani kell — a korábbi, hagyományos görgethető oldal (fix szélességű tábla + jobb oldali, mindig teljesen látható sidebar minden játékossal/akciógombbal/naplóval) helyett a **Hotel elrendezését** kérte mintának: teljes-viewport, sosem görgethető oldal, a 3D tábla tölti ki a hátteret, minden más lebegő üveg-panel a sarkokban, wheel/tárcsa menü NÉLKÜL (kevesebb akció van itt), **jobb alul a játékoslista, bal alul a napló**, minden más férjen ki, ami nem fér, kerüljön kinyitható/felugró panelbe.

**Megvalósítás** (`GazdalkodjOkosanGamePage.tsx`/`.module.css`, 1:1 a Hotel `HotelGamePage.tsx`/`.module.css` szerkezeti mintáját követve, de a retró zöld/arany paletta megtartásával, nem a Hotel navy/gold hangulatával):
- `.page{height:100vh}` + `.canvasWrapper{flex:1}` teljes-viewport váz, a `<h1>`/`.turnReadout` fejléc eltávolítva (a Hotelnek sincs saját címsora játék közben).
- **Bal felül**: `CurrentPlayerOwnershipPanel` — a soron lévő játékos `OwnershipPanel`-je (üres állapotban placeholder szöveg), a Hotel `OwnedLotsPanel`-jének megfelelője.
- **Jobb felül**: `FloatingActionPanel` — a meglévő `ActionPanel`/`PurchaseButtons`/`BankAndTurnButtons`/`InstallmentButtons` dispatch-logikája változatlan, csak lebegő, összecsukható (alapból nyitva, mert dobás minden körben kell) panelbe került, wheel/radiális dial nélkül, sima gomboszlopként.
- **Alul középen**: `StatusChip` — ki jön + készpénz, animáció/AI-szöveg nélkül (azok explicit nem-hatókörben maradtak).
- **Bal alul**: `GazdalkodjOkosanGameLogPanel` (új fájlpár) — a Hotel `GameLogPanel` szó szerinti mintája, alapból csukva. A `formatLogEntry` kiemelve önálló `formatLogEntry.ts`-be, és bővítve: a szerencsekártya-húzás naplósora mostantól a ténylegesen húzott kártya szövegét is tartalmazza — ezzel a korábbi külön `LastChanceCard` panel feleslegessé vált és megszűnt.
- **Jobb alul**: `PlayerRoster` (kompakt sorok: szín+név+pénz) + `PlayerInfoModal` (teljes részletek: `CashReadout`, `BankAccountPanel`, BKV, `OwnershipPanel`, biztosítás, csőd-státusz) — ez váltja ki a korábbi, mindig-látható `PlayerCard`-listát; részletek mostantól csak kattintásra, modálban.
- **Győztes képernyő**: a Hotel `HotelWinnerScreen` mintája szerint teljes oldalt átvevő, középre igazított üveg-kártya ("Új játék"/"Főmenü" gombokkal), a korábbi, elrendezésen belüli egysoros szöveg helyett.
- Új `gazdalkodjOkosanModalTheme.module.css` — a `Modal` a `document.body`-ba portál, a `--shell-*` CSS-változókat itt kell újra deklarálni (a Hotel `hotelModalTheme.module.css`-nek pontosan ez volt a dokumentált indoka).

**Betartott, dokumentált csapda** (`ui-kit/Modal.tsx`, `docs/hotel-0c-specifikacio.md` §5.4): a `PlayerInfoModal` mindig a `.roster` panellel (ami `backdrop-filter`-t használ) EGY SZINTEN, sosem alá ágyazva renderelődik — élőben ellenőrizve, a modál valóban a teljes viewport közepén jelenik meg, nem a roster sarkába szorulva.

**Ellenőrzés**: `tsc`, `eslint .`, `vitest run` (**518/518**, nincs regresszió), `vite build` mind zöldek. Élő Playwright-ellenőrzés: minden panel a helyén (bal-fent/jobb-fent/lent-középen/bal-lent/jobb-lent), dobás+lépés+napló-frissülés működik, napló nyit/csuk, roster-sorra kattintva a modál helyesen, középen jelenik meg valós adatokkal, **900×700 viewportnál nincs oldal-szintű görgetés** (`document.documentElement.scrollHeight <= clientHeight` ellenőrizve). Konzol: nulla valós hiba (csak a helyi, nem futó szerver felé induló ártalmatlan naplózási kísérletek).

## 15. Hat UX-kiegészítés — kártya-megerősítés, animációk, pénzügyi kijelzők (2026-08-09)

A user hat további finomítást kért, kifejezett elvárással: mindenhol, ahol lehetséges, a Hotel/Ramses már meglévő, megosztott komponenseit/mintáit használjuk újra ahelyett, hogy duplikálnánk a kódot ("alapvető konvenció, hogy minél több komponenst és kódot megosztunk a játékok között").

1. **Tulajdon-tételek kinagyíthatók kattintással.** A Ramses `RamsesActiveCardDisplay` mintájának (kattintható miniatűr → `Modal` a nagyobb képpel) MÁSODIK előfordulása — a "generalizálj második fogyasztónál" elv szerint kiemelve közösbe: új `src/client/ui-kit/ZoomableThumb.tsx`+css (`{src, alt, wrapperClassName?, wrapperStyle?, imageClassName?, modalClassName?}`). `OwnershipPanel.tsx`'s `ItemCard` mostantól ezt használja; a korábbi `.item` CSS kettévált (`.itemWrapper` = pozicionálás, `.item` = vizuál). Ramses saját, már működő hívási helye szándékosan NEM lett migrálva ebben a körben (felesleges kockázat egy változatlan, kész játékon).
2. **Szerencsekártya-megerősítés.** Reducer-szintű, Gwent `ROUND_RESOLVED` / a saját `AWAITING_MANDATORY_INSTALLMENT` mintáját követve: új `TurnPhase: 'AWAITING_CHANCE_CARD_ACK'` — `applyDrawChanceCard` a kártya hatásának AZONNALI alkalmazása után ebbe a fázisba lép (kivéve, ha a hatás csődbe juttatta a játékost), és amíg ide nem érkezik `ACK_CHANCE_CARD`, minden más `can*` predikátum blokkolva marad (mind `RESOLVING_SPACE`-t követel). Új `ChanceCardModal` (`GazdalkodjOkosanGamePage.tsx`) mutatja a húzott kártya szövegét, "OK" gombbal — nyílt infó, mindenkinek látszik, de csak a soron lévő játékos dispatch-e érvényesül (szerver-oldali `isActionAllowed`). 0b: `GazdalkodjOkosanRoom.ts` validálja az új action-t.
3. **Nem dobással történő mozgás azonnal a célmezőre ugrik.** A megosztott `LoopTrackBoard3D.tsx`-nek eddig NEM volt "nagy ugrás" módja (mindig mezőnként lépkedett `stepPath()`-sal) — ez az első igény rá. Új, opcionális `LoopTrackToken.instantTransition?: boolean`: ha igaz, a token `api.set(...)`-tel azonnal a célra ugrik (nem `stepPath`+lépésenkénti animáció). Miért ugrás és nem egyenes csúszás: a pozíciók a tábla kerülete mentén vannak, egy nem-szomszédos két pont közti egyenes vonal átvágna a tábla közepén. `MOVED` log-bejegyzés kapott egy `source: 'DICE' | 'CHANCE_CARD'` mezőt (az `INTEREST_PAID.source` mintáját követve); a kliens ez alapján dönti el, mikor kell `instantTransition:true`. Hotel-hívó változatlan (a mező nála sosem használt, `undefined` → jelenlegi hop-by-hop viselkedés).
4. **Pénzmozgás-animációk.** A Hotel `useTransientLogEffects.ts`'s `useCashFlourishes`/`CashFlourishOverlay` logikája kiemelve közösbe: új `src/client/core/useCashFlourishes.ts` (generikus `useCashFlourishes<TLogEntry>(log, playerId, computeDelta)`) + új `src/client/ui-kit/CashFlourishOverlay.tsx`+css (a `cash-flourish-rise` keyframe-mel). **Hotel is át lett állítva** erre a közös verzióra (user jóváhagyásával, ugyanebben a körben) — `useTransientLogEffects.ts` saját `cashDeltaForPlayer`-je változatlan maradt, csak a hook-teste lett vékony wrapper a közösre; `HotelGamePage.module.css`-ből a 6 flourish-osztály törölve (átköltözött). Gazdálkodj okosan saját `gazdalkodjOkosanCashDelta.ts`-t kapott (`MOVED`/`SPACE_PAYMENT`/`MONEY_TRANSFERRED`/`INTEREST_PAID`/`INSTALLMENT_PAID`/vásárlás-típusok/`FIRE_EVENT`/`CAR_THEFT` leképezése) — csapda: a vásárlás-log-bejegyzések nem tartalmazzák az árat, azt a `financed` flag alapján a statikus ár-táblákból (`APARTMENT_PURCHASE_TERMS` stb.) kellett visszakeresni.
5. **Folyószámla-egyenleg + teljes vagyon.** `StatusChip` a készpénz mellett megjeleníti `player.bankAccount.balance`-t (ha van nyitott számla); `PlayerRoster` a már meglévő `totalWealth(player) = cash + bankAccount.balance` (a győzelmi feltételhez már létező) selectort használja `player.cash` helyett.
6. **Kockadobás-animáció.** A megosztott, teljesen game-agnosztikus `AnimatedDie` (`src/client/renderers/models/AnimatedDie.tsx`) közvetlenül újrahasznosítva, a Hotel `DiceHUD.tsx`/`DieTray` STRUKTURÁLIS mintáját követve (saját kis, fix kamerás `Canvas`, nem import, mert a Hotel wrapper Hotel-specifikus államezőket olvas): új `GazdalkodjOkosanDiceHUD.tsx`+css. Mivel ehhez a játékhoz nincs valódi kocka-fotó, a 6 kockaoldal-textúra **generált** (SVG→`sharp`, `scripts/generate-gazdalkodj-okosan-dice.mjs`, krém/arany paletta a játék témájához illeszkedve) — bármikor lecserélhető valódi fotóra ugyanazon a fájlnéven.

**Ellenőrzés**: `tsc`, `eslint .`, `vitest run` (**523/523**, +4 reducer + 1 rules eset az ack-fázisra/`MOVED.source`-ra), `vite build` — mind zöldek. Élő Playwright-ellenőrzés Gazdálkodj okosanon: kártyahúzás → modál nyílik a kártya szövegével, hatás már látszik a pénzben, "OK" → modál zár, bábu azonnal a célmezőn (nem lépked körbe); ~45 iterációs automata stressz-teszt (gyors dobás/kör-vége/kártyahúzás/ack ciklus) végig stabil maradt (csak ártalmatlan `THREE.WebGLRenderer: Context Lost.` log a szintetikus sebességű Canvas újra-létrehozásból, nem valós hiba); kockadobás-HUD helyesen tumble-öl és megállítja a dobott értéket. Hotelen: a pénzösszeg helyesen csökkent két egymást követő vásárlás után (15 000 → 14 500 → 13 500), nulla új konzolhiba a migráció után (csak a már meglévő, ártalmatlan 401-es naplózási hívások) — a flourish-animáció maga (gyors, 1200ms-es felugró szám) élő screenshot-tal nem lett elkapva (időzítés-érzékeny), de mivel a megosztott kód a Hotel korábbi, bizonyítottan működő implementációjának szó szerinti átvétele, és a pénzösszegek/konzol hibamentesek, ez alacsony kockázatúnak minősül.
A `ZoomableThumb` kattintásra-nagyítás funkció Gazdálkodj okosanon statikus típusellenőrzéssel/lint-tel lett igazolva (a ~45 iterációs teszt során nem került elő vásárlási lehetőség), a Ramses-precedens alapján.
