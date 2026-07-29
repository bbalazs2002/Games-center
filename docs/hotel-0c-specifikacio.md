# Hotel-0c — Specifikáció: valódi assetek és textúrák

**Státusz:** 0c.1 ÉS 0c.2 kész, élőben ellenőrizve — pálya, hotelenkénti épületszám, kert-fotó, valódi 3D kocka-animáció (mozgás/éjszaka/engedély), telek-kártyák és bankjegyek a UI-ban, teljes vizuális arculatváltás ("modern, letisztult", a tárcsa köré szervezve), **és most a valódi, felhasználó által Blenderben megépített és pozícionált tábla/épület/autó-modell is be van kötve** (lásd 5.7, végleges javítás: 5.8) — a placeholder geometria csak fallback-ként marad meg (amíg egy adott objektum még nem épült/vásárolt, vagy ha a `.glb` betöltése valamiért sikertelen).
**Utolsó frissítés:** 2026-07-28
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

## 5. Hátralévő munka (0c.1) — összefoglalva, a tanulságokra fókuszálva

Minden alpont KÉSZ és élőben ellenőrizve. A blow-by-blow történet a git historyban / a korábbi doc-verzióban visszakereshető; itt csak az eredmény és a megjegyzésre érdemes tanulságok szerepelnek.

**5.1 Pálya alakja** — `BoardBackground` egy lapos téglatest a `board.jpg` textúrával; `computeSplineLoopPositions` (zárt Catmull-Rom görbe) adja a mezőpozíciókat. A kezdetben szemre becsült kontrollpontokat (`HOTEL_BOARD_CONTROL_POINTS`) az 5.7 valódi modell-adatra váltotta.

**5.2 Hotelenkénti épületszám** — `HotelBuildingClusters` pontosan annyi épületet jelenít meg hotelenként, amennyi ténylegesen fel van építve. **Tanulság**: a kert-fotók fekete kartonlap-háttere chroma-key nélkül fekete négyzetként jelent meg — a resize-szkript ezért a `gardens/` forrást külön, alfa-csatornás PNG-ként kezeli (RGB≤24 küszöbbel átlátszóra színezve).

**5.3 Valódi 3D kocka** — három kocka (mozgás/éjszaka/engedély), mindegyik saját, fix kamerájú mini-Canvasban a tárcsa fölötti HUD-on (nem a fő tábla-kamerától függ, így forgatás közben sem tűnik el). **Tanulság**: a kamera `fov`-ját a pörgő kocka TESTÁTLÓJÁRA kell méretezni, nem a lap-nézeti méretére — különben forgás közben a sarkok levágódnak.

**5.4 Kártyák/bankjegyek** — dekoratív kiegészítés a szöveges UI mellett (a szöveg marad az adatforrás). **Tanulság, projekt-szintű csapda**: egy `backdrop-filter`/`filter`/`transform`ot beállító szülő elem új containing blockot hoz létre `position:fixed` gyerekeknek — egy `Modal` egy ilyen panel GYEREKEként a panel méretei közé szorul, nem a viewporthoz igazodik. Mindig testvérként (Fragmentbe csomagolva) renderelendő egy ilyen panel mellé, sosem alá.

**5.5 (történeti, lásd 5.7)** — a Blender-export munkafolyamat-döntés: `.glb`/glTF `.obj+.mtl` helyett (natív Y-up konverzió, natív `GLTFLoader`-támogatás), egy közös, a felhasználó által pontosan pozícionált jelenetben, ami minden korábban becsült horgonypontot kiváltott.

**5.6 Vizuális arculatváltás** — navy-arany "üveg-panel" dizájn, a valódi asset-színekből merítve, a tárcsa köré szervezve. **Tanulságok**: (1) a projektnek nem volt globális CSS reset-je — a böngésző alap `body margin`-je 100vh-s oldalaknál felesleges scrollbart okozott, ezért kapott a projekt egy első globális `index.css`-t; (2) SVG-re nem alkalmazható közvetlenül `backdrop-filter` — egy alatta lévő sima HTML `div` viheti az elmosást.

**5.7-5.8 A valódi modell bekötése és a forgás-hiba (2026-07-28, 4 kör)** — a felhasználó egybefüggő, pontosan pozícionált Blender-jelenetet épített (`full-board.glb`, 109MB→11.3MB tömörítve `@gltf-transform/cli`-vel, node-nevek megőrizve — `scale` prop soha nem csereszabatos "felülír vs. szoroz" hiba is itt derült ki és lett javítva). A modell saját pozíciója/skálája változtatás nélkül használva; helyette minden MÁS (kamera, `OrbitControls`, dekoráció) lett felskálázva egy `HOTEL_SCENE_SCALE=40` konstanssal. A forgás-hiba megoldása 3 hibás próbálkozás után, egy felhasználó-kérésre épített, korrekció nélküli `.glb`-nézegetőből (`HotelModelViewerPage`, `/games/hotel/model-viewer`, megtartva diagnosztikai eszközként) derült ki: egyetlen, globális `Rx(180°)` FORGATÁS — nem tükrözés — oldja meg mindent (`HOTEL_UP_ROTATION`, `hotelModelAssets.ts`).

**Tanulságok, érdemes megjegyezni:**
- Ha egy matematikailag konzisztens levezetés ellentmond egy élő ellenőrzésnek, nem biztos, hogy a levezetés rossz — nézd meg, nem egy egyszerű, szisztematikus eltérés (itt: pontosan 180°) magyarázza-e a különbséget.
- Egy fix, ami TÖBB ground-truth teszten is átment, még mindig lehet hibás — "több esetre ellenőrzött" nem egyenértékű "biztosan helyes"-sel.
- Ismételt sikertelen javítás után egy egyszerű, korrekció nélküli INSPEKCIÓS eszköz építése (nem egy újabb fix-próbálkozás) sokszor gyorsabban vezet megoldáshoz, mint még egy okosabb levezetés.
- "Tükrözés" és "forgatás" nem ugyanaz, még ha mindkettő "fejjel lefelé fordít" is valamit — a tükrözés megfordítja a szöveg olvashatóságát (kiralitás), a forgatás nem; ez egy olcsó, azonnali ellenőrző jel bármelyik forgás-javítás helyességéhez.
- `Bank`/`cityHall` egy ideig egyszínű dobozként jelent meg (anyag-dominancia, nem pozíció/forgatás hiba) — az 5.9-es körben a felhasználó megerősítette, hogy időközben magától rendben lett.

**5.9 Öt finomítás (2026-07-28)** — valódi parkolópozíció (`car-0-<szín>`, `LoopTrackToken.offTrackPosition/Rotation`), lépcső-/mezőjelölő-proxyk eltávolítása, mezőnkénti bábu-orientáció (`LoopTrackBoard3D` új `rotations` propja), lebegés megszüntetése (`tokenHeightOffset={0}`).

**Tanulság**: egy `useSpring`-alapú animáció, amit aszinkron betöltött adat vezérel, minden olyan értéktől függjön a `useEffect`-ben, amit a cél-számító függvény ténylegesen felhasznál — nem csak a "váltott-e az index" triggertől. Az async adat trigger-változás NÉLKÜL is megérkezhet; ha nincs a függőséglistában, az effect nem fut újra, és az animált elem az első (hibás) render-nél "beragad".

**5.10 Bábuk színenkénti eltolása (2026-07-28)** — a `LoopTrackBoard3D` régi, több-bábu-egy-mezőn esetre tervezett szórás-eltolása (`tokenOffset`) feleslegesen tolta el a Hotel-bábukat, mivel a Hotel szabálya/engine-je ezt az esetet kizárja (`rules.ts`, `isPositionOccupied`). Új, opcionális `tokenSpreadRadius` prop (Hotel `0`-t ad át) oldotta meg — az alapérték megmaradt más, hipotetikus jövőbeli játékoknak (pl. Monopoly), ahol több bábu is állhat egy mezőn.

**Tanulság**: a felhasználó képes és hajlandó saját maga megnevezni a valószínű gyökérokot ahelyett, hogy csak a tünetet írná le — ilyenkor érdemes komolyan venni mint erős előfeltevést, de a kódban is leellenőrizni, mielőtt a javítást elvégezzük.

**5.11 Lépcső-hely kiválasztása a táblán, menü helyett (2026-07-29)** — a felhasználó kérésére a lépcső-elhelyezés (mind a fizetős `BUY_STAIRCASE_RIGHT`, mind az ingyenes `CHOOSE_FREE_STAIRCASE_SPACE` flow) mező-választó lépése a wheel-menüs listából a 3D táblára költözött: a lehetséges helyeken félig átlátszó, kattintható lépcső-előnézetek jelennek meg, ugyanazzal a valódi `stairs-<mező>-<lotId>` modellel, amit egy már megépített lépcső is használ (csak fakítva, `cloneWithOpacity`, `materialTint.ts` új függvénye). A lot-választás (fizetős flow-nál, ahol az ár lotonként eltér) megmaradt a wheel-menüben; csak a mező-választó al-menük (`staircase-right-spaces`, `free-staircase-spaces`) tűntek el. A wheel a mező-választás alatt egy rövid útmutatót + Mégse gombot mutat a normál menü helyett (`PlayerActionWheel`'s `WheelOrStaircaseHint`).

**Élő ellenőrzés, valódi akadállyal**: a wheel-alapú kattintás-lánccal (dobás → vásárlás → kör vége × N) a megfelelő állapot eléréséhez túl sok kört igényelt volna — a felhasználó leállította és kérte, hogy inkább egy szimulált állapotból induljak. Megoldás: ideiglenes, csak `import.meta.env.DEV`-ben aktív debug-seam (`window`-ra kitett `dispatch`/`state`), amivel közvetlenül, UI-kattintgatás nélkül lehetett a reducert a kívánt állapotba (tulajdonban lévő telek + `AWAITING_FREE_STAIRCASE_CHOICE`) vinni — a kör végén eltávolítva, nem került be a végleges kódba. **Valódi, meglepő megfigyelés útközben**: a lépcső-előnézetek (majd kiderült: a MÁR MEGÉPÍTETT, teljesen átlátszatlan lépcsők is) gyakorlatilag láthatatlanok voltak egy normál, táblát átfogó nézetben — nem hiba, hanem méret+szín kérdése: a valódi lépcső-darab kicsi (kb. egy autó-bábu mérete) és a tábla saját sárgás ikonjaihoz (bank/vásárlás jelek) hasonló színű. Egy külön szkripttel (`@gltf-transform/core`, node-transzformáció-kiolvasás) és a R3F kamera/objektum világ-pozíciójának képernyőre vetítésével (world position → `camera.matrixWorldInverse`/`projectionMatrix` → NDC → pixel) sikerült pontosan megtalálni és bezoomolni — onnan látszott, hogy tényleg ott van, csak nehezen észrevehető. Ennek alapján az előnézetek alapértelmezett átlátszósága felemelve (0.4→0.6, hover 0.75→0.9) a jobb észrevehetőségért.

`tsc --noEmit`, `eslint` (0 hiba), `vitest run` (213/213 teszt — tisztán UI-réteg, nincs új engine-logika), `vite build` mind zöld. Élőben ellenőrizve: a kattintás a kiszámított képernyő-pozíción pontosan a megfelelő `CHOOSE_FREE_STAIRCASE_SPACE` akciót váltotta ki, a wheel visszaállt normál nézetre.

## 6. Komponens-/pipeline-diagram

Lásd: [diagrams/hotel-0c-asset-pipeline.puml](./diagrams/hotel-0c-asset-pipeline.puml)

**Diagnosztikai eszköz, megtartva:** `/games/hotel/model-viewer` (`HotelModelViewerPage.tsx`) — a `full-board.glb` nyers, korrekció nélküli nézegetője, szabad kamerával és kattintás-alapú objektum-vizsgálattal (név, pozíció, forgatás, méret). Az 5.8-as kör hozta létre, de általánosan hasznos marad bármilyen jövőbeli `.glb`-vel kapcsolatos kétség gyors, saját szemmel történő ellenőrzésére.

## 7. Nyitott pontok

- [x] ~~A pálya kontrollpontjainak és a hotel-zóna horgonypontoknak a finomhangolása (5.1/5.2)~~ — megoldva az 5.7-es valódi modell-bekötéssel: a mezőpozíciók most a `car-<mező>` objektumok saját, Blenderben pontosan pozícionált koordinátáiból származnak, nem becsléssel.
- [x] ~~A 0c.2 (épület/autó modellek) bekötése~~ — kész, lásd 5.7.
- [x] ~~A tábla/mezőjelölők/bábuk illeszkedése a valódi görbe pályához, és a modellek helyes állása~~ — négy körön át tartott (5.7/5.8), a végleges megoldás egyetlen globális `Rx(180°)` forgatás, közvetlenül a felhasználó saját, korrekció nélküli `.glb`-nézegetős mérése alapján; élőben, közeli nézetből, olvasható táblaszöveggel és állva álló épületekkel is ellenőrizve.
- [x] ~~`Bank`/`cityHall` egyszínű dobozként jelenik meg, nem a teljes textúrázott modelljével~~ — a felhasználó az 5.9-es körben élőben megerősítette, hogy mindkettő helyesen jelenik meg.
- [x] ~~A parkoló-pozíció (`car-0-<szín>`) bekötése~~ — megoldva az 5.9-es körben, lásd ott.
