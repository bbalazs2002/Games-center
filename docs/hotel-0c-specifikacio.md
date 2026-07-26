# Hotel-0c — Specifikáció: valódi assetek és textúrák

**Státusz:** 0c.1 kész és élőben ellenőrizve — pálya, hotelenkénti épületszám, kert-fotó, valódi 3D kocka-animáció (mozgás/éjszaka/engedély), telek-kártyák és bankjegyek a UI-ban, teljes vizuális arculatváltás ("modern, letisztult", a tárcsa köré szervezve). Hátravan: 0c.2 (épület/autó valós modellek — a felhasználó feladata, `ScannedModel`/`GLTFSceneObject` már készen várja őket).
**Utolsó frissítés:** 2026-07-24
**Kapcsolódik:** [Projekt-conception.md](./Projekt-conception.md), [hotel-0a-specifikacio.md](./hotel-0a-specifikacio.md) (§5 — a placeholder geometria, aminek a lecserélése itt történik), [hotel-0b-multiplayer-specifikacio.md](./hotel-0b-multiplayer-specifikacio.md)

## 1. Cél és hatókör

Hotel-0a/0b lezárva: a motor és a multiplayer réteg kész és élesben ellenőrzött, de a 3D tábla **geometriai placeholderekkel** (színes dobozok/kúpok) fut. Hotel-0c ezeket cseréli le a fizikai játékról készült valódi fotókra/modellekre — ez az utolsó lépés egy **bétaverzió** előtt, amivel a család/barátok szélesebb körben tesztelhetik a platformot.

A `assets/Hotel/` mappa (raw fotók + korábban kézzel válogatott/konvertált PNG-k) **gitignore-olt** (`assets/**`), tehát semmi belőle nem kerül automatikusan a futó alkalmazásba — ami ténylegesen megjelenik a böngészőben, azt explicit át kell másolni/generálni a git által verziózott `public/` mappába.

## 2. Alfázis-bontás (döntés, 2026-07-23)

A teljes "valódi assetek" munka két, egymástól függetlenül szállítható részre bomlik:

- **Hotel-0c.1 — minden, ami nem igényel valódi 3D geometriát:** a pálya alakja, a kocka (mozgás- és építésiengedély-kocka) valódi fotó-textúrákkal + dobás-animációval, a telek-/kert-kártyák és bankjegyek dekoratív megjelenítése a UI-ban. Ezt teljes egészében meg tudom valósítani, külső eszköz/a te közreműködésed nélkül.
- **Hotel-0c.2 — a 8 hotel-épület és az autó-token valós 3D modellje.** Fotogrammetriát ez a környezet nem tud futtatni (nincs telepítve semmilyen fotogrammetria-szoftver, és a nyers fotók HEIC formátuma miatt még megnézni sem tudom őket eszközzel). **Te készíted el ezeket** — akár telefonos 3D-szkenneléssel (pl. Polycam/Scaniverse/Luma AI, `.obj`+`.mtl` export), akár kézzel, Blenderben modellezve (`.glb`/glTF export — lásd 5.5) — ez mindkét esetben lényegesen jobb eredményt ad, mint bármilyen utólagos rekonstrukció a már elkészült fotókból. Az importáló egységeket (lásd 4. szakasz, mindkét formátumhoz) már most, a modellek nélkül is elkészítettem, hogy amint egy modellfájl bekerül a megfelelő helyre, azonnal, kódváltoztatás nélkül megjelenjen — addig a placeholder geometria fut tovább, változatlanul.

Ez a bontás azt jelenti, hogy **0c.1 önmagában is szállítható és béta-kész állapotot ad**, a 0c.2 (épületmodellek) pedig utólag, hoteltenként/fokozatosan csöpöghet be, anélkül hogy bármi mást blokkolna.

## 3. Asset-pipeline

```
assets/Hotel/raw-heic/**        (gitignore-olt, nyers fotók — a te forrásanyagod)
        │  scripts/convert-hotel-heic.mjs  (npm run assets:convert-heic)
        │  mechanikus 1:1 tükrözés, nincs válogatás/átnevezés
        ▼
assets/Hotel/raw-png/**         (gitignore-olt, csak megtekintésre/referenciának —
                                  ide néz bele Claude a további döntésekhez)

assets/Hotel/png/**             (gitignore-olt, KÉZZEL válogatott/átnevezett anyag —
                                  ez már korábban, a Hotel-0a tábla-beolvasáshoz készült)
        │  kézi/implementáció-idejű másolás, csak amire ténylegesen szükség van
        ▼
public/assets/hotel/**          (VERZIÓZOTT — ez tényleg kiszolgálásra kerül a futó appból)
        ├─ board.jpg
        ├─ dice/dice-{1..6}.jpg
        ├─ perm-dice/perm-dice-{green,H,2,red}.jpg
        ├─ property-cards/{Hotel}-{construction,nights}.jpg
        ├─ gardens/{Hotel}-garden.png  (átlátszó háttér, lásd 5.2)
        ├─ banknotes/banknote-{50,100,500,1000,5000}.jpg
        ├─ buildings/{Hotel}/IMG_*.jpg  (referencia-fotók — a modell 0c.2, tőled)
        ├─ car/car-{front,back,left,right,bottom}.jpg
        ├─ stairs/stairs-{top,bottom}.jpg
        ├─ buildings/{hotelId}/model.obj + model.mtl + textúrák   (0c.2, tőled — még nincs)
        └─ car/model.obj + model.mtl + textúrák                   (0c.2, tőled — még nincs)
```

**Miért nem közvetlenül `assets/Hotel/png/`-ből szolgáljuk ki?** Az a mappa gitignore-olt (nagy fájlok, nem verziózott) — ha az app onnan olvasna, a build más gépen/CI-n/a bétát tesztelő családtagoknál üresen futna. A `public/`-ba másolt, ténylegesen szükséges fájlok viszont a repóval együtt utaznak.

`scripts/convert-hotel-heic.mjs` **elkészült és lefutott** — mindent tükröz a `raw-heic/` alól (jelenleg ez ténylegesen az épület- és autó-fotókat érinti, a többi kategória már korábban kézzel konvertálva volt). Újrafuttatható (`npm run assets:convert-heic`), ha új fotó kerül a `raw-heic/` alá.

`scripts/resize-hotel-images.mjs` (`npm run assets:resize-images`) **elkészült és lefutott** — a curated `assets/Hotel/png/**` + a mechanikusan konvertált `assets/Hotel/raw-png/{buildings,car,stairs}/**` fájlokat (a kézzel válogatott, de nem odaadott jelöltfotókat NEM) `sharp`-pal átméretezi (leghosszabb oldal 1024px, képarány megtartva) és JPEG-be tömöríti közvetlenül `public/assets/hotel/`-be, a mappaszerkezetet tükrözve. Eredmény: 130 kép, összesen ~19MB (volt: ~2.4GB nyersben) — pl. a `board.jpg` 6.4MB→248KB, egy épület-referenciafotó 20MB→182KB. Rerunnable, ha új/curated kép kerül a forrásmappákba.

## 4. Az importáló komponensek (elkészültek)

Két testvér-komponens `src/client/renderers/models/`-ben — mindkettő **game-/renderer-agnosztikus** (nem csak Hotelnek, nem csak a loop-track rendererhez — bármelyik jövőbeli R3F-alapú renderelő újrafelhasználhatja, ugyanaz az elv, mint a `core/games` szeparációnál). Közös logika (`materialTint.ts`, `cloneWithTint`) egy helyen — nincs duplikálva.

**`ScannedModel.tsx`** — egyetlen `.obj`+`.mtl` fájlpárt tölt be (pl. egy külön exportált modell hotelenként):

```ts
interface ScannedModelProps {
  objUrl: string;
  mtlUrl?: string;
  colorTint?: string;   // pl. játékos-szín az autó-tokenhez
  fallback?: ReactNode; // amíg nincs modell / amíg tölt — ide jön a jelenlegi placeholder geometria
  scale?: number;
}
```

**`GLTFSceneObject.tsx`** — **ha inkább egy összefogott Blender-jelenetet exportálsz** (lásd 5.5 — a te kérdésedre válaszul), ez a komponens egy `.glb`/`.gltf` fájlból nevesített objektumot emel ki:

```ts
interface GLTFSceneObjectProps {
  url: string;         // a teljes jelenet .glb-je — közösen cache-elve minden benne lévő objektumhoz
  objectName: string;  // pontosan a Blender Outliner-beli objektumnév
  colorTint?: string;
  fallback?: ReactNode;
  scale?: number;
}
```

Mindkettő ugyanazt a mintát követi:
- **URL-enként cache-eli** a betöltést (`GLTFSceneObject`-nél egy 8-hotelos közös `.glb`-t is csak EGYSZER tölti/parse-ol, minden `objectName`-lekérdezés ugyanabból az egy betöltött jelenetből dolgozik); sikertelen betöltést **nem** cache-el, hogy egy később bekerülő fájlt a következő mountnál felvegyen.
- Amíg nincs (vagy nem sikerült) a modell/objektum, a `fallback`-et rendereli — **ez garantálja, hogy a 0c.2 (épületmodellek) hiánya soha nem tör el semmit**, csak addig is a jelenlegi dobozok/kúpok látszanak.
- `colorTint` egy **külön klónjának** anyagait színezi át (a betöltött/cache-elt eredeti sosem mutálódik) — ez teszi lehetővé, hogy ugyanazt az autó-modellt 4 különböző játékos-színben használjuk.

Ellenőrizve: `tsc --noEmit`, `eslint` — mindkettő tiszta.

## 5. Hátralévő munka (0c.1)

### 5.1 Pálya alakja — ELKÉSZÜLT, élőben ellenőrizve

A tábla most egy lapos téglatest (`BoardBackground`, `HotelGamePage.tsx`), aminek a felső lapján a `board.jpg` textúra jelenik meg — pontosan a te 1. kérésed szerint. `computeLoopPositions.ts` kapott egy új `computeSplineLoopPositions(count, controlPoints)` függvényt: `THREE.CatmullRomCurve3` (zárt görbe) + `getSpacedPoints` a mezők pozícióihoz, ívhossz szerint egyenletesen elosztva. `LoopTrackBoard3D` két új, opcionális propot kapott — `positions` (felülírja a generált lekerekített téglalapot) és `background` (bármilyen extra 3D tartalom, a Suspense-be csomagolva a textúra-betöltés miatt) — **game-agnosztikus marad**, egy másik loop-track játék a régi placeholder-téglalapot kapja, ha nem ad meg egyiket sem.

A kontrollpontokat (`src/client/games/hotel/ui/hotelBoardLayout.ts`, `HOTEL_BOARD_CONTROL_POINTS`) a `board.jpg`-ből szemre becsültem (nem pixel-pontos). Playwright screenshottal élőben ellenőriztem (`temp/hotel-0c-board-2-zoom.png`): a textúra tájolása helyes (Royal/Waikiki/Fujiyama/President mind a jó helyen, a Start-nál álló bábu pontosan a piros nyílra esik), a mezőjelölők nagyjából követik a valódi pályát, de nem pixel-pontosan illeszkednek minden mezőnél — ez egy elfogadható első verzió, finomhangolható, ha élőben is megnézed.

### 5.2 Hotelenkénti pontos épületszám — ELKÉSZÜLT

A korábbi, mezőnkénti (`insideBuildings`/`outsideBuildings`, "melyik szomszédos telek épületszáma nagyobb") logika helyett most **hotelenként külön** (`HotelBuildingClusters`, `HotelGamePage.tsx`) pontosan annyi doboz jelenik meg, amennyi ténylegesen fel van építve (`lot.buildingsBuilt`), a hotel saját zónájának közelében (`HOTEL_ZONE_CENTERS`, szintén szemre becsült horgonypont hotelenként, `hotelBoardLayout.ts`). Ez pontosabb (nincs többé "a magasabb épületszámú telek számít" közelítés), de a pontos elhelyezés (a fotón látható, hotelenkénti épület-alaprajz-körvonalakhoz igazítva) még finomítható — lásd 5.4/7.

**Kert-fotók bekötve, hibajavítás.** A kert (`hasGarden`) megjelenítése kimaradt az első körből — pótolva: `GardenDecal` egy sík (`planeGeometry`) a hotel-klaszterben, a már kész `gardens/{Hotel}-garden` fotóval textúrázva. Első próba fekete négyzetet mutatott — kiderült, hogy a kert-darabok fizikailag szabálytalan alakú kartonlapok, feketén fotózva, tehát a JPEG-nek ténylegesen nagy fekete területei vannak a darab körül. Megoldás: `scripts/resize-hotel-images.mjs` a `gardens/` forrásmappát külön kezeli — pixelenként kiszínezi (chroma-key, RGB≤24 küszöb) a fekete hátteret átlátszóra, és PNG-ként (nem JPEG-ként) menti, hogy az alfa-csatorna megmaradjon; a `GardenDecal` anyaga `transparent alphaTest={0.5}` ezt kihasználva. Élőben ellenőrizve (ideiglenes teszt-módosítással a `initialState.ts`-ben, utólag visszaállítva) — a fekete négyzet eltűnt, csak a tényleges kert-grafika látszik.

### 5.3 Valódi 3D kocka, dobás-animációval — ELKÉSZÜLT, élőben ellenőrizve

Három kocka van (mind ugyanaz a mechanizmus): a mozgás-kocka és az éjszaka-kocka (1-6, `dice-{1..6}.jpg`), és az építésiengedély-kocka (zöld/H/2/piros, a `PERMIT_DIE_FACES` súlyozás — 3× zöld, 1× H, 1× 2, 1× piros — szerint 6 laphoz rendelve). Új, game-agnosztikus `src/client/renderers/models/AnimatedDie.tsx` — `BoxGeometry` + laponkénti anyag-tömb (6 `MeshStandardMaterial`), dobáskor `useFrame`-alapú animáció: kb. 0.5s szabad "pörgés" tetszőleges tengely körül, majd 0.35s easing a helyes végállásba (a dobott érték lapja pontosan felfelé néz — a kocka fix lap-sorrendje alapján `THREE.Quaternion.setFromUnitVectors`-szal előre kiszámítva). Az animáció újraindítását a napló adott TÍPUSú bejegyzéseinek száma vezérli (`MOVED`/`NIGHTS_STAY`/`CONSTRUCTION_PERMIT_ROLLED` darabszáma), nem `state.log.length` — így egy másik akció (pl. telekvásárlás) sosem "rezzenti meg" újra egy már megállt kockát.

**Elhelyezés — nem a táblán, hanem egy saját HUD-tálcán, a tárcsa fölött (`DiceHUD.tsx`).** Az első próba a kockákat a 3D táblán, a sarokban helyezte el — ez kicsi volt és a fő kamera forgatásával (OrbitControls) könnyen kikerült a látótérből. Végleges megoldás: mindegyik kocka egy **saját, kis, fix kamerájú `<Canvas>`-ban** él (nem a fő tábla kamerájától függ), egy kompakt üveg-panelen a tárcsa fölött — ez illeszkedik a "szervezd a tárcsa köré" kéréshez, és mindig jól látható, függetlenül attól, hogyan van elforgatva a fő tábla. (Útközbeni hiba, javítva: az R3F `<Canvas>` alapból `width:100%;height:100%` inline stílust ad saját magának, ami egy CSS-osztály `width`/`height`-jét felülírja — a méretet ezért `style` propon keresztül kellett beállítani, nem `className`-en.)

### 5.4 Kártyák és bankjegyek — dekoratív UI — ELKÉSZÜLT, élőben ellenőrizve

Megerősítve és megvalósítva: **a fő adatforrás marad a jelenlegi, jól olvasható szöveges kijelzés** — a valódi képek csak dekorációként egészítik ki, nem váltják le. Az `OwnedLotsPanel` minden telek-sora egy kis kattintható property-kártya-miniatűrt kap; kattintásra egy `Modal`-ban megjelenik mindkét kártya (építés + éjszaka-tábla), és ha van kert, a kert-fotó is. A pénz kijelzése (`StatusChip`) egy kis valódi bankjegy-képet mutat a szám mellett — a címlet az összeg nagyságával nő (`banknote-{50,100,500,1000,5000}.jpg`), tisztán dekoratív, nem tényleges pénzváltás-szimuláció.

**Hiba, javítva: a kártya-modal a bal felső sarokba szorulva, levágva jelent meg.** A `Modal` a (backdrop-filterrel rendelkező) `.ownedLots` panel gyerekeként volt renderelve — a CSS specifikáció szerint egy `backdrop-filter`-t (vagy `filter`/`transform`-ot) beállító elem **új containing blockot hoz létre a `position: fixed` leszármazottaknak**, így a modal a kis panel korlátai közé szorult a teljes viewport helyett. Javítva: a `Modal` most az `.ownedLots` panel TESTVÉRE (nem gyereke), Fragment-be csomagolva — élőben visszaellenőrizve, most helyesen középre igazodik. **Ez egy általános, a projekt egészére érvényes csapda** — bármelyik jövőbeli `backdrop-filter`es/`filter`es/`transform`os panel esetén ugyanez a hiba jöhet elő, ha egy `Modal` (vagy bármi más `position:fixed`) a gyereke.

### 5.6 Teljes vizuális arculatváltás — ELKÉSZÜLT ("modern, letisztult", a tárcsa köré szervezve)

A felhasználó kérése: modern, letisztult megjelenés, a tárcsa alakú menü (`WheelMenu`) köré szervezve, azt kicsit átlátszóbbra véve, a már meglévő bankjegy-/kártya-fotók felhasználásával. Konkrét változtatások:

- **Szín-/stílusvilág**: a korábbi generikus világoskék/fehér helyett egy, a valódi assetekből (navy/arany property-kártyák, szépia bankjegyek) merített paletta — sötét navy-antracit háttér-gradiens (`HotelGamePage.module.css` `.page`), arany (`#d4af37`) kiemelő szín, krémfehér (`#f3ecd9`) szöveg.
- **`WheelMenu` (ui-kit, game-agnosztikus) — valódi üveg-hatás.** SVG alakzatokra közvetlenül nem alkalmazható a `backdrop-filter` — ezért egy sima HTML `div` (`glassBackdrop`) ül a kör alakú SVG mögött, ezen fut a tényleges elmosás (`blur(18px) saturate(150%)`), az SVG cikkelyek pedig áttetsző (`rgba`) kitöltést kapnak, hogy az elmosás átüssön rajtuk — ez adja a kért "kicsit átlátszóbb" hatást. Csak CSS-/markup-szintű változás, a komponens logikája (geometria, interakció) érintetlen.
- **`OwnedLotsPanel`, `GameLogPanel`, `PlayerActionWheel` (`playerLabel`/`selectionPanel`), `DiceHUD`**: mind ugyanazt az "üveg-panel" mintát kapták (`rgba` sötét háttér + `backdrop-filter: blur()` + finom arany szegély), konzisztens megjelenés.
- **`StatusChip`** (új, `HotelGamePage.tsx`) — a korábbi két külön, sima szöveges `<p>` sáv helyett egy lebegő üveg-pirula: szín-pötty, játékosnév, bábu-szín, és a bankjegy-flourish-os készpénz — mindez a tárcsa alatt középen, a "tárcsa köré szervezve" elvnek megfelelően.
- A megosztott `Button`/`Modal` (ui-kit) komponenseket **szándékosan nem** érintettem — azokat más játékok (Dáma, Lobby, Auth) is használják, egy Hotel-specifikus arculat rájuk erőltetése nem kért, szélesebb hatású változás lett volna.

Élőben ellenőrizve Playwright-tal minden érintett képernyőrészlet (tárcsa, kockák, telek-panel + kártya-modal, státusz-pirula) — screenshotok: `temp/hotel-redesign-*.png`.

**Három apró javítás, ugyanezen a napon (2026-07-24) — a felhasználó élő tesztje alapján:**

1. **Fehér sáv + felesleges scrollbar eltüntetve.** A projektnek soha nem volt globális CSS reset-je — a böngésző alapértelmezett `body { margin: 8px }`-je miatt minden `100vh`-magas oldal (pl. `HotelGamePage`) 8px-szel túllógott, ami egy fehér csíkot és egy oldal-szintű scrollbart eredményezett. Új `src/client/index.css` (importálva `main.tsx`-ben, ez az első globális stíluslap a projektben): `html, body, #root { margin: 0; padding: 0; height: 100% }` + `box-sizing: border-box` mindenre. **Ez az egész alkalmazásra érvényes**, nem csak Hotelre — élőben visszaellenőrizve, hogy a Dáma és a kezdőlap is rendben maradt.
2. **Kockatálca nagyobb, és a kocka most már teljesen elfér benne minden forgásszögben.** A canvas 3.5rem→4.5rem, DE önmagában ez nem lett volna elég: a kamera-keretezés (`fov`/pozíció) korábban csak a kocka lap-nézeti méretéhez volt igazítva, a pörgés közbeni testátlót (ami ennél kb. 30%-kal nagyobb) nem vette figyelembe — emiatt forgás közben a sarkok időnként levágódtak. Javítva: nagyobb `fov` (40) + távolabbi kamera + kicsit kisebb kockaméret, kellő tartalékkal a testátlóra is.
3. **Az építési terv panel átkerült a bal oldalra, a telkek panel mellé (nem alá/fölé).** `PlayerActionWheel` visszatérési értéke Fragmentre váltva, hogy a `selectionPanel` a `.container` (jobb oldali, tárcsa körüli oszlop) helyett önállóan, a bal oldalon pozícionálható legyen (`left: 19rem`, közvetlenül az `OwnedLotsPanel` 17rem szélessége után). `top`+`max-height` (nem fix magasság) + belső görgetés (`overflow-y: auto`) garantálja, hogy egy hosszú terv se nőhessen a canvas-nál magasabbra — tehát sosem kényszerít oldal-szintű görgetést, amit a canvas miatt nehézkes lenne kezelni.

`tsc`/`typecheck:server`/`eslint`/`vitest` (130/130)/`vite build` mind zöld, mindhárom javítás élőben ellenőrizve Playwright-tal.

### 5.5 Épületek/autó bekötése — HÁTRAVAN (0c.2, tőled függ)

Amint a modell(ek) megérkeznek, a `HotelBuildingClusters` doboz-mesh-ei helyett hotelenként `ScannedModel`/`GLTFSceneObject` hívódik (fallback-ként megtartva a dobozt). Az autó-token (`renderPlayerToken`) hasonlóan valódi modellt kap `colorTint`-tel a jelenlegi kúp helyett, fallback-ként a kúpot megtartva.

**Blender-munkafolyamat (a te kérdésedre, 2026-07-24) — igen, egy Blenderben épített jelenetet is fel tudok dolgozni, és ez a javasolt út a telefonos szkennelés helyett/mellett is.** `.obj`+`.mtl` helyett **glTF 2.0 exportot javaslok** (Blender: File → Export → glTF 2.0, `.glb` bináris, textúrákkal együtt egybe csomagolva) — ez a webes 3D de facto szabványa, a Three.js hivatalos `GLTFLoader`-je (amit a fenti `GLTFSceneObject` már használ) natívan, jó minőségben kezeli, és a Blender export automatikusan konvertál a saját Z-up rendszeréből a glTF/Three.js Y-up rendszerébe — nincs kézi forgatás-igazítás.

A nagyobb előny: **ha mind a 8 hotelt (és esetleg az autót) EGY közös Blender jelenetbe teszed, a hozzájuk tartozó, helyesen elnevezett objektumokkal/csoportokkal, és EGYBEN exportálod `.glb`-ként**, azzal a jelenlegi legpontatlanabb részt is megoldjuk: a `HOTEL_ZONE_CENTERS`/`HOTEL_BOARD_CONTROL_POINTS` (5.1/5.2) jelenleg általam, szemre becsült pozíciók. Ha Te a Blenderben egy referencia-síkra (pl. a `board.jpg`-t textúraként rávetítve) pozícionálod pontosan az egyes hoteleket/kerteket, a glTF fájl **minden objektum saját, pontos transzformációját (pozíció/forgatás/méret) is elmenti** — ezt ki tudom olvasni és átvenni, ahelyett hogy tovább becsülném. Egyetlen elvárás: az objektumok neve egyezzen a motor `lotId`-jaival (`royal`, `fujiyama`, `letoile`, `boomerang`, `tajmahal`, `safari`, `president`, `waikiki`, esetleg `car`) — vagy mondd meg Te, mi legyen a neve, és ahhoz igazítom a kódot.

Ha inkább külön-külön, saját origóban központosított modelleket exportálsz hotelenként (nem egy közös, pozícionált jelenetet), az is teljesen működik — akkor viszont az elhelyezést továbbra is én végzem a jelenlegi (vagy a Te által küldött, épületekkel fotózott tábla alapján pontosított) horgonypontokkal.

## 6. Komponens-/pipeline-diagram

Lásd: [diagrams/hotel-0c-asset-pipeline.puml](./diagrams/hotel-0c-asset-pipeline.puml)

## 7. Nyitott pontok

- [ ] A pálya kontrollpontjainak és a hotel-zóna horgonypontoknak a finomhangolása (5.1/5.2) — élőben elfogadható, de nem pixel-pontos. Két lehetséges forrás a pontosításhoz, bármelyik jó: (a) fotók a tábláról úgy, hogy épületek/kertek már a helyükön vannak, vagy (b) ha úgyis Blenderben építed a 0c.2 modelleket, egy közös, pozícionált jelenet-export (lásd 5.5) — ez utóbbi egyúttal a modelleket is megadja, nem csak a koordinátákat.
- [ ] A 0c.2 (épület/autó modellek) ütemezése a tiéd — `ScannedModel` (.obj/.mtl) és `GLTFSceneObject` (.glb, akár közös jelenet) is készen várja őket, nincs blokkoló függés 0c.1 felől. Melyik utat választod (Blender-jelenet vs. telefonos szkennelés, közös fájl vs. hotelenkénti külön fájl) — a te döntésed, mindkettőt támogatja a kód.
