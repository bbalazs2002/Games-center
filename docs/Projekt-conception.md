# Társasjáték Digitalizáló Platform — Projekt Koncepció

**Státusz:** Dáma (0a/0b/0c/0d/0d.2), Hotel (0a/0b/0c.1/0d) és Ramses (0a/0b/0c/speciális kártyák/0d) élesben fut a `balazs.gyserver.domenet.info/game-center` alatt; Gwent-0a.1 (deck-építés), Gwent-0a.2 (parti-motor + 2D hot-seat UI), Gwent-0b (multiplayer + játékos-specifikus rejtett infó, mindkét módban kikényszerítve) ÉS Gwent-0c (középkori kocsma vizuális redesign + kártyamozgás-animációk) is kész, csak lokálisan (még nincs deploy-olva/élesítve az `ENABLED_GAMES` build-argon keresztül). A teljes, kronologikus fejlesztési napló → lásd **"Fejlesztés menete"** lent. Hátralévő: Hotel-0c.2 (valódi 3D modellek, a felhasználó oldalán), Hotel-0d.2 (jövőbeli fázis), valós dobozfotók a játékválasztóhoz, Gwent-0d (AI ellenfél, jövőbeli fázis). Alacsony prioritású, játék-független backlog: hangok/audio a játékokhoz.
**Utolsó frissítés:** 2026-08-04

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

Hotel, Gazdálkodj okosan, Bang, Hanabi, Sakk, Malom, Dáma, Connect 4 (4 in a row), Színözön (Mastermind), Catan telepesei (kiegészítőkkel), Gwent (Witcher 3 verzió), Monopoly, Cluedo, Aqua Romana, Activity, Tabu, King Arthur, Jungle Speed, Dobble, Snapszer, Römi, Mocsár, Holland kocsma, Star Trek Fleet Captains, Ramses, Torpedó, Aranyásók, 2 lapos póker, 5 lapos póker, Himalája, Ladders and snakes, Kertvárosi kémek, Mars terraformálása, Vigyázz 6!, Solo, Uno, Uno Flip (bővíthető lista)

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
| **A — Klasszikus kártyajátékok** | Snapszer, Römi, Mocsár, Holland kocsma, Bang, Aranyásók, 2 lapos póker, 5 lapos póker, Himalája, Vigyázz 6! | pakli/keverés, kéz-kezelés, húzó/dobó pakli, körvezérlés, ütés/lerakás logika; Bang ÉS Aranyásók esetén külön rejtett-szerep réteg épül rá az alapmotorra (Bang: Sheriff/Deputy/Outlaw/Renegade; Aranyásók: aranyásók/szabotőrök titkos csapatai) |
| **B — Rácsos absztrakt stratégiai játékok** | Sakk, Dáma, Malom, Connect 4 | koordináta-rács, bábu-mozgatás/zseton-ejtés, lépésvalidáció, nincs rejtett infó; közös AI-ellenfél (minimax) lehetőség |
| **C — Gazdasági/dobókockás táblás játékok** | Hotel, Gazdálkodj okosan, Monopoly, Ladders and snakes | pálya körbejárás, kockadobás, pénz/bank kezelés, ingatlan-tulajdon, kártyahúzás mezők; Ladders and snakes csak a pálya-bejárás/kockadobás alapréteget osztja, gazdasági/tulajdon-mechanika nélkül |
| **D — Party/reflex játékok** | Activity, Tabu, Dobble, Jungle Speed | időzítő, gyors reakció, minimális tábla, real-time interakció fókusz |
| **E — Rejtett információs** | Hanabi, Ramses | Közös mag: szerver-oldali "teljes igazság" állapot, amiből minden kliens csak a neki járó, részleges nézetet kapja — jó teszt a state-sync számára. Hanabinél ez a saját kéz nem-látható (kooperatív, aszimmetrikus info); Ramses-nél a tábla 48 mezőjének rejtett tartalma (kincsek a piramisok alatt), ami játék közben fokozatosan, minden játékos számára egyformán tárul fel — versengő, nem kooperatív, és emellett egyedi mechanikákat is igényel (memória-elem, forgatható tábla, célkártyák), amik külön rétegként épülnek a közös "rejtett állapot" alapra, nem a teljes motorból származnak. |
| **F — Modern hobby társasjátékok** | Catan (kiegészítőkkel), King Arthur, Aqua Romana, Mars terraformálása | hex/moduláris pálya, erőforrás-kezelés, kereskedés — komplexebb, moduláris pálya-builder szükséges. ⚠️ Multiplayer-integráció előtt lásd a "GameRoom mezőnkénti schema" emlékeztetőt lent. |
| **G — Egyedi komplex kártyajáték** | Gwent | A) klaszter kártyamotorjára épül, de bonyolultabb szabályrendszer (sorok, frakciók, képességek) |
| **H — Deduction/logikai játékok** | Cluedo, Színözön (Mastermind), Torpedó, Kertvárosi kémek | rejtett állapot + visszajelzés-alapú következtetési hurok (guess & feedback loop); Cluedo-nál vádemelés/rejtett kártyaelosztás, Színözönnél gép által generált rejtett szín-sorrend és találati visszajelzés, Torpedónál klasszikus rejtett-flotta koordináta-találgatás, Kertvárosi kémeknél 2 fős kártya-blöff + pálya-nyomkövetés (szociális dedukció) |
| **I — Nagy komplexitású kampányos wargame** | Star Trek Fleet Captains | flotta-management, kampány, legösszetettebb — legvégére hagyandó. ⚠️ Multiplayer-integráció előtt lásd a "GameRoom mezőnkénti schema" emlékeztetőt lent. |

Minden játék besorolva — nincs függő tétel.

## Fejlesztés menete

Nyitott végű, kronologikus napló — **új lépés hozzáadásakor egyszerűen írj egy új bullet pontot a lista végére** (dátummal, státusszal, és linkkel a részletes specifikációra). A blow-by-blow részletek a hivatkozott dokumentumokban élnek, itt csak egy-két mondatos összefoglaló van soronként.

**Alapelv (2026-07-22, végig érvényes):** a multiplayer réteg mindig későbbre marad — előbb egy tisztán helyi (hot-seat) vertikum, csak utána a hálózati réteg, ugyanazon a framework-/transport-agnosztikus `(state, action) → new state` reducer-motoron (lásd `docs/dama-0a-specifikacio.md`).

- **Fázis 0a — Local shell**: alkalmazás-váz, közös UI-kit, moduláris betöltés, auth/lobby/multiplayer nélkül. IMPLEMENTÁLVA.
- **Fázis 1 — Dáma** (proof of concept, teljes helyi/hot-seat vertikum, 2 fő, nincs rejtett infó). IMPLEMENTÁLVA.
- **Fázis 0b — Multiplayer réteg**: Colyseus szerver, meghívó-kód auth, PostgreSQL+Prisma, `shared`/`client`/`server` szétválasztás. IMPLEMENTÁLVA, élesben ellenőrizve. → [dama-0b-multiplayer-specifikacio.md](./dama-0b-multiplayer-specifikacio.md)
- **Fázis 0c — AI ellenfél (Dáma)**: szerver-oldali "virtuális kliens" AI, ugyanazon a validáció/reducer-csövön mint egy emberi lépés. IMPLEMENTÁLVA, élesben ellenőrizve. → [dama-0c-ai-specifikacio.md](./dama-0c-ai-specifikacio.md)
- **Fázis 2 — Hotel** (a C klaszter első tagja; tudatosan előre hozva a Dáma után, mert egyszerre igényel 3+ fős szobalogikát, 3D renderert és mezőnkénti schema-szinkront):
  - Hotel-0a (helyi vertikum, 3D "loop-track" renderer, N-fős hot-seat). IMPLEMENTÁLVA. → [hotel-0a-specifikacio.md](./hotel-0a-specifikacio.md)
  - Hotel-0b (multiplayer, mezőnkénti `@colyseus/schema`, game-agnosztikus `useOnlineGameRoom` hook). IMPLEMENTÁLVA, élő 3-kliens teszttel ellenőrizve. → [hotel-0b-multiplayer-specifikacio.md](./hotel-0b-multiplayer-specifikacio.md)
  - Hotel-0c.1 (végleges assetek, napló-vezérelt animáció-rendszer). IMPLEMENTÁLVA. → [hotel-0c-specifikacio.md](./hotel-0c-specifikacio.md), [hotel-animacio-specifikacio.md](./hotel-animacio-specifikacio.md)
  - Hotel-0c.2 (valódi 3D modellek — fényképezés/Blender). FOLYAMATBAN, a felhasználó oldalán.
  - Hotel-0d (AI ellenfél, expectimax, 3 nehézségi szint, hot-seat+online közös logikával). IMPLEMENTÁLVA. → [hotel-0d-ai-specifikacio.md](./hotel-0d-ai-specifikacio.md)
  - Hotel-0d.2 (csak-AI tömeges lejátszás/elemzés). Jövőbeli fázis. → [hotel-0d-ai-specifikacio.md §7](./hotel-0d-ai-specifikacio.md)
- **Ramses** (E klaszter első tagja, oldal-ág a Hotel-0c.2 mellett):
  - Ramses-0a (helyi vertikum, 6×8 rács, csúsztatható piramisok, `GridBoard3D` renderer). IMPLEMENTÁLVA. → [ramses-0a-specifikacio.md](./ramses-0a-specifikacio.md)
  - Ramses-0b (multiplayer, rejtett-infó maszkolás — a projekt első valódi "rejtett állapot" próbája). IMPLEMENTÁLVA, élesben ellenőrizve. → [ramses-0b-specifikacio.md](./ramses-0b-specifikacio.md)
  - Ramses-0c (AI ellenfél, saját memória-modell, kezdettől hot-seat+online egyben tervezve; utólag `ai:simulate-ramses` hangoló eszköz). IMPLEMENTÁLVA. → [ramses-0c-ai-specifikacio.md §7.1](./ramses-0c-ai-specifikacio.md)
  - Speciális kártyák (Homokvihar, Ajándék, Kockázat, Sivatagi póker, Fata Morgana, Záró). IMPLEMENTÁLVA. → [ramses-0a-specifikacio.md §8](./ramses-0a-specifikacio.md)
  - Ramses-0d (playtest-javítási kör — feladás funkció, AI-finomítás, egy kritikus multiplayer szinkron-hiba javítása). IMPLEMENTÁLVA, élesben ellenőrizve. → [ramses-0a-specifikacio.md §9](./ramses-0a-specifikacio.md)
- **Dáma-0d** (AI nehézségi szintek + B-klaszter UI egységesítés):
  - AI nehézségi szintek (minimax+alfa-béta, közös `shared/games/dama/ai/`, hot-seat+online). IMPLEMENTÁLVA. → [dama-0d-ai-specifikacio.md §14](./dama-0d-ai-specifikacio.md)
  - Dáma-0d.2 (csak-AI hangolási kör — egy determinisztikus-holtpont hibát is javítva). IMPLEMENTÁLVA. → [dama-0d-ai-specifikacio.md §13](./dama-0d-ai-specifikacio.md)
  - B-klaszter egységes UI ("Rács" — Sakk, Dáma, Malom, Connect 4 közös vizuális nyelve). IMPLEMENTÁLVA. → [b-klaszter-ui-specifikacio.md](./b-klaszter-ui-specifikacio.md)
- **Játékfüggetlen UX-fejlesztések**: játékszabály-modál, hibabejelentő (menüből és játékon belülről is), `gameId`-alapú Lobby-téma, témázott betöltőképernyő. IMPLEMENTÁLVA, élesben ellenőrizve. → [shell-ux-specifikacio.md §10](./shell-ux-specifikacio.md)
- **Éles béta telepítés**: Apache2+Docker a felhasználó szerverén, `ENABLED_GAMES` kapcsoló, közös `shared-postgres`, GitHub Actions deploy-workflow. IMPLEMENTÁLVA, élesben fut (`balazs.gyserver.domenet.info/game-center`, mindhárom játék). → [deployment-specifikacio.md](./deployment-specifikacio.md)
- **Gwent** (G klaszter egyetlen tagja, oldal-ág — a Witcher 3 beépített mini-játéka, NEM az önálló CDPR kártyajáték, Skellige egyelőre nélkül):
  - Gwent-0a tervezés (motor-adatmodell, kártya-/vezér-katalógus terve). LEZÁRVA (2026-07-30). → [gwent-0a-specifikacio.md](./gwent-0a-specifikacio.md)
  - Gwent-0a.1 (deck-építés — kártya-adatbázis pipeline 134 kártya+20 vezérre, `CardGrid`/`deckRules.ts`, playtest-javítási kör, majd egy teljes kártyaszöveg-kutatási kör az összes kártyára/vezérre). IMPLEMENTÁLVA (2026-07-31, kiegészítve 2026-08-01). → [gwent-0a-specifikacio.md §9](./gwent-0a-specifikacio.md)
  - Gwent-0a.2 (a tényleges parti-motor: state/reducer/action-ok, mind a 20 vezér-képesség, 2D hot-seat board UI). IMPLEMENTÁLVA (2026-08-04). → [gwent-0a-specifikacio.md §10](./gwent-0a-specifikacio.md)
  - Gwent-0b (online multiplayer + játékos-specifikus rejtett kéz/pakli kikényszerítése — szerver-oldalon online módban, "add tovább a gépet" kapuval helyi hot-seat módban). IMPLEMENTÁLVA (2026-08-03), élő 2-kliens smoke teszttel ellenőrizve. → [gwent-0b-multiplayer-specifikacio.md](./gwent-0b-multiplayer-specifikacio.md)
  - Gwent-0c (középkori kocsma vizuális redesign: fa asztallap/pergamen téma, valódi kártyahát-képek, `DeckPile`/`DiscardPile`, `token-crystal.png` életjelzők, sor-/tábla-tükrözés a fizikai táblarajz szerint, tábla-forgatás helyi módban, `@react-spring/web`-alapú kártyamozgás-animáció). IMPLEMENTÁLVA (2026-08-04), élő Playwright-ellenőrzéssel igazolva. → [gwent-0c-vizualis-animacio-specifikacio.md](./gwent-0c-vizualis-animacio-specifikacio.md)
  - Gwent-0c.1 (a 0c-s dizájnra adott 21 pontos visszajelzés: sötétebb/díszesebb kocsma-téma, kártya-nagyítás mindenhol (tábla/dobott lapok/vezér/kijátszás-/csere-előnézet), sor-választás táblára kattintva, témázott modálok/inputok, játéknapló, kártya-repülés skálázása, online mód fix alsó-oldal). IMPLEMENTÁLVA (2026-08-04), élő Playwright-ellenőrzéssel igazolva. → [gwent-0c.1-vizualis-finomhangolas-specifikacio.md](./gwent-0c.1-vizualis-finomhangolas-specifikacio.md)
- **Hátrasorolt, még nem kezdett fázisok** (a sorrend nem végleges, playtest-tapasztalat alapján bármikor módosulhat):
  - B) klaszter bővítés (Sakk, Malom) vagy A) klaszter (Snapszer, Römi, Mocsár, Holland kocsma, Bang, Aranyásók, 2/5 lapos póker, Himalája, Vigyázz 6!)
  - Hanabi (rejtett infó teszt, E klaszter)
  - C) klaszter maradék tagjai (Gazdálkodj okosan, Monopoly, Ladders and snakes) — a Hotel-en megépült 3D/N-fős/AI infrastruktúra nagyrészt újrafelhasználható
  - D) klaszter (Activity, Tabu, Dobble, Jungle Speed), F) klaszter maradék tagjai (King Arthur, Aqua Romana, Mars terraformálása), H) klaszter (Cluedo, Színözön, Torpedó, Kertvárosi kémek), végül I) (Star Trek Fleet Captains)
  - Alacsony prioritású, játék-független backlog: hangok/audio a játékokhoz (jegyzet, 2026-07-31)

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

