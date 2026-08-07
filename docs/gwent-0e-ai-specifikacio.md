# Gwent-0e — Specifikáció: AI ellenfél

**Státusz:** ALAP-IMPLEMENTÁCIÓ KÉSZ ÉS ÉLESBEN ELLENŐRIZVE (2026-08-07) — az 1-10. szakasz kódja megvan, tesztelve (`tsc`/`eslint`/`vitest`/`build` mind tiszta, 461/461 teszt zöld), hot-seat módban élő Playwright-ellenőrzés is lezajlott (lásd 10./13. szakasz). A 11. szakasz (csak-AI naplózás) tudatosan NINCS elindítva — külön rákérdezés vár rá. A heurisztika-súlyok playteszttel tovább hangolandók (lásd 1. és 13. szakasz) — ez a dokumentum már a MEGVALÓSULT architektúrát írja le, a tervezéskori pár ponton módosítva (lásd 13. szakasz az eltérésekért).
**Utolsó frissítés:** 2026-08-07
**Kapcsolódik:** [dama-0c-ai-specifikacio.md](./dama-0c-ai-specifikacio.md) (az alap-minta), [hotel-0d-ai-specifikacio.md](./hotel-0d-ai-specifikacio.md) (a `computeAiMove(state, slot)` bővítés forrása), [ramses-0c-ai-specifikacio.md](./ramses-0c-ai-specifikacio.md) (a maszkolt-state/fair-play minta), [gwent-0b-multiplayer-specifikacio.md](./gwent-0b-multiplayer-specifikacio.md) (a deck-submit folyamat), [gwent-0a-specifikacio.md](./gwent-0a-specifikacio.md)

## 1. Cél és hatókör

**Kérés:** Gwent online szobában ÉS hot-seat módban is legyen választható AI ellenfél, a másik három játékhoz (Dáma-0c, Hotel-0d, Ramses-0c) hasonlóan. A felhasználó két kötött elvárást fogalmazott meg explicit:

1. **A tisztességes játékot a MOTOR kényszerítse ki, ne az AI önkorlátozása** — az AI döntéshozó logikájának strukturálisan ne is legyen hozzáférése olyan adathoz (ellenfél keze, saját/ellenfél pakli tartalma), amit egy emberi játékos sem látna. Ez architekturális korlát, nem "az AI úgy van megírva, hogy nem néz oda".
2. **A frakció és a vezér véletlenszerű minden nehézségi szinten** — nincs "a HARD mindig a legerősebb frakciót/vezért kapja" logika. Az AI harci taktikájának (mikor melyik lapot játssza, mikor aktiválja a vezér-képességet) ehhez a véletlen választáshoz kell igazodnia, nem fordítva.

**Hatókörben van:**
- A meglévő, game-agnosztikus AI-infrastruktúra (`GameRoom.aiSlots`/`computeAiMove`/`maybeTriggerAiMove`/`registerAiOpponent`) egy hiányzó darabjának pótlása: egy hook-pont, amin egy játék reagálhat "ez a szlot AI, kell neki egy setup-lépés csatlakozáskor" (lásd 6. szakasz) — Gwentnek van erre szüksége elsőként, mert (a másik három játékkal ellentétben) a valódi meccs-state csak a deck-submit után épül fel.
- `GwentRoom.computeAiMove` tényleges implementációja, egy **1-lépéses, heurisztikus kiértékelésű döntéshozó stratégiával**, három választható nehézségi szinttel (lásd 8. szakasz).
- Egy új **AI pakli/frakció/vezér-generátor** (lásd 5. szakasz) — ez teljesen új fogalom ezen a projekten, mert a másik három játéknál nincs "pakliépítés" lépés. **A kártya-válogatás tervezett taktika alapján fut, nem véletlenszerűen** — csak a frakció/vezér marad véletlen (lásd 5. szakasz, felhasználói korrekció, 2026-08-07).
- Szoba-létrehozási UI: Gwentnél (fix 2 fő) Dáma bináris Ember/AI mintája + nehézség-választó (lásd 9. szakasz).
- **Hot-seat AI** — ugyanaz a döntéshozó logika (`shared/games/gwent/ai`), amit az online mód is használ, hot-seat módban is elérhető (lásd 7. szakasz), a kód duplikálása nélkül.
- Egy hiányzó darab pótlása, amit az AI hoz felszínre: hot-seat módban jelenleg NINCS maszkoló state-wrapper Gwentnél (lásd 4. szakasz) — ez technikailag túlmutat a szűken vett "AI ellenfél" témán, de mivel pont az AI-tervezés hozta felszínre (egy AI-nak kódban kell garantálni a tisztességet, nem elég a "passzív becsületesség"), ide, ebbe a körbe kerül — ugyanaz a döntés, mint amit Ramses-0c annak idején a maszkolt hot-seat state-tel hozott.
- **Csak-AI játékok naplózása/elemzése** (Hotel-0d.2 mintájára) — HATÓKÖRBEN VAN (felhasználói korrekció, 2026-08-07), de tudatosan az implementáció LEGUTOLSÓ fázisa (lásd 11. szakasz), és **megkezdése előtt a felhasználót külön meg kell kérdezni** — ne induljon el automatikusan csak azért, mert minden korábbi fázis kész.

**Nincs hatókörben:**
- **A heurisztika pontos súlyainak és a nehézségi zaj-paramétereknek a playtesztelt finomhangolása — ez KIFEJEZETTEN NEM Claude feladata.** A 8.3/8.4-ben javasolt tényezők az induló javaslat; a további finomítás a felhasználó dolga, valódi lejátszott partik alapján — ugyanaz a záradék, mint Dáma-0c/Hotel-0d/Ramses-0c esetén.
- Mélyebb (1-ply-nél nagyobb) keresés — lásd 12. szakasz.
- Az "AI gondolkodik…" mesterséges késleltetés pontos ms-értéke — lásd 12. szakasz.

## 2. Mi van már készen

A `src/server/core/GameRoom.ts` (Hotel-0d/Ramses-0c utáni állapot) már tartalmazza a teljes szoba-szintű AI-gépezetet, game-agnosztikusan, amit Gwent változtatás nélkül örököl:

- `aiSlots: Set<TPlayerSlot>`, `registerAiOpponent()` — AI-felhasználó regisztrálása (`ensureAiUser`) és szoba-szlot kiosztása.
- `maybeTriggerAiMove()`/`tryApplyOneAiMove()` — minden emberi és AI akció UTÁN lefut, minden AI-szlotot sorra megkérdez, és pontosan ugyanazon a validációs csövön engedi át egy talált lépést (`isActionAllowed` → reducer → `syncState`), mint egy emberi akciót. Nincs kiváltságos state-hozzáférés.
- `protected abstract computeAiMove(state: TState, slot: TPlayerSlot): TAction | null;` — a Hotel-0d-ben bővített, szlot-paraméteres alak, amit `GwentRoom` ma mindig `null`-lal implementál ("no AI opponent in Gwent-0b at all").
- `GameRoomCreateOptions.aiOpponentCount`/`aiDifficulty` — a szoba-létrehozási opciók már game-agnosztikusak, Gwent (fix 2 fő) ugyanúgy tudja használni, mint Dáma.

Gwent motorja (`src/shared/games/gwent/engine/`) oldalán is sok minden készen áll, kifejezetten AI-barát módon megtervezve:

- **`getValidActions(state, viewerId)`** ([src/shared/games/gwent/engine/selectors.ts](../src/shared/games/gwent/engine/selectors.ts)) — a jelenlegi UI-forrás, a saját doc-kommentje szerint kifejezetten "the single place the UI (and any future AI) reads what's legal right now" — újrafelhasználható, de csak azt mondja meg, MELYIK lap játszható/aktiválható-e a vezér-képesség, a konkrét paramétereket (sor, cél) nem sorolja fel.
- **`toPublicGwentState(state, viewerId)`** ([rules.ts](../src/shared/games/gwent/engine/rules.ts)) — a kéz feltételesen maszkolt (csak a NEM-viewer oldalé), a pakli MINDIG maszkolt (a saját tulajdonosától is) — ez lesz a 4. szakasz fair-play garanciájának alapja.
- **`leaderAbilities.ts`/`leaderConstants.ts`** — a 13 egyszer-használatos (Category A) vezér-képesség már effektus-TÍPUS szerint csoportosítható (lásd 8.5) — ez ad alapot egy leader-név-független AI-döntési szabályhoz.

## 3. Amiben Gwent architekturálisan más, mint a másik három játék

**(a) A rejtett infó jellege más, mint Ramses-nél.** Ramses AI-ja (`docs/ramses-0c-ai-specifikacio.md` §2) egy VALÓDI memória-problémát old meg: egy korábban látott kincs tartalma később újra elrejtődik, az AI-nak emlékeznie kell rá. Gwentnél nincs ilyen — az ellenfél keze/paklija egyszerűen és állandóan rejtett, amíg ki nem játsszák/fel nem fedik. Ez egy egyszerűbb, klasszikus kártyajáték-jellegű "sose lásd, amit nem szabad" probléma, nem egy memória-modell.

**(b) A meccs csak mindkét oldal deck-submitje UTÁN indul.** Dáma/Hotel/Ramses mindegyikénél `createInitialState()` a szoba létrehozásakor azonnal lefut. Gwentnél (`GwentRoom.ts`) ez placeholder-lel indul (`createPlaceholderGwentState`), és a valódi state csak akkor épül fel, amikor MINDKÉT oldal elküldött egy validált `GwentPlayerConfig`-ot (`onMessage('submitDeck', ...)` → `registerDeckConfig`). Egy AI-szlotnak tehát **saját magának kell egy pakli/frakció/vezér-választást produkálnia** — ez a másik három játéknál fel sem merült.

**(c) A döntési tér gazdagabb.** Dáma/Hotel/Ramses mindegyikénél a legális lépések tere viszonylag szűk (egy bábu-lépés, egy kockadobás utáni pár döntés, egy csúsztatás iránya). Gwentnél egy kör "melyik lapot a kézből, melyik sorba, kit céloz Decoy/Medic/vezér-képesség" kombinatorikája — ez indokolja a 8. szakaszban leírt, Hotel expectimax-mintájától eltérő architektúrát.

## 4. Fair play — motor-szintű garancia, nem AI-önkorlátozás

Ez a szakasz közvetlenül a felhasználó első kötött elvárását valósítja meg.

**Megvalósult forma (pontosabb, mint az eredeti terv-vázlat).** A `chooseGwentAiAction(state, slot, difficulty)` (`shared/games/gwent/ai/strategy.ts`) SOHA nem a nyers state-en dolgozik: legelső lépése mindig `stateForAiDecision(state, slot)`, ami a meglévő `toPublicGwentState`-re épül (garantáltan maszkolja az ELLENFÉL kezét ÉS pakliját), de — eltérve az eredeti terv-vázlat "minden maszkolva" leegyszerűsítésétől — a SAJÁT pakliját NEM maszkolja. Ez tudatos, szükséges pontosítás: egy 1-lépéses szimulációnak (8.1) a VALÓDI reducer-en kell végigfutnia a helyes eredmény (Muster/Spy/deck-search vezér-képesség) kiszámolásához, egy maszkolt (szentinel-kártyás) saját pakli mellett ezek a mechanikák hibásan (vagy `getCardDef`-throw-lökve) futnának. A tényleges garancia tehát kétrétegű:
1. **Az ellenfél keze/paklija strukturálisan sosem látható** — `stateForAiDecision` ezt garantálja, ugyanúgy, mint egy emberi kliens saját maszkolt nézete.
2. **A saját, még el nem játszott jövőbeli húzás (pl. Spy 2 lapja) nem "kukucskálható" a döntés meghozatalakor** — a kiértékelő függvény (8.3) a frissen húzott lapokat NEM a valódi (kikukucskált) azonosítójuk szerint pontozza, hanem egy generikus, a saját pakli átlagértékéből számolt helyettesítő értékkel — ez zárja ki, hogy az AI egy adott jelölt-akció kiértékelésekor "előre lássa" a saját húzását, majd emiatt döntsön másképp, mint egy ember tenné, aki ezt sosem tudhatná előre.

**Az egyetlen KIVÉTEL a deck-search vezér-képességeknél — ugyanaz, mint egy embernél.** Foltest King of Temeria / Emhyr His Imperial Majesty / Francesca Pureblood Elf / Eredin Commander of the Red Riders (mind `playWeatherCardFromDeckById`-szerű) és Eredin Bringer of Death saját húzása a `player.deck`-et (ami `stateForAiDecision` után a SAJÁT oldalon már real) olvassa `actionEnumerator.ts`-ben — pontosan az a pillanat, amikor egy ember is a `requestDeckReveal` szerver-üzenettel "lát bele" a saját paklijába (`GwentRoom.ts`'s `onMessage('requestDeckReveal', ...)`, `DECK_SEARCH_ABILITIES` gate) — nincs külön csatorna kiépítve rá, mert a `stateForAiDecision` már eleve real saját-deck-et ad, ugyanolyan szűken (csak az AKTIVÁLÓ saját oldalára), mint a human csatorna.

**Hot-seat mód — a tervezett `MaskedGwentTransport` végül feleslegesnek bizonyult.** Ramses maszkoló függvénye (`toPublicRamsesState`) NEM viewer-paraméteres (szimmetrikus, mindkét oldalnak ugyanaz), ezért ott egy állandó transport-wrapper adja a garanciát. Gwent `toPublicGwentState(state, viewerId)`-je viszont MÁR eleve viewer-paraméteres — a maszkolás pontosan ott történik, ahol ténylegesen eldől, KI a döntéshozó (`stateForAiDecision` hívásakor, `useGwentHotSeatAi`-n és `GwentRoom.computeAiMove`-on belül egyaránt), nincs szükség egy külön, mindig-becsomagoló transport-rétegre — a hot-seat rendereléshez használt `useGwentMatchViewState` MARADT változatlan (a saját, már meglévő `toPublicGwentState(state, activeViewerId)` hívásával), az AI-döntés pedig a MAGA útján maszkol, a kettő nem ütközik.

## 5. AI pakli/frakció/vezér-generátor — tervezett taktika, nem véletlen kártya-válogatás

**Felhasználói korrekció (2026-08-07):** a kártya-válogatás NEM lehet véletlenszerű — egy tervezett, taktikai logika alapján kell felépülnie. Csak a FRAKCIÓ és a VEZÉR marad véletlen (a korábban jóváhagyott elv szerint); a konkrét kártyák kiválasztása egy tudatos, értékelésen alapuló algoritmus.

Új, megosztott modul: **`shared/games/gwent/ai/cardValue.ts`**:

```ts
/** Pure function of a CardDef — no state dependency. Reused by deck-building (5. szakasz)
 * AND by the in-match heuristic's hand-value/Medic-chain logic (8.2/8.3), so there's only
 * ONE "what's this card worth" notion across the whole AI module. */
export function estimateCardValue(def: CardDef): number { ... }
```

Egyszerű, súlyozott kombináció: `basePower` (ha van) + ability-bónuszok — Muster (garantált, ingyenes extra tábla-jelenlét), TightBond (megsokszorozódó erő azonos nevű lapokból), Medic (lásd 8.2 — lánc-építési potenciál), Spy (extra húzás, az ellenfélnek adott erő ellenére nettó pozitív), MoraleBoost (sor-erősítés), Hero (kisebb bónusz a scorch-immunitásért). Pontos súlyok playteszttel hangolandók (lásd 1. szakasz).

Új modul: **`shared/games/gwent/ai/deckBuilder.ts`**.

```ts
export function buildTacticalAiDeckConfig(name: string): GwentPlayerConfig { ... }
```

Lépései:
1. Véletlen `Faction` a 4 közül (`NorthernRealms`/`Nilfgaard`/`Monsters`/`Scoiatael`) — **egyenletes eloszlással, nehézségtől függetlenül** (a felhasználó korábbi kérése szerint, változatlan).
2. `LEADER_DEFS.filter((l) => l.faction === faction)`-ból véletlen `leaderId` — a meglévő `leaderDefs.ts` adatból, nincs szükség új katalógusra. (Csak a frakció/vezér marad véletlen — lásd fent.)
3. **Tervezett kártya-válogatás**: `cardsForFaction(faction)` (már létező `deckRules.ts` helper) minden nem-Hero egységkártyáját `estimateCardValue` szerint csökkenő sorrendbe rendezi, majd mohó módon a legjobbakat veszi fel (egyenként, a `def.copies` korlátig), amíg a `nonHeroUnitCount` PONTOSAN eléri (nem lépi feleslegesen túl) a `MIN_NON_HERO_UNIT_CARDS` küszöböt (22) — valódi Gwent-stratégiai elv: a legális minimumon tartott, csak a legjobb lapokból álló pakli maximalizálja a legerősebb lapok újrahúzási esélyét egy adott körön belül; nincs stratégiai ok fölösleges, gyengébb lapokkal hígítani.
4. Minden, a frakcióhoz elérhető speciális kártyát (Decoy/Horn/Scorch/Weather) felvesz — ezek nem számítanak a 22-es küszöbbe, és egy tervezetten épített paklinál nincs ok kihagyni bármelyiket (a katalógusban amúgy is kevés van belőlük).
5. Záró `validateDeckDraft(draft)` hívás — ugyanaz a kapu, amin egy emberi `submitDeck` is átmegy (`GwentRoom.ts`'s `onMessage('submitDeck', ...)`). Mivel a generátor determinisztikusan helyes darabszámokból építkezik, ez soha nem bukhat el, de a hívás megmarad biztonsági hálóként (ugyanaz az elv, mint bárhol máshol ezen a projekten: "a reducer/validátor a valódi kapu, nem a hívó fél feltételezése").

**Nehézségtől függetlenül ugyanaz a tervezett logika fut minden szinten** — a nehézség kizárólag a MECCS KÖZBENI döntéseket (8. szakasz) befolyásolja, nem a pakliépítést. Ugyanez a függvény hívódik mindkét módban (online: `GwentRoom`, AI-szlot regisztrációkor; hot-seat: `GwentMatchSetupPage`, amint a "2. játékos: AI" választás megtörténik) — egyetlen forrás, nincs duplikáció.

## 6. Szerver-oldali huzalozás — mi hiányzik a `GameRoom` core-ból

A jelenlegi `registerAiOpponent()` ([GameRoom.ts](../src/server/core/GameRoom.ts)) csak DB-regisztrációt és szlot-kiosztást végez — nincs hook-pont, amin egy játék reagálhatna "ez a szlot AI, kell neki egy setup-lépés csatlakozáskor". A másik három játéknál ez nem hiányzott, mert `createInitialState()` már a szoba létrehozásakor lefut.

**Javaslat:** új, opcionális `protected` hook a `GameRoom` core osztályban:

```ts
/** Called right after an AI slot is added to `aiSlots`, before the loop
 * continues — default no-op. Gwent overrides this to auto-submit a random
 * deck for the AI slot, since (unlike Dáma/Hotel/Ramses) the real match
 * state only exists once BOTH sides have submitted a GwentPlayerConfig. */
protected onAiOpponentRegistered(_slot: TPlayerSlot): void {
  // Intentionally empty default — most games don't need this.
}
```

`registerAiOpponent()` ezt hívja meg az `this.aiSlots.add(slot)` sor után. Dáma/Hotel/Ramses változatlanul öröklik (no-op) — ugyanaz a mintázat, mint a `computeAiMove(state, slot)` korábbi, Hotel-0d-beli bővítése (lásd `hotel-0d-ai-specifikacio.md` §3.2: "a megosztott szerződés bővül, a régi felhasználó nem kényszerül különleges esetre").

`GwentRoom` felülírása:

```ts
protected onAiOpponentRegistered(slot: PlayerId): void {
  this.registerDeckConfig(slot, buildTacticalAiDeckConfig('AI ellenfél'));
}
```

Ez pontosan ugyanazon az úton megy át (`registerDeckConfig`), mint egy emberi `submitDeck` üzenet — nincs párhuzamos, divergálható logika.

`GameRoomCreateOptions.aiDifficulty` már létezik és game-agnosztikus (Hotel/Ramses is használja) — mivel Gwent fix 2 fős (`maxClients = 2`, legfeljebb 1 AI-szlot lehet egy szobában), egyetlen szoba-szintű nehézség elég, nincs szükség szlotonkénti bővítésre (ugyanaz a döntés, mint Ramses-nél).

## 7. Hot-seat huzalozás

- Új **`useGwentHotSeatAi(transport, aiSlots)`** hook (`client/games/gwent/ui/useGwentHotSeatAi.ts`), a `useRamsesHotSeatAi`/`useHotSeatAi` mintáját követve: figyeli a transport állapotváltozásait, minden AI-szlotot sorra megkérdez a megosztott `chooseGwentAiAction`-en keresztül (8. szakasz — ami MAGA maszkol, lásd 4. szakasz, nincs szükség egy külön wrapper-transportra), egy rövid mesterséges késleltetéssel (`GWENT_AI_MOVE_DELAY_MS = 800`, lásd 12. szakasz) dispatch-eli a talált lépést.
- **`GwentMatchSetupPage.tsx`** — a player2 lépésben egy Ember/AI váltó jelenik meg (nehézség-választóval, Dáma helyi-módú mintáját követve; player 1 mindig ember). AI választásakor a `GwentDeckBuilder` NEM rendelődik ki player2-nek (nincs mit szerkeszteni), helyette azonnal `buildTacticalAiDeckConfig('AI ellenfél')` tölti fel a `player2Draft`-ot.
- **`GwentGamePage.tsx`** — új, opcionális `hotSeatAiSlots` prop; `useGwentHotSeatAi(isLocalMode ? transport : null, hotSeatAiSlots ?? {})` bekötve, közvetlenül a nyers (nem becsomagolt) `transport`-on — a maszkolás a hook belsejében, a `chooseGwentAiAction` hívásán keresztül történik.

## 8. AI döntéshozó stratégia

### 8.1 Miért nem expectimax/minimax (eltérés a Hotel-mintától)

Hotel/Dáma AI-ja teljes információjú (nincs rejtett kéz) — egy állapotfa-keresés (expectimax/minimax) ott jól működik, mert minden szükséges adat elérhető. Gwentnél az ellenfél keze rejtett: egy valódi keresési fa az ellenfél lehetséges válaszaira vagy csalna (ismerné az igazi kezet — ellentmond a 4. szakasznak), vagy egy kitalált/mintavételezett kézzel dolgozna, ami erősen bizonytalan és számításilag drága lenne (a lehetséges kéz-kombinációk száma hatalmas egy 22+ lapos pakliból).

**Ehelyett: 1-lépéses (csak a saját kör) heurisztikus kiértékelés minden legális jelölt-akcióra.** A stratégia minden lehetséges saját lépést (8.2) végigfuttat a reducer-en, és a RESULTÁLÓ állapotot értékeli ki (8.3) — anélkül, hogy megpróbálná szimulálni az ellenfél válaszát. Ez közelebb áll egy erős, de nem "mindent látó" emberi játékos gondolkodásához is (jelenlegi erő-különbség + jövőbeli kéz-érték mérlegelése), mint egy fa-keresés, ami a hiányzó infó miatt itt nem adna valódi előnyt.

### 8.2 Akció-felsorolás

Új **`shared/games/gwent/ai/actionEnumerator.ts`**, a Hotel `actionEnumerator.ts` mintáját követve:

```ts
export function enumerateCandidateActions(state: GwentState, slot: PlayerId): GwentAction[]
```

`getValidActions(state, slot)`-ra épül, minden játszható lapra/aktiválható képességre a TELJES konkrét paraméter-kombinációt kilistázza:

- **Agile unit** (`needsRowChoice`): mindkét sor-változat (Melee és Ranged) külön jelölt, kivéve ha `agileAutoOptimizes` már eldönti (akkor nincs is `needsRowChoice`).
- **Horn**: mindhárom sor-változat.
- **Decoy** (`needsDecoyTarget`): minden saját táblán lévő lap mint `decoyTargetInstanceId` jelölt.
- **Medic** (`canDeclineMedic`) — **felhasználói korrekció (2026-08-07): a lánc-építés maximalizálja a szerzett erőt, ezt az AI-nak ki KELL használnia.** A "ne éleszd fel" opció mindig jelölt marad, de a "élesszd fel" jelöltek NEM atomi, 1-mélységű választások: minden jelölt egy teljes LÁNC (`buildGreedyMedicChain(state, playerId, firstChoice)` — új segédfüggvény `actionEnumerator.ts`-ben). A lánc-építés mohó: az `estimateCardValue` (5. szakasz, közös modul) szerint legjobb dobott lappal indul; ha AZ a lap maga is Medic, a lánc a MARADÉK dobott lapok közül a legjobbal folytatódik, és így tovább, amíg vagy egy nem-Medic lapnál megszakad, vagy elfogy az elérhető dobott lap. Ez tudatos maximalizálás: minden további lánc-tag ingyenes, plusz tábla-erőt ad (`reducer.ts`'s `resolveMedic` a felélesztett lapot azonnal a táblára helyezi, saját Spy/Muster/row-scorch triggerekkel együtt), tehát egy hosszabb lánc — ha elérhető — mindig legalább annyira jó, mint egy rövidebb. Az `enumerateCandidateActions` minden lehetséges ELSŐ választáshoz (minden dobott lap mint lánc-kezdet) egy-egy jelöltet ad, ki-ki a saját, mohón teljesített láncával — nem kell külön minden lehetséges rész-láncot felsorolni.
- **`ACTIVATE_LEADER_ABILITY`**: ha `canActivateLeaderAbility` igaz, a konkrét célt a leaderId kategóriája szerint kell felsorolni (lásd 8.5 a kategóriákról; a tényleges cél-jelöltek listázása pl. Emhyr The Relentless-nél minden ellenfél-dobott lap, Eredin Bringer of Death-nél a kézbeli lapok minden 2-es kombinációja + a deck-search-ös cél a 4. szakasz szerinti szűk csatornán).
- **`PASS`** mindig jelölt, végső opcióként.

Ugyanaz a garancia, mint Hotel/Ramses AI-jánál: a jelölt-lista SOSEM tartalmazhat illegális akciót, mert kizárólag a `rules.ts` saját predikátumaiból épül (`canAttemptToPlayCard`, `canActivateLeaderAbility`, stb.) — ha egy predikátum hiányzik/hibás itt, ugyanúgy hiányozna/hibás lenne a UI-ban is, tehát ez nem egy párhuzamos, divergálható szabály-másolat.

### 8.3 Kiértékelő függvény (heurisztika)

Egy adott (jelölt-akció alkalmazása UTÁNI) `GwentState`-re, egy adott játékos szemszögéből — **négy tag összege** (`strategy.ts`'s `evaluateResultingState`):

- **`roundLeadValue(saját összpontszám − ellenfél összpontszám)`** — nem nyers különbség! A kör kimenetelénél csak az számít, KI nyeri, nem mennyivel — egy `LEAD_SAFETY_MARGIN` (4) fölötti előny értéke erősen csökkenő hozamú (`LEAD_DIMINISHING_FACTOR` = 0.1), szimmetrikusan a hátrányra is. **Ez implementáció közben derült ki, hogy szükséges** — lásd 13. szakasz.
- **Kézben maradó érték** (`HAND_VALUE_WEIGHT` = 0.4-del súlyozva) — a kézben lévő lapok `estimateCardValue`-val (5. szakasz, közös modul) számolt összege; egy frissen húzott (a döntés előtt nem ismert) lapra generikus, a saját pakli átlagértékéből számolt helyettesítő érték jár, sosem a valódi azonosítója (lásd 4. szakasz).
- **`HAND_COUNT_DEFICIT_WEIGHT` (1.2) × max(0, ellenfél-kéz-mérete − saját-kéz-mérete)** — büntetés, ha kevesebb lap marad, mint az ellenfélnél. **Ez is implementáció közben derült ki, hogy szükséges** — lásd 13. szakasz.
- **Vezér-képesség potenciál** (`LEADER_POTENTIAL_BONUS` = 1.5) — ha a saját vezér-képesség még nem lett elhasználva és van rá elérhető cél, kis pozitív bónusz a "tartsd meg későbbre vs. használd most" mérlegeléshez.

**Spy/egyéb ability-hatások külön szabály NÉLKÜL kezelve** — mivel a kiértékelés a resultáló TELJES state-re fut (pl. egy Spy lap az ellenfél oldalára kerül, DE az AI 2 lapot húz), ez automatikusan helyesen tükröződik a pontszámban.

Pontos súlyok: playteszttel hangolandók, explicit NEM Claude feladata (lásd 1. szakasz) — a fenti konkrét számok egy empirikusan validált (lásd 13. szakasz), de NEM playtesztelt kiindulópont.

### 8.4 Nehézségi szintek

A Ramses EASY/MEDIUM/HARD mintáját követve — **mennyire tér el a legjobb jelölttől**, NEM keresési mélység (itt nincs mélység-fogalom, mivel 1-lépéses a kiértékelés):

| Szint | Viselkedés |
|---|---|
| Könnyű | A jelöltek pontszám szerint rendezett listájának felső feléből (top-K, pl. 50%) egyenletesen véletlen választás |
| Közepes | A legjobb 1-2 jelölt közül véletlen, enyhe zajjal a pontszámon |
| Nehéz | Mindig a legmagasabb pontszámú jelölt (tiszta greedy a heurisztikára nézve) |

Pontos zaj-paraméterek playteszttel hangolandók (lásd 1. szakasz).

### 8.5 Vezér-képesség időzítés és cél-választás — adaptálódás bármelyik véletlen vezérhez

Mivel a `leaderId` minden nehézségen véletlen (a felhasználó második kötött elvárása), **nem írható 20 darab kézzel hangolt, leader-név-specifikus szkript** — ehelyett a meglévő `leaderConstants.ts` kategorizálás (a Category A egyszer-használatos képességek effektus-TÍPUS szerinti csoportosítása, lásd `leaderAbilities.ts`'s `LEADER_ABILITIES` handler-családjai) ad alapot egy kis számú, EFFEKTUS-TÍPUS szerinti (nem leader-nevenkénti) döntési szabályhoz:

- **Deck-search időjárás** (`playWeatherCardFromDeckById` család: Foltest King of Temeria / Emhyr His Imperial Majesty / Francesca Pureblood Elf): aktiválás akkor jó, ha az adott sor-típusú időjárás még nincs aktív ÉS az ellenfélnek van érdemi ereje az érintett soron.
- **Row-scorch** (`rowScorchIfThreshold` család: Foltest Son of Medell / Foltest The Steel Forged / Francesca Queen of Dol Blathanna): aktiválás akkor, ha az érintett ellenfél-sor összpontszáma ≥ 10 (a tényleges küszöb) ÉS a legerősebb ottani lap nagyobb, mint amit egy saját lappal ugyanabban a körben el lehetne érni.
- **Kéz-felfedés** (Emhyr Emperor of Nilfgaard): tisztán infó-előny, nincs lefelé mutató kockázata — a heurisztika egy kis, állandó bónuszt ad rá, ha még nincs elhasználva.
- **Dobott-lap-visszahozás** (Emhyr The Relentless / Eredin Destroyer of Worlds): aktiválás akkor, ha a célozható dobott lapok között van a jelenlegi kézénél objektíve erősebb.
- **Csere-húzás** (Eredin Bringer of Death): a `hasKnowableTarget` gate miatt ez is a 4. szakasz szerinti szűk deck-hozzáférést igényli — az AI a 2 leggyengébb kézbeli lapot dobja el, és (a valódi pakli-hozzáféréssel) a legerősebb elérhető lapot húzza vissza.

Ezek a szabályok együtt mind a 13 Category A képességet lefedik. A Category B (passzív, pl. Eredin Breacc Glas The Treacherous Spy-duplázása) és Category C (automatikus, pl. Francesca Daisy of the Valley extra kezdőlapja) kategóriák nem igényelnek AI-döntést, hiszen nem aktiválandó képességek — automatikusan/mindig érvényesülnek, az AI számára ugyanúgy, mint egy emberi játékosnál.

**Scoia'tael induló-játékos-választás** (`CHOOSE_STARTING_PLAYER`, csak akkor releváns, ha az AI frakciója épp Scoiatael): egyszerű szabály — az AI mindig saját magát választja kezdőnek (a kezdeményezés-előny jellemzően erősebb, mint a válaszadás-előny), nehézségtől függetlenül, playteszttel felülvizsgálható.

## 9. Nehézségi szintek + AI-választás a szoba-létrehozási UI-ban

Gwent fix 2 fős (`maxClients = 2`) — a Dáma-mintát követi (bináris Ember/AI + nehézség-választó), NEM a Hotel/Ramses N-fős steppert.

- **`gamesRegistry.ts`**: Gwent bejegyzésének `online: {}` mezője `online: { supportsAiOpponent: true }`-ra változik (a jelenlegi "Fixed 2-player, no AI opponent yet (Gwent-0b, 2026-08-03)" kommentár frissül).
- **`LobbyPage.tsx`**: már kész, generikus infrastruktúrát ad ehhez (`applyBinaryAiOpponentParams`/`gameSupportsAiOpponent`, a mai eslint-takarítás során külön is átvizsgálva) — nincs Gwent-specifikus módosítás itt, kizárólag a fenti registry-flag bekapcsolása aktiválja a meglévő UI-t.

## 10. Tesztelés terve

- **`shared/games/gwent/ai/actionEnumerator.test.ts`** — minden generált jelölt-akció ténylegesen legális-e (`canPlayCard`/`canActivateLeaderAbility` ismételt ellenőrzés minden jelöltre) — ugyanaz a "sose adjon illegális lépést" garanciateszt, mint Hotel/Ramses AI-jánál.
- **`shared/games/gwent/ai/deckBuilder.test.ts`** — `buildTacticalAiDeckConfig` mindig `validateDeckDraft`-tal érvényes deckhez vezet, mind a 4 frakcióra, sok random futtatással (property-teszt jelleggel).
- **`shared/games/gwent/ai/strategy.test.ts`** — AI-only teljes meccs szimuláció (a Dáma/Hotel/Ramses "smoke test" mintája: sok lépés végigfuttatása hiba nélkül, vegyes nehézségekkel és véletlen frakció/vezér-kombinációkkal), plusz egy `simulate.ts` script a `scripts/simulate-hotel-ai-games.ts`/Ramses-megfelelője mintájára.
- **Élő Playwright-ellenőrzés (elvégezve, 2026-08-07)**: hot-seat Ember/AI váltó UI (a `GwentDeckBuilder` valóban nem rendelődik ki AI-ra váltáskor, a nehézség-választó megjelenik), majd egy teljes hot-seat meccs mulligan → pénzfeldobás → több kör lejátszásáig — az AI (véletlenül "Emhyr var Emreis: The Relentless", Nilfgaardian Empire) helyesen, önállóan lépett (Muster-lánc is helyesen feloldódott — 3× "Gaunter O'Dimm: Darkness" automatikusan a táblára került), és a vezérlés minden alkalommal visszaadódott a embernek, **semmilyen blokkoló UI nélkül**. Ez a live ellenőrzés fedezte fel a 13. szakaszban leírt, valódi "pass the device" hibát is.

Az ONLINE mód (`GwentRoom.computeAiMove`) élő böngészős vége-végig tesztje NEM történt meg ebben a körben (a szerver-oldali huzalozás `tsc -p tsconfig.server.json`-nal ellenőrizve, a döntéshozó logika pedig ugyanaz a 30 vitest-tel fedett `chooseGwentAiAction`, amit a hot-seat teszt is élesben bizonyított) — ha ez fontos, külön kérésre pótolható.

## 11. Csak-AI játékok naplózása/elemzése — HATÓKÖRBEN, de utolsó fázis

**Felhasználói korrekció (2026-08-07):** ez hatókörbe kerül (a Hotel-0d.2 mintájára), DE tudatosan LEGUTOLSÓ implementációs lépésként. **Megkezdése előtt a felhasználót külön meg kell kérdezni** — nem indulhat el automatikusan pusztán azért, mert az 1-10. szakaszok elkészültek.

- Az alap-infrastruktúra MÁR LÉTEZIK, game-agnosztikusan (Hotel-0d): `GameRoomCreateOptions.enableGameLog`, `GameRoom.ts`'s `logAction`/`gameLogStream`/`gameLogFilePath`. Gwent ezt változtatás nélkül örökli — semmilyen alapfunkció nem hiányzik hozzá.
- Gwent-specifikus kiegészítés (Hotel-0d §4.8 mintájára): az AI-lépéseknél a naplóbejegyzéshez csatolni kell, milyen jelölteket mérlegelt `enumerateCandidateActions` és milyen `estimateCardValue`/heurisztikus pontszámot kaptak — enélkül utólag nem derülne ki, "miért" döntött úgy az AI, csak hogy "mit" lépett.
- Nincs, és a Hotel-0d-vel megegyező elv szerint nem is lesz hozzá lobby-UI kapcsoló — szándékosan rejtve marad a normál felhasználók elől, csak programozottan/kézzel indított, csak-AI szobáknál érhető el.
- Pontos elemzési szkript/kimenet formátum (JSONL, mint Hotelnél) az implementáció megkezdésekor dől el — ez is a felhasználóval egyeztetendő, amikor ez a fázis ténylegesen elindul.

## 12. Nyitott kérdések — explicit NEM ez a kör

- Pontos heurisztika-súlyok és nehézségi zaj-paraméterek finomhangolása (playteszt, felhasználói döntés).
- Az "AI gondolkodik…" mesterséges késleltetés pontos ms-értéke, és hogy egyáltalán legyen-e (javaslat: legyen, mert egy Gwent-kör azonnal lejátszva ugyanúgy nehezen követhető lenne, mint Hotel/Ramses esetén volt — de a pontos érték playteszt kérdése).
- Mélyebb (1-ply-nél nagyobb) keresés bevezetése egy KÉSŐBBI körben, ha a playteszt azt mutatja, hogy a tiszta heurisztika túl gyenge/kiszámítható.

## 13. Implementáció közben szerzett empirikus tapasztalatok

Két valódi, strukturális hiba derült ki AI-kontra-AI szimulációval (`simulate.ts`), NEM playteszt-finomhangolás — ezeket ki KELLETT javítani, nem csak "hangolni":

1. **A tiszta mohó (HARD) kiértékelő a teljes kezét egyetlen kör alatt eldobta, ha nyerésre állt.** Egy nyers `saját − ellenfél` pontszám-különbség mellett MINDIG jobb pontszámot ad egy plusz lap lejátszása, akkor is, ha a kör már biztosan megnyerve áll — a HARD AI így module 1. körben leürítette a kezét, majd a 2-3. körben lapok nélkül maradt és elvesztette a meccset, annak ellenére, hogy az 1. kört magabiztosan megnyerte. Ez egy VALÓS, real Gwent-stratégiai elv hiánya (csak az számít, KI nyer egy kört, nem mennyivel) — a `roundLeadValue` csökkenő-hozamú sapkával és a `HAND_COUNT_DEFICIT_WEIGHT` büntetéssel lett javítva (8.3).
2. **A tesztelési módszertan maga is hibás volt kezdetben**: az első A/B összehasonlítások (azonos pakli, csak a nehézség változott) következetesen az ELSŐ JÁTÉKOS oldalára torzítottak, függetlenül a nehézségtől (HARD-vs-HARD tükör-meccsen is a 2. játékos nyert gyakrabban) — ez egy pozíció-torzítás (ki kezd), nem AI-minőség kérdés. A megbízható összehasonlításhoz minden meccset MINDKÉT sorrendben le kellett futtatni (A mint player-1 ÉS A mint player-2), összesítve — enélkül a nehézségi létra tesztelése félrevezető eredményt adott volna.
3. **Élő Playwright-teszt közben derült ki**: a meglévő `useGwentMatchViewState`/`PassDeviceScreen` "add tovább a gépet" mechanizmus MINDEN viewer-váltásnál egy explicit emberi kattintást vár ("Megvan, mehet") — egy AI-szlotra váltáskor viszont NINCS, aki rákattintson (az AI csak akciókat dispatchel, a képernyőt nem kezeli), így a meccs a gyakorlatban egy láthatatlan "pass device to AI ellenfél" képernyőn állt volna meg örökre, amint elérkezik az AI köre. Javítás: `useGwentMatchViewState` új `hotSeatAiSlots` paramétert kapott — ha a soron következő nézőpont AI-szlot, a váltás célja az AKTUÁLIS (emberi) néző marad, tehát sosem indul pass-device átmenet az AI felé; az emberi oldal nézete (és az ellenfél kezének maszkolása) így a teljes meccs alatt változatlan marad, pontosan úgy, mint online módban egy valódi ellenféllel szemben. Ez egy VALÓS, a tervben nem előrelátott hiba volt, nem az eredeti terv egyszerűsítése.

Pozíció-balanszírozott, azonos-pakli tesztek után (80 meccs/párosítás): **HARD > MEDIUM > EASY**, konzisztensen, de szerény (~51-53%-os) fölénnyel — ez várható és elfogadható egy 1-lépéses heurisztikára egy valódi rejtett-infós stratégiai játékban; a nagyobb fölény playteszt-hangolás kérdése (lásd 1. szakasz), nem architekturális hiba.

## 14. Érintett/új fájlok összefoglalva

- **Új**: `shared/games/gwent/ai/cardValue.ts` (+teszt), `shared/games/gwent/ai/deckBuilder.ts` (+teszt), `shared/games/gwent/ai/actionEnumerator.ts` (+teszt), `shared/games/gwent/ai/strategy.ts` (+teszt), `shared/games/gwent/ai/index.ts`, `shared/games/gwent/ai/simulate.ts` (+teszt), `client/games/gwent/ui/useGwentHotSeatAi.ts`. (A tervezett `MaskedGwentTransport.ts` végül nem készült el — lásd 4./7. szakasz, feleslegesnek bizonyult.)
- **Módosul**: `server/core/GameRoom.ts` (új `onAiOpponentRegistered` hook), `server/games/gwent/GwentRoom.ts` (`computeAiMove`/`aiMoveDelayMs`/`onAiOpponentRegistered` valós implementáció), `client/shell/gamesRegistry.ts` (`supportsAiOpponent: true`), `client/games/gwent/ui/GwentMatchSetupPage.tsx` (player2 Ember/AI váltó, `Player2Step` kiszervezve az ESLint complexity-limit miatt), `client/games/gwent/ui/GwentGamePage.tsx` (hot-seat AI hook bekötése), `client/games/gwent/ui/useGwentMatchViewState.ts` (`hotSeatAiSlots` paraméter — a 13. szakaszban leírt "pass the device" hiba javítása), `client/games/gwent/ui/GwentSetupPage.module.css` (új `.opponentFieldset`/`.radioRow`/`.opponentDifficultySelect` osztályok).
- **Utolsó fázis (11. szakasz, külön rákérdezés után)**: `server/core/GameRoom.ts`/`GwentRoom.ts` naplózó kiegészítés, esetleges elemző szkript.
- **Érintetlen**: a motor (`shared/games/gwent/engine/*`) — az AI kizárólag a meglévő reducer/selectors/rules API-t hívja, semmilyen engine-szabály nem változik.
