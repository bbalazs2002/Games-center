# Társasjáték Digitalizáló Platform — Projekt Koncepció

**Státusz:** Tervezési fázis — alapkérdések lezárva, Fázis 0 architektúra-terv következik
**Utolsó frissítés:** 2026-07-22

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
  - `docs/` — tervezési dokumentumok és diagramok (ez a fájl is itt van)
  - `temp/` — átmeneti fájlok: ide kerülnek a Claude által generált, még átnézésre váró fájlok, valamint a felhasználó által Claude-nak adott bemeneti fájlok (debug infó, instrukciók stb.); nem verziózott tartalom (`.gitignore`-ban kizárva)
  - `.git/` — GitHub-integráció
  - további elemek várhatók a gyökérben a projekt előrehaladtával
- **Diagramok:** PlantUML használandó minden tervezési diagramhoz (`docs/` alá kerülnek).
- **Kódminőségi elvek:** SOLID alapelvek és Clean Code gyakorlatok követése kötelező az implementáció során.
- **Munkafolyamat:** implementáció előtt gondos tervezés — specifikáció és diagramok készülnek, mielőtt kód íródik. Nem megyünk bele kódolásba tervezési dokumentáció nélkül egy adott feature/modul esetén.

## Játéklista (kiindulás)

Hotel, Gazdálkodj okosan, Bang, Hanabi, Sakk, Malom, Dáma, Connect 4 (4 in a row), Színözön (Mastermind), Catan telepesei (kiegészítőkkel), Gwent (Witcher 3 verzió), Monopoly, Cluedo, Aqua Romana, Activity, Tabu, King Arthur, Jungle Speed, Dobble, Snapszer, Römi, Mocsár, Holland kocsma, Star Trek Fleet Captains, (bővíthető lista)

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
| **E — Rejtett információs kooperatív** | Hanabi | aszimmetrikus infó architektúra (saját kéz nem látható) — jó teszt a state-sync számára |
| **F — Modern hobby társasjátékok** | Catan (kiegészítőkkel), King Arthur, Aqua Romana | hex/moduláris pálya, erőforrás-kezelés, kereskedés — komplexebb, moduláris pálya-builder szükséges |
| **G — Egyedi komplex kártyajáték** | Gwent | A) klaszter kártyamotorjára épül, de bonyolultabb szabályrendszer (sorok, frakciók, képességek) |
| **H — Deduction/logikai játékok** | Cluedo, Színözön (Mastermind) | rejtett állapot + visszajelzés-alapú következtetési hurok (guess & feedback loop); Cluedo-nál vádemelés/rejtett kártyaelosztás, Színözönnél gép által generált rejtett szín-sorrend és találati visszajelzés |
| **I — Nagy komplexitású kampányos wargame** | Star Trek Fleet Captains | flotta-management, kampány, legösszetettebb — legvégére hagyandó |

Minden játék besorolva — nincs függő tétel.

### Javasolt fejlesztési sorrend

1. **Fázis 0 – Shell**: alkalmazás-váz, lobby, fiók/auth, letöltéskezelő (code-splitting + SW cache), közös UI-kit (kártya-komponens, tábla-komponens, gomb/menü rendszer)
2. **Fázis 1 – Proof of concept**: egy egyszerű játék teljes vertikuma (javaslat: **Dáma** — 2 fős, egyszerű szabály, nincs rejtett infó, jól teszteli a multiplayer sync-et)
3. **Fázis 2**: B) klaszter bővítés (Sakk, Malom) vagy A) klaszter (Snapszer, Römi, Mocsár, Holland kocsma)
4. **Fázis 3**: Hanabi (rejtett infó teszt)
5. **Fázis 4**: C) klaszter (Hotel, Gazdálkodj okosan, Monopoly) — itt dől el a 3D board renderer bevezetése
6. **Fázis 5+**: D), F), G), H) klaszterek, végül I) (Star Trek Fleet Captains)

---

## Nyitott kérdések / következő lépések

- [x] Eldönteni, mely játékok legyenek kifejezetten 3D-sek — **2026-07-22:** 3D biztos: Hotel, Gazdálkodj okosan, Monopoly, Catan; opcionális később: Sakk, Malom, Dáma; minden más 2D
- [x] Bang és Négy szín kirakós (ténylegesen: Connect 4 + Színözön) besorolása klaszterbe — **2026-07-22:** Bang → A) klaszter + rejtett-szerep réteg; Connect 4 → B) klaszter; Színözön → H) klaszter
- [x] 3D asset-beszerzési stratégia — **2026-07-22:** hibrid (kész CC0 asset generikus elemekhez + egyedi/AI-generált ikonikus darabokhoz); Fázis 0/1-ben egyszerű geometriai placeholder assetek
- [x] Godot alternatíva mérlegelése — **2026-07-22:** elhalasztva véglegesen, csak akkor kerül elő újra, ha a natív store jelenlét kritikus szemponttá válik
- [x] Multiplayer szerver-architektúra alapdöntés — **2026-07-22:** Colyseus mellett döntöttünk (kész szoba/state-sync keretrendszer, sématalapú állapot-szinkronizáció)
- [ ] Fázis 0 (shell) részletes architektúra-terv: mappastruktúra, komponens-hierarchia, tech stack pontos verziói — **következő munkamenet témája**
- [ ] Multiplayer szerver-architektúra részletes kidolgozása Colyseus-szal: szoba-modell, state schema, reconnect-kezelés

---

## Beszélgetés kontextusa

Ez a dokumentum az eddigi tervezési beszélgetés összefoglalója. A 2026-07-22-i munkamenetben az alapvető nyitott kérdések lezárultak (3D-s játékok köre, klaszterbe sorolás, asset-stratégia, Godot, szerver-architektúra alapdöntés). Következő session-ben ebből kiindulva folytatható a munka — javasolt kezdőpont: a Fázis 0 (shell) részletes architektúra-terve (mappastruktúra, komponens-hierarchia, tech stack pontos verziói), illetve a Colyseus-alapú multiplayer szerver-architektúra részletes kidolgozása.