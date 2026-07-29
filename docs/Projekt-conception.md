# Társasjáték Digitalizáló Platform — Projekt Koncepció

**Státusz:** Fázis 0a/0b/0c (Dáma) implementálva és élesben ellenőrizve; Fázis 2 Hotel-0a (helyi vertikum), Hotel-0b (multiplayer), Hotel-0c.1 (assetek/UI/animáció) és Hotel-0d (AI ellenfél, online ÉS hot-seat módban) implementálva és lezárva; Ramses-0a/0b/0c szintén implementálva és lezárva; Dáma-0d ÉS Dáma-0d.2 (AI nehézségi szintek + csak-AI hangolási kör, egy valódi determinisztikus-holtpont hibát is javítva) szintén implementálva és lezárva; a B-klaszter egységes vizuális nyelve ("Rács") szintén implementálva és élesben ellenőrizve. Hátralévő: Hotel-0c.2 (valódi 3D modellek, a felhasználó oldalán), Hotel-0d.2 (jövőbeli fázis: csak-AI játékok elemzése), 4d (játékfüggetlen UX-fejlesztések — tervezés alatt, még nem implementálva).
**Utolsó frissítés:** 2026-07-29

## Projekt célja

Fizikailag meglévő, kedvelt társasjátékok digitalizálása egy közös platformon belül, ahol:
- Minden játéknak szép, igényes grafikai megjelenése van
- Online multiplayer módban is játszhatók
- Teljesen cross-platform (böngésző, mobil, desktop)
- Játékonként külön letölthetők/törölhetők (moduláris letöltéskezelés), hogy ne foglaljanak feleslegesen helyet

**Szerepkör:** A projekt tulajdonosa (te) software architect és project manager szerepben dolgozik — tervezés, döntéshozatal, review. A kódolást és implementációt Claude végzi.

## Fejlesztési konvenciók / workflow

- **Verziókezelés:** a kód GitHub-ra kerül; helyi git repo már inicializálva (`git init` megtörtént 2026-07-22-én).
- **Mappastruktúra (gyökér):**
  - `src/` — a forráskód
  - `docs/` — tervezési dokumentumok és diagramok (ez a fájl is itt van); a `docs/tests/` almappa a teszt-suite dokumentációja, játékonkénti bontásban (lásd `docs/tests/README.md`)
  - `temp/` — átmeneti fájlok: ide kerülnek a Claude által generált, még átnézésre váró fájlok, valamint a felhasználó által Claude-nak adott bemeneti fájlok (debug infó, instrukciók stb.); nem verziózott tartalom (`.gitignore`-ban kizárva)
  - `.git/` — GitHub-integráció
  - további elemek várhatók a gyökérben a projekt előrehaladtával
- **Diagramok:** PlantUML használandó minden tervezési diagramhoz (`docs/` alá kerülnek).
- **Kódminőségi elvek:** SOLID alapelvek és Clean Code gyakorlatok követése kötelező az implementáció során.
- **Komment-nyelv (2026-07-23):** a kódban (src/, prisma/, konfigurációs fájlok) kizárólag angol nyelvű kommentek szerepelhetnek — ez professzionálisabb, és a kód esetleges nyílt forráskódúvá tétele esetén is releváns. A felhasználó felé megjelenő UI-szövegek (gombok, üzenetek, hibaszövegek) továbbra is magyarul maradnak, csak a fejlesztői kommentek angolok. A dokumentáció (`docs/*.md`) is marad magyar.
- **Munkafolyamat:** implementáció előtt gondos tervezés — specifikáció és diagramok készülnek, mielőtt kód íródik. Nem megyünk bele kódolásba tervezési dokumentáció nélkül egy adott feature/modul esetén.

## Játéklista (kiindulás)

Hotel, Gazdálkodj okosan, Bang, Hanabi, Sakk, Malom, Dáma, Connect 4 (4 in a row), Színözön (Mastermind), Catan telepesei (kiegészítőkkel), Gwent (Witcher 3 verzió), Monopoly, Cluedo, Aqua Romana, Activity, Tabu, King Arthur, Jungle Speed, Dobble, Snapszer, Römi, Mocsár, Holland kocsma, Star Trek Fleet Captains, Ramses, Torpedó, Aranyásók, 2 lapos póker, 5 lapos póker (bővíthető lista)

---

## 1. Technológiai keretrendszer

### Döntés: webes stack (game engine helyett)

**Válasz technológiák:**
- Frontend: React + TypeScript
- Backend / multiplayer: Node.js, WebSocket-alapú real-time sync (pl. Colyseus framework mérlegelése)
- 3D rendering: Three.js + React Three Fiber (R3F)
- 2D rendering: SVG / Canvas
- Letöltéskezelés: code-splitting (dynamic `import()`) + Service Worker cache, PWA telepíthetőség
- Későbbi natív store build opció: Capacitor vagy Tauri (ugyanabból a kódbázisból)

**Miért nem Unity/Unreal:**
- Unity/Unreal munka jelentős része editor-vezérelt (scene-összeállítás, drag-and-drop), ami nehezen illeszkedik "AI kódolja, ember review-olja" munkafolyamathoz
- Unreal 5 túlméretezett egy társasjáték-platformhoz (build méret, native pipeline overhead)
- Cross-platform natív build-ek (code signing, store review) jelentős extra terhet jelentenek szóló fejlesztőnél

**Miért web:**
- A legtöbb listázott játék 2D-ben is kiválóan megjeleníthető (SVG/Canvas), motoros overkill nélkül
- Cross-platform "beépítetten": egy böngésző-kompatibilis kódbázis fut mindenhol, PWA-ként telepíthető
- Moduláris letöltés natívan támogatott (dynamic import + SW cache) — nem kell külön download manager komponens
- Ez az a stack, amiben AI-asszisztált fejlesztés (tiszta, verziózható, review-olható kód) a legerősebb

**Alternatíva mérlegelésre:** Godot — nyílt forráskódú, git-barát `.tscn` fájlok, natív export minden platformra webig, kevésbé editor-vezérelt mint Unity, de meredekebb tanulási görbe. Külön megbeszélés tárgya lehet, ha a natív store jelenlét fontosabbá válik.

### 3D képesség web-en

- WebGL / WebGPU natívan biztosítja a GPU-gyorsított 3D rendert, natív motorokkal egyenértékű vizuális minőséggel
- Three.js + React Three Fiber: deklaratív, React-komponensként illeszkedő 3D réteg, ugyanabban a kódbázisban mint a 2D
- Fizika-szimulációhoz (pl. kockadobás): cannon-es vagy rapier integrálható R3F-fel
- 3D modellek: glTF szabvány, beszerzési stratégia (**eldöntve**): hibrid — kész CC0/free asset store (Kenney.nl, Sketchfab) a generikus elemekhez (kockák, zsetonok, táblaalap), egyedi/AI-generált modellek a játék-specifikus ikonikus darabokhoz (pl. Monopoly házak, Catan hexek). A Fázis 0/1 fejlesztési és tesztelési szakaszban egyszerű geometriai primitívek (kocka, henger, gömb placeholder) használandók a végleges assetek helyett, hogy a build/pipeline korán tesztelhető legyen asset-függőség nélkül.
- Teljesítmény mobil böngészőben is megfelelő, ha az asset-ek optimalizáltak (társasjáték-léptékű jelenetek, nem nyílt világ)

**Architekturális elv:** a tábla-renderelő réteg cserélhető — külön 2D (SVG/Canvas) és 3D (R3F) "board renderer" implementáció, játékonként kiválasztva. A játéklogika (state, szabályok, hálózati sync) teljesen független a megjelenítéstől.

**Kiegészítő elv (2026-07-22):** a játéklogika (core engine) emellett a *bemenet forrásától* is független — tiszta `(state, action) → new state` reducer, ami nem tudja, hogy az action helyi kattintásból vagy hálózati üzenetből származik. Ez teszi lehetővé, hogy előbb helyi (single-player/hot-seat) módban épüljön fel egy játék, és a multiplayer réteg utólag, a reducer módosítása nélkül csatlakozzon rá (lásd `docs/dama-0a-specifikacio.md`, Transport absztrakció).

**Termékkövetelmény (2026-07-22):** hosszú távon minden játékban keverhető legyen ember és AI játékos (pl. 1 ember vs. 1 AI, vagy vegyes összeállítás). Ez architekturálisan egy `PlayerController` absztrakcióként jelenik meg minden játék motorja fölött (lásd `docs/dama-0a-specifikacio.md`, 6. szakasz) — Fázis 1-ben csak `HumanController` készül el, de az illesztési pont a kezdetektől adott.

**Döntés (2026-07-22, eldöntve):** mely játékok legyenek 3D-sek

- 2D/SVG: kártyajáték-klaszter (Snapszer, Römi, Mocsár, Holland kocsma, Bang stb.) és a party/reflex, deduction, kirakós jellegű játékok (Activity, Tabu, Dobble, Jungle Speed, Cluedo, Színözön, Connect 4)
- 3D biztos: Hotel, Gazdálkodj okosan, Monopoly, Catan (térbeli tábla-élmény hozzáadott értéket ad)
- Opcionális 3D (később mérlegelendő, nem blokkoló): Sakk, Malom, Dáma

---

## 2. Játékok csoportosítása (fejlesztési klaszterek)

Cél: közös motor-komponensek azonosítása, hogy az alapréteget egyszer építsük meg, utána játékspecifikus szabályokkal bővítsünk.

| Klaszter | Játékok | Közös komponensek |
|---|---|---|
| **A — Klasszikus kártyajátékok** | Snapszer, Römi, Mocsár, Holland kocsma, Bang | pakli/keverés, kéz-kezelés, húzó/dobó pakli, körvezérlés, ütés/lerakás logika; Bang esetén külön rejtett-szerep réteg (Sheriff/Deputy/Outlaw/Renegade) épül rá az alapmotorra |
| **B — Rácsos absztrakt stratégiai játékok** | Sakk, Dáma, Malom, Connect 4 | koordináta-rács, bábu-mozgatás/zseton-ejtés, lépésvalidáció, nincs rejtett infó; közös AI-ellenfél (minimax) lehetőség |
| **C — Gazdasági/dobókockás táblás játékok** | Hotel, Gazdálkodj okosan, Monopoly | pálya körbejárás, kockadobás, pénz/bank kezelés, ingatlan-tulajdon, kártyahúzás mezők |
| **D — Party/reflex játékok** | Activity, Tabu, Dobble, Jungle Speed | időzítő, gyors reakció, minimális tábla, real-time interakció fókusz |
| **E — Rejtett információs** | Hanabi, Ramses | Közös mag: szerver-oldali "teljes igazság" állapot, amiből minden kliens csak a neki járó, részleges nézetet kapja — jó teszt a state-sync számára. Hanabinél ez a saját kéz nem-látható (kooperatív, aszimmetrikus info); Ramses-nél a tábla 48 mezőjének rejtett tartalma (kincsek a piramisok alatt), ami játék közben fokozatosan, minden játékos számára egyformán tárul fel — versengő, nem kooperatív, és emellett egyedi mechanikákat is igényel (memória-elem, forgatható tábla, célkártyák), amik külön rétegként épülnek a közös "rejtett állapot" alapra, nem a teljes motorból származnak. |
| **F — Modern hobby társasjátékok** | Catan (kiegészítőkkel), King Arthur, Aqua Romana | hex/moduláris pálya, erőforrás-kezelés, kereskedés — komplexebb, moduláris pálya-builder szükséges. ⚠️ Multiplayer-integráció előtt lásd a "GameRoom mezőnkénti schema" emlékeztetőt lent. |
| **G — Egyedi komplex kártyajáték** | Gwent | A) klaszter kártyamotorjára épül, de bonyolultabb szabályrendszer (sorok, frakciók, képességek) |
| **H — Deduction/logikai játékok** | Cluedo, Színözön (Mastermind) | rejtett állapot + visszajelzés-alapú következtetési hurok (guess & feedback loop); Cluedo-nál vádemelés/rejtett kártyaelosztás, Színözönnél gép által generált rejtett szín-sorrend és találati visszajelzés |
| **I — Nagy komplexitású kampányos wargame** | Star Trek Fleet Captains | flotta-management, kampány, legösszetettebb — legvégére hagyandó. ⚠️ Multiplayer-integráció előtt lásd a "GameRoom mezőnkénti schema" emlékeztetőt lent. |

Minden játék besorolva — nincs függő tétel.

### Javasolt fejlesztési sorrend

**Döntés (2026-07-22):** a multiplayer réteg építését későbbre halasztjuk. Előbb egy tisztán helyi (single-player/hot-seat) vertikumot építünk fel, és csak utána csatlakoztatjuk rá a hálózati réteget. Ez csak akkor biztonságos, ha a játéklogika a kezdetektől **framework- és transport-agnosztikus reducer/state-machine** mintában készül (lásd `docs/dama-0a-specifikacio.md`) — így a helyi és a hálózati futtatás ugyanazt a motort használja, nincs újraírás.

1. **Fázis 0a – Local shell**: alkalmazás-váz, közös UI-kit (tábla-komponens, gomb/menü rendszer), moduláris betöltés (dynamic import) — **auth, lobby és online multiplayer nélkül**, csak helyi/hot-seat játékhoz szükséges minimum
2. **Fázis 1 – Proof of concept**: **Dáma**, teljes vertikum, tisztán helyi (hot-seat) módban — 2 fős, egyszerű szabály, nincs rejtett infó, jól teszteli a core engine / renderer szétválasztást
3. **Fázis 0b – Multiplayer réteg**: Colyseus-alapú szerver, lobby, fiók/auth, letöltéskezelő SW cache + PWA telepíthetőség; a Fázis 1-ben megépült Dáma motor hálózati Transport-adapterrel bővül (a reducer nem változik). **Terv és implementáció (lezárva, élesben ellenőrizve):** [dama-0b-multiplayer-specifikacio.md](./dama-0b-multiplayer-specifikacio.md) (2026-07-22, utolsó kiegészítés 2026-07-24) — meghívó-kód alapú auth, PostgreSQL+Prisma, `src/` átrendezése `shared`/`client`/`server` alá, valós idejű lobby, újracsatlakozás.
3b. **Fázis 0c – AI ellenfél**: szoba létrehozásakor választható Ember/AI ellenfél, szerver-oldali "virtuális kliens" AI (ugyanazon a validáció/reducer-csövön megy át, mint egy emberi lépés), szoba-jelszó és csatlakozási kérelem. **Terv és implementáció (lezárva, élesben ellenőrizve):** [dama-0c-ai-specifikacio.md](./dama-0c-ai-specifikacio.md) (2026-07-23).
4. **Fázis 2 (átsorolva, 2026-07-24) — Hotel, a C) klaszter első tagja.** A te döntésed alapján a Dáma után **nem** a soron következő legkisebb lépés (B/A klaszter bővítés) jön, hanem tudatosan a legnagyobb architekturális ugrás: a Hotel egyszerre igényel 3+ fős szobalogikát, 3D board renderert és (a state mérete miatt) a `GameRoom` mezőnkénti `@colyseus/schema`-ra váltását — ezekkel korán, egy alaposan letesztelt vertikumban érdemes megbirkózni, mielőtt sok játékra szétterítenénk a kockázatot. A korábbi Fázis 2/3 (B/A klaszter bővítés, Hanabi) **nem törölve, csak hátrébb sorolva** — lásd lent.
   - **Hotel-0a — helyi vertikum: IMPLEMENTÁLVA és LEZÁRVA (2026-07-24, a felhasználó élő böngészős tesztje nem talált több hibát).** Játékmotor (reducer/state, N-fős, pálya-bejárás/ingatlan-vásárlás/bérleti díj/árverés), 3D "loop-track" board renderer (Three.js/R3F, geometriai placeholder assetekkel), N-fős hot-seat mód (egy gépen körbeadva) — multiplayer és végleges assetek nélkül. Részletek: [hotel-0a-specifikacio.md](./hotel-0a-specifikacio.md) §9.
   - **Hotel-0b — multiplayer: IMPLEMENTÁLVA (2026-07-24), élő 3-kliens Colyseus/Postgres teszttel ellenőrizve.** `GameRoom` N-fős/action-tudatos validáció, per-mező `@colyseus/schema` szinkron, 300s reconnection, game-agnosztikus `useOnlineGameRoom` hook. Részletek: [hotel-0b-multiplayer-specifikacio.md](./hotel-0b-multiplayer-specifikacio.md).
   - **Hotel-0b — multiplayer réteg: IMPLEMENTÁLVA (2026-07-24), élő böngészős tesztre vár.** `GameRoom` negyedik generikus paraméterrel (`TColyseusState`) és `isActionAllowed(state, slot, action)` szerződéssel bővült (Dámánál viselkedés-azonos); teljes mezőnkénti `@colyseus/schema`-refaktor Hotelre (`HotelStateSchema`/`hotelStateCodec.ts` — statikus konfig-adat sosem megy a hálózaton, `log` `ArraySchema<string>`-ként); `DamaOnlineGamePage` ~250 sorából kiemelt, game-agnosztikus `useOnlineGameRoom` hook, `HotelOnlineGamePage` is erre épül; online UI nyílt információval, tárcsa csak saját körben aktív; reconnection-ablak 300s; game-agnosztikus `requestFullSync`/`fullSync`. Négy meglévő Dáma smoke teszt + egy új, élő 3-kliens Hotel smoke teszt mind zöld valódi szerver ellen — egy éles hibát is talált és javított (játékosnév sosem szinkronizálódott a placeholder után). Részletek: [hotel-0b-multiplayer-specifikacio.md §9](./hotel-0b-multiplayer-specifikacio.md).
   - **Hotel-0c.1 — assetek/UI/animáció: IMPLEMENTÁLVA.** Placeholder geometriai primitívek lecserélve a hibrid asset-stratégia szerint (kész CC0 elemek + egyedi/AI-generált ikonikus darabok), napló-vezérelt animáció-rendszer. Részletek: [hotel-0c-specifikacio.md](./hotel-0c-specifikacio.md), [hotel-animacio-specifikacio.md](./hotel-animacio-specifikacio.md).
   - **Hotel-0c.2 — valódi 3D modellek: FOLYAMATBAN, a felhasználó oldalán.** A 8 hotel-épület + autó valódi 3D beszkennelése/modellezése (fényképezés/Blender) nálad zajlik; a beillesztő komponensek (`ScannedModel.tsx`, `GLTFSceneObject.tsx`) már készen állnak, kódmódosítás nélkül felismerik a fájlokat, ha a megfelelő mappákba kerülnek.
   - **Hotel-0d — AI ellenfél: IMPLEMENTÁLVA.** Expectimax-alapú, heurisztikus kiértékelésű keresés, három nehézségi szint, online ÉS hot-seat módban egyaránt (ugyanaz a megosztott `shared/games/hotel/ai` döntéshozó logika, duplikálás nélkül). Részletek: [hotel-0d-ai-specifikacio.md](./hotel-0d-ai-specifikacio.md).
   - **Hotel-0d.2 (jövőbeli fázis):** csak-AI játékok tömeges lejátszása és elemzése a beépített naplózó rendszerrel — lásd [hotel-0d-ai-specifikacio.md §7](./hotel-0d-ai-specifikacio.md).
4b. **Ramses — a Hotel-0c.2 (valódi 3D modellek, a felhasználó saját feladata) mellett, párhuzamosan indított oldal-ág, az E) klaszter ("rejtett információs") első tagja.** Nem a fő számozott sorrend része, hanem a te döntésed alapján közben megkezdett munka.
   - **Ramses-0a — helyi vertikum: IMPLEMENTÁLVA (2026-07-27).** Motor (6×8 rács, csúsztatható piramisok, célkártya-húzás, a hivatalos szabálytól eltérő házi szabály: sikeres találat után a soron lévő játékos maga húz és folytat, csak rossz kincs adja át a kört), új `GridBoard3D` renderer (valódi R3F-kattintás, nem képernyő-overlay, mint Hotelnél), hot-seat UI, élő böngészős teszttel ellenőrizve. Részletek: [ramses-0a-specifikacio.md](./ramses-0a-specifikacio.md).
   - **Ramses-0b — multiplayer réteg: IMPLEMENTÁLVA és élesben ellenőrizve (2026-07-27), ugyanazon a napon, mint a tervezés.** A Dáma/Hotel multiplayer-infrastruktúrájának újrahasználata; az egyetlen ténylegesen új architekturális elem a rejtett-infó maszkolás (egy még-lefedett cella kincse sosem megy a drótra) — ez az E) klaszter besoroláskor megjósolt "rejtett állapot" teszt-eset első valódi próbája ebben a projektben, és egy valós biztonsági rést is feltárt/javított útközben (`GameRoom`'s `requestFullSync` mechanizmusa a nyers state-et küldte volna, ez ellen lett egy új `buildFullSyncPayload()` hook). Ellenőrizve: 35 vitest teszt, egy önálló séma-kódoló smoke teszt valós `@colyseus/schema` Encoder/Decoderrel, egy élő 2-kliens Colyseus/Postgres smoke teszt, és élő böngészős teszt két különálló bejelentkezett kliens között. Részletek: [ramses-0b-specifikacio.md](./ramses-0b-specifikacio.md).
   - **Ramses-0c — AI ellenfél: IMPLEMENTÁLVA és élesben ellenőrizve (2026-07-27), ugyanazon a napon, mint a tervezés.** A felhasználó tudatosan felcserélte a Hotel-mintát (ott 0c=assetek, 0d=AI, a hot-seat AI pedig csak utólag lett hozzácsatolva) — Ramses-nél a 0c maga az AI, és **kezdettől fogva egyben tervezve hot-seat + multiplayer módra**, egyetlen megosztott `shared/games/ramses/ai/` döntéshozó modullal. A projekt eddigi AI-jaitól (Dáma: állapot nélküli véletlen; Hotel: állapot nélküli expectimax) eltérően Ramses AI-jának **saját, a teljes játékon át megmaradó memóriára van szüksége** (mely mezőn milyen kincset látott korábban, szimulált felejtéssel is kiegészítve), mert a csúsztatás miatt egyszerre mindig csak EGY mező van felfedve. A felhasználó kérésére a maszkolás (`toPublicRamsesState`, Ramses-0b-ből) végül nem csak az AI-ra, hanem MINDEN fogyasztóra kiterjed: `RamsesGamePage` egy új `MaskedRamsesTransport`-tal mindig becsomagolja a kapott transportot, lezárva egy 0a óta nyitva álló rést (a hot-seat state addig teljesen nyersen, maszkolatlanul ült a böngésző JS-heapjében). Élő böngészős teszt közben egy valós React-hibát is talált és javított: a maszkoló wrapper eredetileg minden `getState()` hívásnál új objektumot hozott létre, megsértve a `useSyncExternalStore` cache-elt-snapshot szerződését, ami végtelen re-render hurkot okozott — javítva referencia-alapú cache-eléssel. **Utólag, a felhasználó kérésére, Hotel-0d mintájára**: `shared/games/ramses/ai/simulate.ts` + `npm run ai:simulate-ramses` csak-AI szimulációs eszköz — 27 játék, 589 253 lépés, 8,9 másodperc alatt lefutva megerősítette a szándékolt, monoton nehézségi létrát (HARD 71% > MEDIUM 33% > EASY 0% győzelmi arány), valódi hibát nem talált (szemben Hotel-0d-vel), a `FORGET_CHANCE` súlyok változatlanul hagyva — a pontos finomhangolás továbbra is a felhasználó saját playtesztelési feladata. Részletek: [ramses-0c-ai-specifikacio.md](./ramses-0c-ai-specifikacio.md) §7.1.
4c. **Dáma-0d — AI nehézségi szintek és B-klaszter UI egységesítés.** A felhasználó kérésére felvéve, két összetartozó, de külön tervezett feladat:
   - **AI nehézségi szintek — IMPLEMENTÁLVA és élesben (hot-seat ÉS online módban, élő böngészős teszttel) ellenőrizve (2026-07-28).** A korábbi, teljesen véletlenszerű, csak-online Dáma-AI-t (lásd [dama-0c-ai-specifikacio.md §6](./dama-0c-ai-specifikacio.md)) három nehézségi szint váltotta fel: minimax + alfa-béta keresés (nem expectimax, mert Dáma 2 fős/zéróösszegű/nincs véletlen vagy rejtett infó, szemben Hotel/Ramses-szel), a multiplayer ÉS a hot-seat AI egy közös `shared/games/dama/ai/` döntéshozó modulban (Ramses-0c mintáját követve). Új `DamaSetupPage.tsx` (hot-seat beállító képernyő, korábban nem létezett) és a lobby online AI-választója is bővült egy nehézség-mezővel (korábban Dámánál egyáltalán nem volt). Részletek: [dama-0d-ai-specifikacio.md §14](./dama-0d-ai-specifikacio.md).
   - **Dáma-0d.2 — csak-AI szimulációs hangolási kör: IMPLEMENTÁLVA és lefuttatva (2026-07-28), ugyanazon a napon, mint az alap-AI.** `shared/games/dama/ai/simulate.ts` + `npm run ai:simulate-dama`, Hotel-0d.2/Ramses-0c mintájára. **Valódi hibát talált és javított** (szemben Ramses-0c-vel, hasonlóan Hotel-0d-hez): a teljesen determinisztikus KÖZEPES szint két egyforma erősségű AI között egy pontos, 4 lépéses ismétlődő körbe ragadhatott (a motor nem ismer döntetlen-szabályt) — a felhasználó az AskUserQuestion-nel felkínált három megoldás közül a keresésen belüli véletlenszerű döntetlenség-feloldást választotta (`findBestMoveFixedDepth` mostantól véletlenszerűen választ az azonos pontszámú legjobb lépések közül, nem mindig az elsőt tartja meg) — ez a KÖZEPES vs KÖZEPES beragadást ebben a körben megszüntette, egy ritkább, csupasz király-végjátékokra korlátozódó maradék kockázatot hagyva, ami STRUKTURÁLISAN nem érintheti a valódi felhasználókat (a `GameRoom`/`DamaSetupPage` sosem enged két AI-t egymással szemben). A végleges köteg-futtatás (18 parti) megerősítette a szándékolt, monoton nehézségi létrát (NEHÉZ 58% > KÖZEPES 50% > KÖNNYŰ 25% győzelmi arány) — a kezdeti keresési mélységek/heurisztika-súlyok emiatt változatlanul maradtak, a pontos finomhangolás továbbra is a felhasználó saját playtesztelési feladata. Részletek: [dama-0d-ai-specifikacio.md §13](./dama-0d-ai-specifikacio.md).
   - **B-klaszter egységes UI ("Rács") — IMPLEMENTÁLVA és élesben ellenőrizve (2026-07-28).** Egységes vizuális nyelv a B) klaszter (Sakk, Dáma, Malom, Connect 4) tagjaihoz: a közös nevező maga a koordináta-rács, amin a bábuk mozognak, ezt veszi komolyan tábla-anyagként a dizájn (öregedett bronz/okker kiemelő szín, irodalmi szerif cím + mono koordináták, "berakott panel" tábla-keret — NEM a megszokott sakk.com zöld-krém paletta). Az irány egy Artifact-mockuppal lett előzetesen egyeztetve és jóváhagyva, mielőtt a valódi kódba került volna — a tokenek egy megosztott `clusterBTheme.module.css`-ben élnek, amit a `GridBoard2D` (minden jövőbeli rácsos játék közös tábla-renderere) és Dáma jelenlegi felülete (`DamaGamePage`/`DamaSetupPage`) is felhasznál, Hotel/Ramses/Lobby vizuálisan érintetlen. Részletek: [b-klaszter-ui-specifikacio.md](./b-klaszter-ui-specifikacio.md).
4d. **Játékfüggetlen UX-fejlesztések — TERVEZÉS ALATT (2026-07-29).** A felhasználó kérésére felvéve, négy, egymástól független, de közös infrastruktúrán osztozó shell-szintű fejlesztés: (1) játékszabály-modál minden játékhoz a mód-választó oldalon, (2) hibabejelentő/javaslat-küldő a menüből és játék közben is (utóbbinál a teljes elérhető kontextussal — állapot, játékosok, esemény napló, ahol a motor tárol ilyet), (3) a Lobby vegye fel az adott játék saját vizuális nyelvét, a főoldali játékválasztó viszont maradjon egységes, letisztult, dobozkép + név csempés elrendezésben, (4) a betöltő képernyő a jelenlegi puszta szöveg helyett az adott játék stílusához illeszkedjen. Közös alap mindhárom vizuális ponthoz: a B-klaszter `clusterBTheme.module.css` mintájának kiemelése egy tényleg megosztott, `gameId`-alapú téma-választó mechanizmussá. A fő nyitott pontok a felhasználóval egyeztetve lezárva (2026-07-29): helyettesítő dobozkép-csempével indulunk a valós fotókig, a hibabejelentő Prisma táblát kap, és Dáma/Ramses motorja is kap egy minimális eseménynaplót (nem csak Hotel) — implementáció még nem kezdődött el. Részletek: [shell-ux-specifikacio.md](./shell-ux-specifikacio.md).
5. **Fázis 3 (korábbi Fázis 2, hátrébb sorolva)**: B) klaszter bővítés (Sakk, Malom) vagy A) klaszter (Snapszer, Römi, Mocsár, Holland kocsma, Bang)
6. **Fázis 4 (korábbi Fázis 3, hátrébb sorolva)**: Hanabi (rejtett infó teszt)
7. **Fázis 5**: C) klaszter maradék tagjai (Gazdálkodj okosan, Monopoly) — ezekhez a Hotel-en megépült 3D/N-fős/AI infrastruktúra nagyrészt újrafelhasználható lesz
8. **Fázis 6+**: D), F), G), H) klaszterek, végül I) (Star Trek Fleet Captains)

---

## Nyitott kérdések / következő lépések

- [x] Eldönteni, mely játékok legyenek kifejezetten 3D-sek — **2026-07-22:** 3D biztos: Hotel, Gazdálkodj okosan, Monopoly, Catan; opcionális később: Sakk, Malom, Dáma; minden más 2D
- [x] Bang és Négy szín kirakós (ténylegesen: Connect 4 + Színözön) besorolása klaszterbe — **2026-07-22:** Bang → A) klaszter + rejtett-szerep réteg; Connect 4 → B) klaszter; Színözön → H) klaszter
- [x] 3D asset-beszerzési stratégia — **2026-07-22:** hibrid (kész CC0 asset generikus elemekhez + egyedi/AI-generált ikonikus darabokhoz); Fázis 0/1-ben egyszerű geometriai placeholder assetek
- [x] Godot alternatíva mérlegelése — **2026-07-22:** elhalasztva véglegesen, csak akkor kerül elő újra, ha a natív store jelenlét kritikus szemponttá válik
- [x] Multiplayer szerver-architektúra alapdöntés — **2026-07-22:** Colyseus mellett döntöttünk (kész szoba/state-sync keretrendszer, sématalapú állapot-szinkronizáció)
- [x] Fázis 0 (shell) részletes architektúra-terve, valamint a Colyseus-alapú multiplayer szerver-architektúra részletes kidolgozása — **elkészült és implementálva**, lásd [dama-0a-specifikacio.md](./dama-0a-specifikacio.md) és [dama-0b-multiplayer-specifikacio.md](./dama-0b-multiplayer-specifikacio.md)
- [x] **A `GameRoom` mezőnkénti `@colyseus/schema`-ra váltása (eredetileg 2026-07-23-i emlékeztető) — Hotel-0b feladata, döntés megszületett 2026-07-24-én.** A jelenlegi Dáma-implementáció opaque JSON state-et küld (egyszerű, de nem hálózat-hatékony 3+ fős/nagy state-ű játékokhoz); Hotel-0b elvégzi a teljes mezőnkénti refaktort (`GameRoom` új negyedik generikus paramétert kap a Colyseus state-típusra). Részletek: [hotel-0b-multiplayer-specifikacio.md §6](./hotel-0b-multiplayer-specifikacio.md).
- [x] Hotel pontos szabályai (pálya, kezdőtőke, bérleti díjak, részvény-mechanika stb.) — **2026-07-24:** egyelőre egy általánosan ismert Hotel-változatból indultunk (lásd [hotel-0a-specifikacio.md](./hotel-0a-specifikacio.md) "Feltételezett szabályváltozat" szakasza). **2026-07-26: a felhasználó átnézte és kipróbálta a szabályokat a fizikai példánya alapján, megerősítve lezárva** — apró hangolás még előfordulhat, de az alapszabályok helyesek.

---

## Beszélgetés kontextusa

Ez a dokumentum az eddigi tervezési beszélgetés összefoglalója, folyamatosan frissítve. Állapot 2026-07-24: Fázis 0a/0b/0c (Dáma — helyi vertikum, multiplayer réteg, AI ellenfél) lezárva, implementálva, élesben ellenőrizve. Folyamatban: Fázis 2 (Hotel) — a fejlesztési sorrendben tudatosan előre hozva, mert a legnagyobb architekturális ugrást jelenti (3+ fő, 3D renderer, schema-refaktor), lásd a fejlesztési sorrend 4. pontját és [hotel-0a-specifikacio.md](./hotel-0a-specifikacio.md).