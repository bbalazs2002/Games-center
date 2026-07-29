# B-klaszter — Specifikáció: egységes vizuális nyelv ("Rács")

**Státusz:** IMPLEMENTÁLVA és élesben (élő böngészős teszttel, hot-seat módban, keskeny és széles nézetben egyaránt) ellenőrizve — lásd 9. szakasz.
**Utolsó frissítés:** 2026-07-28
**Kapcsolódik:** [Projekt-conception.md](./Projekt-conception.md) (roadmap-tétel 4c, második fele), [dama-0a-specifikacio.md](./dama-0a-specifikacio.md) (a jelenlegi Dáma UI, amiből ez a terv kiindul)

## 1. Cél és hatókör

**Kérés:** letisztult, modern, de szép közös vizuális környezet a B) klaszter (Sakk, Dáma, Malom, Connect 4 — "rácsos absztrakt stratégiai játékok") tagjaihoz, Dáma jelenlegi felülete alapján kialakítva, úgy hogy a klaszter később következő tagjai (Fázis 3) ne külön-külön, hanem egy közös vizuális/komponens-alapra épülve készüljenek.

**Tervezési irány ("Rács"):** a négy klaszter-játék közös nevezője nem a téma, hanem maga a koordináta-rács, amin a bábuk mozognak — a vizuális nyelv ezt veszi komolyan tábla-anyagként, mértani pontossággal, dísz nélkül. Részletesen kidolgozva és jóváhagyva egy Artifact-mockupban (2026-07-28) — a lenti tokenek onnan származnak.

**Hatókörben van:**
- Megosztott dizájn-tokenek (szín, tipográfia, térköz) egy új, megosztott stíluslapban (lásd 3. szakasz).
- `GridBoard2D` (a `src/client/renderers/grid-2d/` alatti, MINDEN rácsos játék által újrahasznált tábla-renderer) vizuális felújítása — tábla-keret ("berakott panel" hatás), mező-színek, kiemelés, opcionális koordináta-feliratok.
- `DamaGamePage` felújítása: bábu-anyag (árnyék/perem, nem sík kör), a mockup "tábla + pontszám-sáv" elrendezése (jelenlegi egyszerű, egyoszlopos elrendezés helyett).
- `DamaSetupPage` felújítása: a mockup "Új parti" kártya-stílusa (fieldset/radio/select), gombok az új nyelven.

**Nincs hatókörben (tudatosan kihagyva, indoklással):**
- **A globális `index.css`/app-shell tokenek** — a tokenek egy B-klaszter-specifikus, becsomagolt osztályban élnek (lásd 3. szakasz), NEM a `:root`-ban — Hotel/Ramses/Lobby vizuálisan érintetlen marad.
- **`LobbyPage.tsx`** — ez game-agnosztikus, megosztott infrastruktúra (Hotel/Ramses online szoba-létrehozása is ezen megy át) — a klaszter-specifikus vizuális nyelv ide bevezetése minden más játékot is érintene, ami nem cél.
- **A megosztott `Button`/`Modal`/`Menu` ui-kit komponensek SAJÁT alapértelmezett stílusa** — ezek platform-szinten megosztottak. A `Button` már ma is elfogad egy külső `className`-t (lásd `Button.tsx`), ezt használjuk a B-klaszter oldalakon belüli felülíráshoz, a komponens saját `Button.module.css`-ét nem módosítjuk.
- **A mockup "klaszter navigáció" sávja** (Sakk/Malom/Connect4 "hamarosan" fülekkel) — a mockup ezt mutatta, de Sakk/Malom/Connect4 ma egyáltalán nem léteznek a kódbázisban; egy navigációs sáv nem-létező útvonalakhoz spekulatív IA-döntés lenne. Ez a rész természetes folytatás lesz, amint a klaszter második tagja (Sakk vagy Malom) ténylegesen elkészül — most nem épül meg.

## 2. Dizájn-tokenek

A mockup (lásd az Artifactot) által jóváhagyott rendszer:

**Szín** (világos/sötét téma, `prefers-color-scheme` + `data-theme` felülírással, a projekt Artifact-konvencióját követve):

| Token | Világos | Sötét | Szerep |
|---|---|---|---|
| `--ground` | `#eae3d5` | `#16140f` | oldal-háttér |
| `--surface` | `#f6f1e7` | `#1e1b14` | panel/kártya háttér |
| `--surface-raised` | `#fffdf8` | `#262119` | kiemelt felület (pl. tábla-inlay legvilágosabb rétege) |
| `--ink` | `#201c15` | `#ede6d6` | elsődleges szöveg |
| `--ink-soft` | `#5c5646` | `#a79a7d` | másodlagos szöveg |
| `--ink-faint` | `#8c8368` | `#726853` | felirat/eyebrow szöveg |
| `--line` | `#d3c8af` | `#3a3527` | hajszálvonal-keretek |
| `--accent` | `#8a6324` | `#c9a15a` | kiemelő szín (öregedett bronz/okker) |
| `--accent-strong` | `#5e4318` | `#e4be7e` | hover/aktív állapot |
| `--board-light` / `--board-dark` | `#efe7d6` / `#3a3227` | `#2b2620` / `#100e0a` | tábla-mezők (NEM a megszokott sakk.com zöld-krém) |
| `--piece-light-*` / `--piece-dark-*` | — | — | bábu-anyag (radiális gradiens + perem + árnyék, lásd az Artifact CSS-ét) — a sötét bábu tónusai a felhasználó élő visszajelzése alapján világosítva lettek (2026-07-28), mert az eredeti (`#2a251d`/`#4a4130`/`#6b5a3a`) túl közel volt a `--board-dark` (`#3a3227`) színhez, és beleolvadt a táblába |

**Tipográfia:**
- **Display** (címek, játék-nevek): `"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif` — irodalmi, "szabálykönyv" karakter.
- **Body** (UI-szöveg): rendszer sans-stack (`-apple-system, "Segoe UI", ...`) — visszafogott, hogy a display betű vigye a karaktert.
- **Mono** (koordináták, pontszámok, eyebrow-feliratok): `ui-monospace, "SF Mono", "Cascadia Code", "Consolas", monospace`, `tabular-nums` — tudatos döntés: a koordináták (a-h/1-8) maguk is a "rács" témát erősítik.

**Elrendezés:** a tábla "berakott panelként" jelenik meg (finom bevágott árnyék — `--shadow-inset` token — nem lebegő overlay), mellette egy pontszám-sáv ("rail"), nem szöveges egysoros státusz.

## 3. Architektúra — hol élnek a tokenek

Új fájl: `src/client/renderers/grid-2d/clusterBTheme.module.css` — egyetlen exportált osztály (`.theme`), ami a fenti CSS custom property-ket állítja be, `@media (prefers-color-scheme: dark)` felülírással. **Eltérés az Artifact-konvenciótól, tudatosan**: a `:global([data-theme="dark"])`/`[data-theme="light"]` kézi felülírást NEM építettük be — az Artifact-platform saját téma-váltójához kell, ennek az alkalmazásnak viszont ma nincs kézi téma-váltója, egy ilyen szabály sosem futna le (holt kód lenne). Csak az `prefers-color-scheme` fut, ami valós, élő mechanizmus már ma is.

**Miért ide, és miért osztály, nem `:root`:** a `GridBoard2D` mellett él, mert az a komponens, amit MINDEN jövőbeli klaszter-tag (Sakk, Malom, Connect 4) újrahasznál — aki importálja a rendert, egy lépésre van a témától is. Osztályként (nem globális `:root`-ban) él, hogy kizárólag a B-klaszter oldalak vegyék fel — a CSS custom property-k öröklődnek a DOM-fán át, tehát elég a legfelső wrapper `<div>`-re feltenni (`className={[styles.page, clusterTheme.theme].join(' ')}`), a beágyazott `GridBoard2D`/gombok/kártyák mind örökölik, CSS Modules-szkopolási ütközés nélkül.

```
src/client/renderers/grid-2d/
  GridBoard2D.tsx              # MÓDOSUL — keret/panel wrapper, opcionális koordináta-feliratok
  GridBoard2D.module.css       # MÓDOSUL — token-alapú színek, kiemelés
  clusterBTheme.module.css     # ÚJ — a fenti tokenek

src/client/games/dama/ui/
  DamaGamePage.tsx             # MÓDOSUL — pontszám-sáv, tábla + rail elrendezés
  DamaGamePage.module.css      # MÓDOSUL — token-alapú, bábu-anyag radiális gradienssel
  DamaSetupPage.tsx            # MÓDOSUL — kártya-elrendezés
  DamaSetupPage.module.css     # MÓDOSUL — token-alapú fieldset/select/gomb-felülírás
```

## 4. `GridBoard2D` — a megosztott tábla-renderer felújítása

- **Keret/panel hatás**: a `<svg>` egy új `<div className={styles.frame}>`-be kerül, ami a `--board-dark` hátteret + `--shadow-inset` box-shadow-t adja — ez adja a "berakott tábla" hatást, MINDEN jövőbeli rácsos játéknak ingyen.
- **Mező-színek**: `.lightSquare`/`.darkSquare` a `--board-light`/`--board-dark` tokenekre vált (a jelenlegi `#eeeed2`/`#769656` sakk.com-stílus helyett).
- **Kiemelés**: `.highlight` a `--board-highlight` tokenre vált (bronz-tónusú, nem sárga).
- **Opcionális koordináta-feliratok**: új `showCoordinates?: boolean` prop (alapértelmezett `false` — nem minden jövőbeli klaszter-tagnak van értelme sor/oszlop-betűzése, pl. Connect 4-nél máshogy számoznak) — Dáma bekapcsolja. Mono betűtípus, a token-rendszer `--ink-faint` színén.

## 5. `DamaGamePage` — tábla + pontszám-sáv elrendezés

A jelenlegi egyoszlopos, sima szöveges státusz ("Soron van: Világos") helyett a mockup "tábla-panel + rail" kompozíciója:
- Bal/közép: a tábla panel-keretben, fejléccel (cím + kör-jelző pötty).
- Jobb (szűk képernyőn a tábla alá kerül): egy "Állás" kártya, ami MINDKÉT oldal bábuszámát mutatja (a `state.board`-ból számolva, motor-módosítás nélkül) — az aktuális soron lévő fél kiemelve.
- **Bábu-anyag**: a `♛` unicode sakk-királynő-glifa lecserélve egy finomabb, a fizikai dáma-készletek "egymásra rakott korong" királyságát idéző belső gyűrű-motívumra (a piece-en belüli, `--accent` színű gyűrű) — jobban illeszkedik a "letisztult modern" anyag-nyelvhez, mint egy szó szerinti sakk-glifa egy dáma-bábun.

## 6. `DamaSetupPage` — kártya-elrendezés

A mockup "Új parti" kártyája: `fieldset`/`legend` mono-eyebrow stílusban, rádiógombok/select a token-rendszeren, a `Button` komponens `className`-nel felülírva (bronz elsődleges gomb, körvonalas másodlagos).

**Implementációs részlet — a `Button` felülírás specificitása:** mivel a `Button.module.css` saját `.primary`/`.secondary` szabálya és a `DamaSetupPage.module.css` felülíró szabálya külön CSS-fájlból származik, a végső csomagban a forrás-sorrend nem garantált — egy egyszerű, azonos specificitású osztály-szelektor véletlenszerűen veszíthetne. Megoldás: duplázott szelektor (`.primaryButton.primaryButton { ... }`), ami megbízhatóan magasabb specificitást ad `!important` nélkül.

## 7. Diagram

Lásd: [diagrams/b-klaszter-ui-architecture.puml](./diagrams/b-klaszter-ui-architecture.puml) — a tokenek/komponensek viszonya és melyik fájl miért ott él.

## 8. Nyitott pontok — lezárva

- [x] Vizuális irány — jóváhagyva az Artifact-mockuppal.
- [x] A "klaszter navigáció" (Sakk/Malom/Connect4 fülek) — kihagyva ebből a körből (1. szakasz), amíg a klaszter második tagja ténylegesen el nem készül.
- [x] A király-jelölés új gyűrű-motívuma (5. szakasz) — implementálva, élő böngészős teszttel megnézve (bár láncütés-promócióval még nem lett élesben kipróbálva, lásd 9. szakasz).

## 9. Implementáció

**Elkészült:** `clusterBTheme.module.css` (ÚJ), `GridBoard2D.tsx`/`.module.css` (keret/panel, token-színek, opcionális `showCoordinates`), `DamaGamePage.tsx`/`.module.css` (tábla-panel + "Állás" pontszám-sáv, bábu-anyag radiális gradienssel, gyűrű-motívumú király), `DamaSetupPage.tsx`/`.module.css` (kártya-elrendezés, `Button` felülírás).

**Ellenőrzés:** `tsc --noEmit`, `eslint`, teljes teszt-suite (213/213, változatlan — ez tisztán megjelenítési réteg, nincs új motor-/AI-logika, nem igényelt új tesztet) mind tiszta. Élő böngészős ellenőrzés (Playwright): a `DamaSetupPage` és a `DamaGamePage` mindkettő az új vizuális nyelvet mutatja, egy teljes lépés (kiválasztás → kiemelés → lépés → AI-válasz → kör visszaadása) hibátlanul lefutott, a pontszám-sáv helyesen frissült, konzolhiba nélkül (csak az ártalmatlan favicon-404). Keskeny nézetben (420px) a tábla-panel + rail elrendezés helyesen egymás alá kerül, nincs vízszintes túlcsordulás.

**Nem ellenőrizve élesben:** a király-gyűrű motívum tényleges megjelenése egy valódi láncütés-promóció után (a hot-seat teszt csak néhány nyitó lépésig futott) — vizuálisan a CSS helyes, de nem volt még rá közvetlen vizuális visszaigazolás. Nem blokkoló, egyszerű CSS, alacsony kockázat.
