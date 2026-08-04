# Gwent-0c.2 — Specifikáció: második visszajelzési kör a vizuális finomhangolásra

**Státusz: TERVEZVE, jóváhagyva (2026-08-04) — implementáció ELSŐ lépéseként.**

## 1. Cél és hatókör

A Gwent-0c.1 kör után a felhasználó egy MÁSODIK, 19 pontos visszajelzést adott, plusz egy kiegészítést (Horn-oszlop, ABC-sorrend, csúszás-animáció). Élő vizsgálattal két konkrét hibát találtam és megerősítettem:

- **`.page { color: var(--shell-ink) }`** a pakli-építő oldalon — sötétbarna szöveg a közel fekete alapon, gyakorlatilag olvashatatlan (a "halvány felirat" panaszok gyökere).
- **`CardDetailModal`** mindig `CardDef.imagePaths[0]`-t mutatja, nem a kis csempén ténylegesen látott variánst (`pickVariant(instance, ...)`).

## 2–19 + kiegészítés

A teljes, szakaszokra bontott terv a jóváhagyott plan fájlban (`eager-coalescing-melody.md`, A–R szakaszok) található, ide másolva:

### A. Szövegszín-hiba (2. pont)
`.page`: `color: var(--shell-ink)` → `color: var(--shell-ink-parchment)`.

### B. Háttérkép (1. pont)
`assets/Gwent/style-samples/medieval-tavern-background.jpg` → asset-pipeline → `--shell-ground` mögé `background-image` + sötétítő overlay.

### C. Inputok (3., 4. pont)
`.nameInput` valódi stílus; natív `<select>`-ek lecserélve a meglévő `ui-kit/Select.tsx`-re.

### D. Gombsor (7. pont)
`.saveRow` + `.matchActions` egy közös flex sorba.

### E. Nagyító — csak pakli-építő (5., 12., 13., 17., 18. pont)
Monokróm SVG, bal-alsó sarok, csak `CardCountGrid`-en; a meccs-táblán mindenhonnan törölve.

### F. `CardDetailModal` magyarítás (6. pont)
`CARD_KIND_LABELS_HU`, `ABILITY_LABELS_HU`/`ABILITY_DESCRIPTIONS_HU`, új `cardTextTranslations.ts` (~154 lefordított flavor text), ability-magyarázat sáv a modál mellett.

### G. Kontraszt (8. pont)
`.mechanicTag` szín cserélve pergamenen jól olvashatóra.

### H. Variáns-konzisztencia (9. pont)
Zoom state `CardInstance`-alapú, `pickVariant` mindenhol.

### I. Mulligan-lapok (10. pont)
Nagyobb méret, szükség esetén átfedés.

### J. Üres dobott-lapok hely (11. pont)
`.empty` kitölti a `.pile`-t.

### K. Kéz-interakció (12. pont)
Nincs előnézet-modal — kattintás azonnal kiválaszt, utána MINDIG sorválasztás a táblán (fix sorú lapnál is). Külön "Nézegetés" mód-kapcsoló a peek-eléshez.

### L. Kéz-legyező (14. pont)
`.handArea` nem tör sorba — átfedő legyező, dinamikus átfedéssel.

### M. Medic-választás lapképekkel (15. pont)

### N. Nincs oldal-görgetés, a kéz-sáv nem takar (16. pont)
Flex-oszlopos `.matchBoard`, `height:100dvh`; kéz-sáv `flex-shrink:0` a normál folyamban (NEM lebegő overlay); board-zónák `flex:1 1 0; min-height:0`, szükség esetén saját `overflow-y:auto`.

### O'. ~15 lapos kéz (kiegészítés)

### O. Dobott lapok teljes listája (17. pont)
Új `DiscardPileModal.tsx`.

### P. Tábla-lap közvetlen kattintás (18. pont)

### R. Horn-oszlop, ABC-sorrend (kiegészítés)
`BoardRow.tsx`: `horn.png` ikon-oszlop `hornActive` esetén; `rowState.cards` ABC-sorrendben renderelve; a meglévő `cardFlight` FLIP-mechanizmus automatikusan animálja az átrendeződést.

### Q. Kör-váltás időzítése (19. pont)
`PASS_DEVICE_GRACE_MS` növelve (~1.5s).

## Ellenőrzés

`tsc`/`eslint`/`npm run test:gwent`, majd élő Playwright-kör.

## Implementáció

**Státusz: IMPLEMENTÁLVA (2026-08-04), élő Playwright-ellenőrzéssel igazolva.**

Mind a 19 pont + a kiegészítő kérés (Horn-oszlop/ABC-sorrend/csúszás-animáció) elkészült. Fejlesztés közben talált és javított valódi hibák:
- A pakli-építő oldal `.page { color: var(--shell-ink) }`-je sötétbarna szöveget adott a sötét háttéren — élve lemérve (`getComputedStyle`) minden felület nélküli felirat gyakorlatilag láthatatlan volt.
- `Select.module.css` `.trigger`-je `background-color: var(--shell-surface, ...)`-t használt, de Gwent `--shell-surface`-e gradiens — a `background-color` érvénytelen (gradiens) értéket csendben eldob, így a select-ek teljesen átlátszóak, sötét szöveggel, olvashatatlanok voltak. Javítva `background`-ra (shorthand, gradienst is elfogad).
- `CardDetailModal`/`LeaderDetailModal` mindig `imagePaths[0]`-t mutatta, nem a kis csempén ténylegesen látott variánst — `pickVariant(instance, ...)`-ra váltva.

Új fájlok: `GwentBackdrop.tsx` (háttérkép-réteg, `assetUrl()`-lel, mert CSS `url()` nem tudja a base-path prefixet), `DiscardPileModal.tsx`, `useHandFan.ts` (kéz-legyező dinamikus átfedés-számítás), `cardTextTranslations.ts` (88 kártya + 4 vezér lefordított flavor szövege).

Élő ellenőrzés (helyi 2 játékos, deck-építéstől a parti közepéig, 1440×900 és egy szélsőségesen alacsony 1280×529 viewporton is): pakli-építő feliratok/select-ek/gombsor/monokróm bal-alsó nagyító mind láthatók és stílusosak; teljes parti — kéz-lapok egy sorban, legyezve; "Nézegető mód" kapcsoló működik; sor-választás MINDIG kötelező, fix sorú lapnál is (`selectableRows: 1` mérve); tábla-lapra kattintva közvetlenül nyílik a részlet-modál (nagyító nélkül), a modál mellett a képességek magyarázata magyarul, a flavor szöveg lefordítva; a kis csempe és a nagyított kép ugyanaz a variáns; a tábla SOSEM görgethető oldal-szinten egyik viewport-méretnél sem; a kör-váltás érezhetően lassabb. Medic-célválasztás valódi lapképekkel és a dobott lapok teljes listája kódszinten kész, de a tesztelt körökben nem lett élesben kikényszerítve (a véletlen lapsorrend nem hozta elő). `tsc`/`eslint`/`npm run test:gwent` (114/114)/`npm run build` mind hibamentes, 0 konzolhiba a teljes tesztmeneten.
