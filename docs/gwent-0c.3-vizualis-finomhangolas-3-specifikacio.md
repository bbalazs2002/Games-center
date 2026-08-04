# Gwent-0c.3 — Specifikáció: harmadik visszajelzési kör a vizuális finomhangolásra

**Státusz: IMPLEMENTÁLVA (2026-08-04), élő Playwright-ellenőrzéssel igazolva.**

## Cél és hatókör

A Gwent-0c.2 kör után a felhasználó 8 további pontot jelzett — köztük egy valódi motor-szintű szabályhibát (Scoia'tael) és egy valódi UI-hibát (StartingChoiceScreen gombjai stílus nélkül).

## 1. Margin a pakli-építő gombsor felett

`GwentSetupPage.module.css` `.matchActions` kapott `margin-top: 1.5rem`-et.

## 2. Frakciónkénti pakli-mentés

**Feltárt tény**: `gwentDeckPersistence.ts` egyetlen globális localStorage-slotot használt (`gwent-deck-v1`) — mentéskor bármelyik frakció felülírta az előzőt. Átalakítva: `gwent-deck-v2` egy `Record<Faction, PersistedGwentDeck>`-et tárol. `GwentDeckBuilder.tsx` mostantól MINDEN frakció-választáskor (mindkét játékosnál) megnézi, van-e mentett pakli ahhoz a frakcióhoz — ha van, betölti a vezért+lapokat és egyenesen a pakli-lépésre ugrik. Élőben ellenőrizve: Monsters pakli mentve → átváltás Scoia'tael-re (üres) → vissza Monsters-re → automatikusan visszatöltődik a mentett 22/22 pakli.

## 3. Schirrú — Sor felperzselés magyarázata a jobb oldali sávba

**Feltárt tény**: `CardDetailModal`'s jobb oldali "Képességek magyarázata" panel csak `card.abilities.length > 0` esetén jelent meg — a RowScorch (Sor felperzselés) NEM `UnitAbility`, külön `rowScorch` mező, ezért Schirrúnál (üres `abilities`, van `rowScorch`) a panel sosem jelent meg, a magyarázat a bal oldali fő oszlopban, inline szövegként jelent meg. Javítva: a panel felirata bővült — `card.abilities.length > 0 || cardMechanicLine(card) !== null` — és a RowScorch/specialText magyarázat is a jobb oldali sávba került, saját "Sor felperzselés"/"Egyedi képesség" címkével. A flavor szöveg hiánya Schirrúnál nem hiba — a forrás-adatban nincs külön flavor idézet ehhez a laphoz (csak szabály-leírás), a projekt "sosem kitalált szöveg" elve miatt nem pótoltam kitalált idézettel.

## 4. StartingChoiceScreen gombköz

**Feltárt tény, valódi hiba**: `StartingChoiceScreen.tsx` a "X kezdjen"/"Y kezdjen" gombokat `styles.matchActions`-be csomagolta, de a `matchBoard.module.css`-ben ez az osztály SOSEM volt definiálva — a gombok stílus/gap nélkül, egymáshoz tapadva jelentek meg. Pótolva (`display:flex; gap:1rem; justify-content:center`).

## 5. A kéz ne tűnjön el kártya-választáskor

**Feltárt tény, valódi regresszió (Gwent-0c.2 §K)**: a `HandArea` a sor-/decoy-/medic-választó panel felbukkanásakor teljesen KIRENDERELŐDÖTT (`{!pendingInstance && <HandArea .../>}`), a felhasználó ekkor csak az instrukciós panelt látta. Javítva: a kéz MINDIG látszik, a választó panel FÖLÉ kerül, nem helyette. A kiválasztott lap `.cardSelected` mostantól `transform: scale(1.12)` + emelt `z-index`-szel kiemelkedik a legyezőből, ahelyett hogy minden más lap eltűnne.

## 6. Scoia'tael — csak az 1. kör elején dönthet

**Feltárt tény, valódi motor-szabály hiba**: `scoiaTaelDecisivePlayerId` minden körben aktív volt, felülírva a helyes "az előző kör vesztese kezd" alapszabályt. A valódi Gwent-szabály szerint a Scoia'tael "ki kezdjen" bónusz KIZÁRÓLAG az 1. körre vonatkozik. Javítva: `scoiaTaelDecisivePlayerId` most `state.round !== 1` esetén mindig `null`-t ad vissza. A `reducer.test.ts`-ben egy tesztet, ami a RÉGI (helytelen) viselkedést ellenőrizte, frissítettem az új, helyes elvárásra.

## 7. Kép-előbetöltés/cache

Új `imagePreload.ts`: `preloadGwentMatchImages(state)` — helyi hot-seat módban (ahol a `LocalGameTransport` sosem maszkol, nincs védendő titok) a meccs indulásakor egyszer előtölti mindkét játékos TELJES pakli+kéz+dobott lapok+vezér+kártyahát képét, hogy a kártya-repülés animáció (`cardFlight.tsx`) sosem villantson üres/betöltés-alatti keretet.

## 8. Monokróm ikonok

`PlayerBoardZone.tsx` fejléce (🏆/🃏) és a "Nézegető mód" (👁) gomb emoji helyett új, `currentColor`-alapú SVG ikonok (`boardIcons.tsx`: `TrophyIcon`, `HandCardsIcon`, `EyeIcon`).

## Ellenőrzés

`tsc`/`eslint`/`npm run test:gwent` (114/114, a frissített Scoia'tael-teszttel együtt)/`npm run build` mind hibamentes. Élő Playwright-kör: margin látható, frakciónkénti mentés/betöltés működik, StartingChoiceScreen gombköz javítva, kéz-lapok mindig láthatók + kiválasztott lap láthatóan nagyobb, monokróm ikonok megjelennek. A Schirrú-panel és a kép-előtöltés kódszinten ellenőrzött, élőben nem lett külön kikényszerítve.
