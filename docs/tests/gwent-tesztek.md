# Gwent — tesztek

Futtatás: `npm run test:gwent` (113 teszt, 8 fájl). Lásd [README.md](./README.md) az általános konvenciókért. Gwent-0a.1 (kártya-katalógus + deck-építési szabályok), Gwent-0a.2 (a tényleges parti-motor: state/reducer/action-ok/vezér-képességek/selectors) és Gwent-0b (a rejtett-infó maszkolás, `rules.test.ts`-be integrálva) tesztjei együtt. A `GwentSetupPage`/`GwentMatchSetupPage`/`GwentGamePage` UI-t élő böngészős (Playwright) smoke teszt ellenőrizte 0a.2-ben; a Gwent-0b hálózati réteget (`GwentRoom`) egy élő, 2-kliens Colyseus smoke teszt (`temp/gwent-multiplayer-smoke-test.ts`, NEM fut le `npm run test`-tel — lásd `docs/gwent-0b-multiplayer-specifikacio.md` §9).

## `src/shared/games/gwent/engine/cardDefs.test.ts` (17 teszt)

A `scripts/build-gwent-assets.mjs` által generált statikus katalógus (`CARD_DEFS`, `temp/gwent-card-data.json`-ból) belső konzisztenciája.

- **Alapszámosság** — pontosan 134 bejegyzés (154 kutatott kártya mínusz a 20 vezér); egyedi `id`-k; minden `id` feloldható `getCardDef`-fel, ismeretlen `id`-ra dob; minden kártyának van legalább 1 `imagePath`-ja és pozitív `copies` értéke.
- **`row`/`basePower` konzisztencia** — csak `Unit`-kind kártyáknak van soruk/erejük; az Agile-képességű egységeknek SOSEM (a tényleges sor lejátszáskori választás, lásd 0a-spec §3.1) — ezt a tesztet a generátor egy valós adatbug-ja (Olgierd von Everec: a kutatási JSON `row: 'Melee'`-t adott az Agile képesség MELLÉ) buktatta le először, a `classifyRow` `abilities`-alapú (nem `row`-mező-alapú) normalizálással lett javítva.
- **`weatherRow`** — kizárólag `Weather`-kind kártyáknál nem null.
- **`rowScorch`** — pontosan a 3 névvel jelzett kártyánál (Schirrú, Toad, Villentretenmerth) nem null.
- **`specialText`** (2026-08-01) — pontosan Cow-nál és Dandelion-nál nem null (a kártya-egyedi mechanikák magyar leírása, lásd 0a-spec §9.6).
- **Ice Giant ereje** (2026-08-01) — regressziós teszt a felhasználó által 2026-08-01-én javított 5→6 hibára.
- **Villentretenmerth NEM Hero** (2026-08-01) — regressziós teszt a felhasználó által javított, a wiki forrás által is megerősített hibára (0a-spec §9.7).
- **`cardText`** (2026-08-01) — minden `CardDef`-nek van nem-null, kutatással sourcolt eredeti angol szövege (0a-spec §9.7).
- **`mustersWithIds` szimmetria** — ha A musterel B-vel, B is musterel A-val; a Crone-csoport 3, a Vámpír-csoport 5 tagú, mindegyik a többi taggal.

## `src/shared/games/gwent/engine/leaderDefs.test.ts` (7 teszt)

A vezér-katalógus (`LEADER_DEFS`).

- Pontosan 20 bejegyzés, frakciónként pontosan 5 (Northern Realms/Nilfgaard/Monsters/Scoiatael — Skellige egyelőre kizárva); egyedi `id`-k, `getLeaderDef` felold/dob; minden vezérnek van magyar `abilityDescription`-je és legalább 1 képe; minden vezérnek van nem-null `cardText`-je (2026-08-01, eredeti angol szöveg).

## `src/shared/games/gwent/engine/deckRules.test.ts` (7 teszt)

`validateDeckDraft` — a pakli-építés hivatalos szabálya (0a-spec §2, web-forrásból megerősítve: legalább 22 NEM-Hero egységkártya, 1 illeszkedő frakciójú vezér, kártyánként a `copies` korlát, Neutral kártyák bármely frakcióhoz).

- Egy szabályos (22 nem-Hero egységkártyás, illeszkedő vezérrel rendelkező) pakli érvényes.
- 22-nél kevesebb nem-Hero egységkártya érvénytelen.
- Hero-kártyák NEM számítanak bele a 22-es minimumba (egy nem-Hero lapot Hero lapra cserélve érvénytelenné válik).
- Más frakciójú vezér érvénytelen.
- Más (nem Neutral) frakció kártyája érvénytelen.
- Egy kártya hivatalos példányszám-korlátjának túllépése érvénytelen.
- Neutral kártyák bármely frakció paklijában szabadok.

## `src/shared/games/gwent/engine/rules.test.ts` (33 teszt) — Gwent-0a.2 (2026-08-04) + Gwent-0b (2026-08-03)

A pure predikátumok/segédfüggvények, amikre a reducer ÉS a selectors is épül.

- **`computeCardPower`** (7) — Hero minden modifikátort figyelmen kívül hagy (időjárás, Horn, Tight Bond is); időjárás 1-re állítja az alap erőt minden más modifikátor ELŐTT; Tight Bond soronkénti azonos-defId testvérek szerint duplázódik (2 példány → x2, 3 példány → x4); Morale Boost minden MÁS kártyának +1-et ad forrásonként, saját magának sosem; Horn a Morale Boost UTÁN duplázza a sort; Dandelion minden MÁS kártyát duplázza a sorban, önmagát sosem; egy Spy-kártya a AZ ELLENFÉL tábláján ül és az ellenfél összesítésébe számít.
- **`resolveRoundOutcome`** (3) — a magasabb össz-erejű oldal nyer; valódi döntetlen (egyik oldal sem Nilfgaard) nyertes nélkül; Nilfgaard automatikusan nyer egy döntetlent.
- **`canPlayCard`** (5) — elutasítja, ha egy fix-sorú kártya sor-választást kap; Agile egységnél érvényes sor-választást követel; Horn kártyánál sor-választást követel; Decoy kártyánál érvényes saját táblai célt követel; elutasítja a soron kívüli/már-passzolt játékos próbálkozását.
- **`canMulliganSwap` / `canConfirmMulligan` / `canPass`** (2) — csak kézben lévő, még cserélhető (mulligan hátra van, nincs megerősítve) lapra igaz; `canPass` csak `ROUND_IN_PROGRESS`-ban, a soron lévő, még nem passzolt játékosra igaz.
- **`findMusterPartnerDefIds`** (2) — a Crone-csoport 3 tagja egymást musterelik (nem név, hanem `mustersWithIds` alapján); csoport nélküli kártya csak saját `defId`-jét musterli.
- **`eligibleMedicTargets` / `pickMedicTarget`** (1) — Hero és nem-egység speciális kártya SOSEM választható a dobott lapok közül; kihagyás (`undefined`) `null`-t ad, nem automatikus választást.
- **`destroyStrongestAcross`** (3) — csak a legerősebb kártyá(ka)t pusztítja el, a Hero-t sosem; döntetlen esetén minden azonos-erejű célt elpusztít; egy Cow elpusztítása a Scorch/RowScorch-ágon Bovine Defense Force-ot konjurál ugyanabba a sorba (a Decoy-kivétel — lásd lent — itt NEM játszik szerepet, mivel ez a shared "destroy" ág, amit Decoy sosem hív).
- **leader passzívák (`computeCardPower`-en keresztül)** (2, 2026-08-04) — Foltest The Siegemaster / Eredin King of the Wild Hunt / Francesca The Beautiful mindegyike a saját Siege/Melee/Ranged sorát auto-duplázza, de SOSEM halmozódik egy valódi Horn-nal; Eredin Breacc Glas The Treacherous minden Spy-kártyát duplán számol, MINDKÉT oldalon, függetlenül attól, melyik játékosé a vezér.
- **`toPublicGwentState`** (5, 2026-08-03, Gwent-0b) — a viewer saját keze/mulligan-halmaza érintetlen marad; az ellenfélé azonos hosszúságú, `HIDDEN_CARD_DEF_ID` placeholderré maszkolódik; a pakli (`deck`) MINDIG maszkolt, viewer-től függetlenül — a tulajdonosának is (a felhasználó explicit megerősítése szerint); `viewerId: null` mindent maszkol (a szerver megosztott, semleges nézete); board/discard/log/phase mindig változatlan.
- **`expectedViewerId`** (3, 2026-08-03, Gwent-0b) — MULLIGAN fázisban a még nem megerősített játékos; ROUND_IN_PROGRESS/AWAITING_START_CHOICE-ban a soron lévő játékos; ROUND_RESOLVED/FINISHED-nél `null` (nincs rejtett infó a kör-összegzésben, nincs "add tovább a gépet" kapu).

## `src/shared/games/gwent/engine/leaderAbilities.test.ts` (16 teszt) — Gwent-0a.2, 2026-08-04

A 13 one-shot (A kategória) vezér-képesség egyenként, `applyLeaderAbility`-n keresztül, plusz `canActivateLeaderAbility` gate-elés.

- **`canActivateLeaderAbility`** (1) — elutasítja `ROUND_IN_PROGRESS`-on kívül, a soron kívüli játékosra, már felhasznált képességre, és egy csak-passzív (nem one-shot) vezérre.
- Mind a 13 one-shot képesség saját teszttel: Foltest King of Temeria (instant Impenetrable Fog), Lord Commander of the North (időjárás törlés), Son of Medell + The Steel-Forged (RowScorch-szerű, Ranged/Siege, a küszöb alatt no-op DE elhasználódik), Emhyr His Imperial Majesty (instant Torrential Rain), Emperor of Nilfgaard (kézfelfedés, state változatlan), The Relentless (húzás az ellenfél dobott lapjai közül), The White Flame (ellenfél vezér-képességének semlegesítése), Eredin Bringer of Death (2 eldob + 1 választott húzás), Commander of the Red Riders (bármely választott időjárás-kártya), Destroyer of Worlds (saját dobott lapból visszahozás), Francesca Pureblood Elf (instant Biting Frost), Queen of Dol Blathanna (RowScorch-szerű, Melee).
- **Elhasználódás garancia** (1) — egy handler akkor is beállítja `leaderAbilityUsed`-et és naplóz, ha a saját célja nem talált (pl. nincs a paklidban a keresett időjárás-kártya) — a valódi játékkal egyezően a képesség ekkor is elhasználódik.

## `src/shared/games/gwent/engine/reducer.test.ts` (26 teszt) — Gwent-0a.2, 2026-08-04

A `(state, action) → newState` reducer, minden action-típusra legalább egy happy-path és a releváns elutasítási esetek.

- **Mulligan** (2) — a lecserélt lap egy ideiglenes `mulliganSetAside`-ba kerül, NEM húzható vissza ugyanabban a mulligan-fázisban (regresszió a 2026-08-04-i tisztázásra); `CONFIRM_MULLIGAN` visszakeveri a paklijba, a fázis csak MINDKÉT játékos megerősítése után lép tovább.
- **Induló játékos** (2) — pénzfeldobás dönt, ha egyik fél sem Scoia'tael (determinisztikusan a `Math.random()` mock-olt eredményéből); `CHOOSE_STARTING_PLAYER` csak a döntő Scoia'tael-játékosra legális, a pénzfeldobás ekkor elutasítva.
- **`PLAY_CARD`** (12) — fix-sorú egység elhelyezése + kör-váltás; Spy az ELLENFÉL tábláján landol + 2 lap húzása; Muster egyszerre játssza le a kéz+pakli összes partnerét; Medic választott vagy kihagyott felélesztés (Hero sosem választható); Emhyr Invader of the North véletlen Medic-célt kényszerít MINDKÉT oldalon; Decoy visszavált a kézbe, Cow-csere NÉLKÜL (jóváhagyott kivétel); Horn beállítja a sor-jelzőt; Scorch az egész táblán a legerősebbet pusztítja; Cow-pusztítás Bovine Defense Force-ot konjurál; időjárás-kártya megjelöli a sorát, Clear Weather törli mind; Toad (rowScorch) a küszöbérték elérésekor pusztít; Dandelion tartósan duplázza a sort, a jelző törlődik, ha Decoy-jal elhagyja.
- **Kör-átadás** (1) — ha az ellenfél már passzolt, a lépő játékos marad soron (nem vált át).
- **`PASS` / kör-lezárás** (3) — mindkét passz után lezárja a kört, kiosztja az életveszteséget/`roundsWon`-t és a Northern Realms bónusz-húzást; a Monsters-bónusz pontosan 1 véletlenszerű túlélő egységet tart a táblán, a többi dobott lapba kerül; valódi döntetlen (egyik oldal sem Nilfgaard) MINDKÉT játékost 1 életbe kerül.
- **`CONTINUE_AFTER_ROUND`** (4) — a következő kör a VESZTES féllel indul, ha nincs döntő Scoia'tael; minden körre (nem csak az 1.-re) újra `AWAITING_START_CHOICE`-ba lép, ha a Scoia'tael-bónusz döntő; 0 életnél a másik játékos nyer; 2 megnyert körnél is vége a partinak, akkor is, ha van még élet hátra.
- **`ACTIVATE_LEADER_ABILITY`** (1) — pontosan úgy fogyasztja el a kört, mint egy lapjátszás/passz, és csak egyszer használható.
- **Francesca Hope of the Aen Seidhe** (1) — egy Agile egységet automatikusan a magasabb erőt adó sorba helyez, felülírva a kért `chosenRow`-t.

## `src/shared/games/gwent/engine/selectors.test.ts` (4 teszt) — Gwent-0a.2, 2026-08-04

`getValidActions(state, viewerId)` — a UI (és egy jövőbeli AI) egyetlen forrása arról, mi engedélyezett éppen most.

- Csak mulligan-releváns mezőket ad `MULLIGAN` fázisban.
- `AWAITING_START_CHOICE`-ban helyesen jelzi a pénzfeldobás-lehetőséget VAGY a döntő Scoia'tael-játékos azonosítóját.
- Minden játszható lapnál helyesen jelzi a sor-/decoy-cél-/medic-igényt (`canAttemptToPlayCard` — a teljes `canPlayCard`-tól eltérően a lista-szintű elérhetőség NEM követeli meg előre a sor/cél kiválasztását, azt a UI egy következő lépésben gyűjti be).
- `canContinueAfterRound` kizárólag `ROUND_RESOLVED`-ban igaz.

## `src/shared/games/gwent/engine/initialState.test.ts` (3 teszt) — Gwent-0a.2, 2026-08-04

`createInitialState` — a `cardCounts`-ból egyedi `CardInstance`-eket épít, leoszt, és `MULLIGAN` fázisban indul.

- A pool méretéhez igazodó kezdőkéz (10 lapnál kisebb pool esetén a teljes pool a kézbe kerül); minden `instanceId` egyedi, még azonos `defId` mellett is.
- Francesca Daisy of the Valley +1 kezdőlapot húz (a parti-kezdéskor automatikus, C kategóriás vezér-hatás).
- Egy ismeretlen/elavult kártya-`id` azonnal dob, nem hagyja, hogy a hiba később, egy erő-számítás közepén derüljön ki.
