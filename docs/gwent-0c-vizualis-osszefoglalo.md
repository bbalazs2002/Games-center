# Gwent — vizuális réteg, összefoglaló állapot (0c–0c.4 összevonva)

Ez a dokumentum az öt korábbi kör (`gwent-0c`, `-0c.1`, `-0c.2`, `-0c.3`, `-0c.4`) tömörített, egységes állapot-leirata. A régi, kör-szerinti specifikációs fájlokat felváltja — a részletes, lépésenkénti tervezési indoklás a git-történelemben (`git log -- docs/gwent-0c*`) elérhető marad, ha kell.

**Célja**: alapot adni egy teljesen új vizuális irány tervezéséhez — leírja, MI van most, hogy a redesign tudja, mit örököl/dob el.

## 1. Mi épült meg körönként (rövid history)

- **0c** — alapok: középkori kocsma téma (CSS-gradiensekkel, kép-textúra nélkül), valódi kártyahát-képek, `DeckPile`/`DiscardPile`/`LifeTokens` (`token-crystal.png`), 3-oszlopos tábla-elrendezés (bal: Vezér+élet; közép: 3 sor, Melee a középvonalnál; jobb: Húzópakli+Dobott lapok), kártyamozgás FLIP-animáció (`@react-spring/web`), helyi módban forgó tábla (mindig a lépő fél alul).
- **0c.1** — sötétebb/díszesebb újrafestés (a felhasználó `assets/Gwent/style-samples/` referenciái alapján), témázott modálok, kártya-nagyítás mindenhol (kéz/tábla/dobott lapok/vezér), sor-választás közvetlenül a táblára kattintva (a korábbi gomb-sor helyett), lebegő UI-gombok margója, magyar játéknapló (`GwentLogPanel`).
- **0c.2** — valódi háttérkép (`medieval-tavern-background.jpg`, `GwentBackdrop.tsx`), teljes magyarítás (`cardTextTranslations.ts`, ~154 lap), kéz-legyező (`useHandFan`), nincs oldal-szintű görgetés, dobott lapok teljes listája (`DiscardPileModal`), Horn-oszlop ikon+ABC-sorrend a soron.
- **0c.3** — apró hibajavítások: frakciónkénti pakli-mentés, Scoia'tael "csak 1. körben dönthet" szabály, `StartingChoiceScreen` gombköz, kép-előtöltés, monokróm SVG ikonok emoji helyett.
- **0c.4** — mérkőzés-előkészítés egy oldalon, `CardCountGrid` mindig-látszó +/− léptetők, LeaderAbilityPanel egyszerűsítés (leírás törölve, céllapok képpel), és több valódi motorhiba (Spy sor-kiemelés, Toborzás-animáció, Kürt a soron marad, Medic-feltámasztás teljes on-play újralejátszása beágyazott lánccal, Időjárás/Sor felperzselés lapok kijátszhatósága).

## 2. Jelenlegi téma-rendszer (`gwentTheme.module.css`)

Hotel/Ramses mintát követő `.theme` osztály, `--shell-*` egyéni CSS-tulajdonságokkal (a board-UI mindenhol `var(--shell-x, fallback)`-ként olvassa):

| Token | Jelenlegi érték | Szerep |
|---|---|---|
| `--shell-ground` | rétegzett `radial-gradient` gyertyafény-foltok + vinyetta, a `GwentBackdrop` fotó fölé | alap háttér-tónus |
| `--shell-surface` | meleg okker `linear-gradient` (`#e2d3ab`→`#d0b989`→`#dcc79a`) foltos highlightokkal | "pergamen" felület (panelek, kártya-adatlap) |
| `--shell-ink` / `--shell-ink-parchment` | `#2b1a0d` sötétbarna / `#f4e8ca` krém | szöveg pergamenen / szöveg sötét alapon |
| `--shell-accent` | `#d4af37` arany | elsődleges kiemelés |
| `--shell-accent-secondary` | `#7a1620` mély vörös | másodlagos díszítő szín |
| `--shell-line` | `#150c04` közel fekete | szegélyek |
| `--shell-shadow-deep` / `--shell-shadow-lifted` | többrétegű `box-shadow` | 3D-hatás emelt felületeken |
| `--gwent-display-font` | `'Iowan Old Style', Palatino, 'URW Palladio L', Georgia, serif` | RENDSZER-betűkészlet stack, nincs egyedi webfont |

**Háttérkép** (`GwentBackdrop.tsx`): `assets/Gwent/style-samples/medieval-tavern-background.jpg` egy `position: fixed` rétegben, `blur(7px) brightness(0.42) saturate(1.15)`. **Ismert gyengeség**: a forrás fotó natív felbontása mindössze 426×240 (hangulat-referencia kép, nem gyártásra szánt asset) — a blur ezt takarja el, de nagy/éles kijelzőn ez limitáló tényező.

## 3. Tábla-elrendezés

Minden `PlayerBoardZone` azonos 3-oszlopos váz (`assets/Gwent/Gwent-Board-Outlines.pdf` alapján), a `topPlayer`/`bottomPlayer` között tükrözve a középvonal mentén:
- **Bal**: `LeaderAbilityPanel` + `LifeTokens` (kristály-ikonok).
- **Közép**: 3 `BoardRow` (Melee/Ranged/Siege), a Melee mindig a középvonalhoz legközelebb.
- **Jobb**: `DeckPile` (a sorok felőli végén) + `DiscardPile` (a külső szélen).

Megosztott `.weatherBar` a két Vezér-oszlop között. Helyi hot-seat módban a tábla forog (`bottomViewerId`), hogy mindig a lépő fél lássa magát alul; online módban fix (`myPlayer` szerint).

## 4. Komponens-leltár (`src/client/games/gwent/ui/`)

- **`gwentTheme.module.css`** — a fenti token-rendszer.
- **`GwentBackdrop.tsx`** — háttérkép-réteg.
- **`board/DeckPile.tsx`**, **`board/DiscardPile.tsx`** (+ `.module.css`) — rétegzett kártya-stack vizualizáció, darabszám-jelvénnyel.
- **`board/DiscardPileModal.tsx`** — dobott lapok teljes listája.
- **`board/LifeTokens.tsx`** (+ `.module.css`) — `token-crystal.png` élet-jelzők.
- **`board/GwentLogPanel.tsx`** + **`board/formatGwentLogEntry.ts`** — magyar játéknapló.
- **`board/boardIcons.tsx`** — monokróm SVG ikonok (`TrophyIcon`, `HandCardsIcon`, `EyeIcon`) emoji helyett.
- **`board/cardFlight.tsx`** (+ `.module.css`) — a repülés-animáció motorja: `CardFlightProvider` + `instanceId`-alapú pozíció-diff (FLIP), log-alapú forrás/cél-felismerés (`CARDS_DRAWN`, `MEDIC_REVIVED`, `MUSTER_TRIGGERED`, `SCORCH_RESOLVED` stb.).
- **`board/useHandFan.ts`** — kéz-legyező dinamikus átfedés-számítás, `needsScroll` túlcsordulás-védelemmel.
- **`CardDetailModal.tsx`** / **`board/LeaderDetailModal.tsx`** (+ `.module.css`) — nagyított kártya/vezér-nézet, magyar képesség-magyarázat sávval.
- **`CardCountGrid.tsx`** — pakli-építő rács, mindig látszó +/− léptetőkkel.
- **`cardBackPaths.ts`** — frakciónkénti kártyahát-kép elérési utak.
- **`board/matchBoard.module.css`**, **`GwentSetupPage.module.css`**, **`GwentGamePage.module.css`** — a fennmaradó, komponensekhez közvetlenül nem kötött elrendezési/vizuális szabályok.

## 5. Ismert korlátok — kiindulópont az újratervezéshez

A felhasználó szerint az öt kör után a felület összességében **nem adja vissza az eredeti Gwent hangulatát**. Konkrét, azonosítható gyenge pontok:

- A háttérkép egy 426×240-es, elmosott hangulat-referencia, nem valódi produkciós textúra.
- A "kocsma" hangulat nagy része CSS-gradiensekkel (nem valódi anyag-textúrával) van megoldva — fa/pergamen/kovácsoltvas mind szintetikus gradiens, nincs kép-alapú textúra mögötte.
- Rendszer-betűkészlet stack, nincs karakteres, egyedi megjelenésű cím-tipográfia.
- Az arany-a-sötét-alapon + pergamen-panelek kombináció több körön át inkrementálisan rakódott egymásra (öt kör foltozása), nem egy tudatos, egyben megtervezett vizuális identitásból indult.

## 6. Következő lépés

Ez a dokumentum a leltár — a tényleges új vizuális irány (paletta, tipográfia, elrendezés, esetleges új asset-igény) külön tervben készül, ugyanazon "terv előbb `docs/`-ba" konvenció szerint.
