# Installer-kompatibilitás — Specifikáció (B út: futásidejű konfiguráció)

**Státusz:** TERV, jóváhagyásra vár — kód még nem készült. Az Installer 0.2.0 állapotához igazítva (2026-11-19): a volume-kezelés és a `{basePath}` helyőrző már megvalósult az Installerben, lásd 7–8. szakasz.
**Dátum:** 2026-11-19
**Kapcsolódik:** [deployment-specifikacio.md](./deployment-specifikacio.md) (a mai SSH+build-a-szerveren deploy, amit ez kiváltana), [deployment-kezi-utmutato.md](./deployment-kezi-utmutato.md), az Installer repó (`bbalazs2002/Installer`) `docs/release-contract.md`-je.
**Diagram:** [installer-release-folyamat.puml](./diagrams/installer-release-folyamat.puml)

## 1. Cél és hatókör

A Games Center telepíthető legyen az Installerrel (`installer.pyz`; 0.2.0 előtt `telepito.pyz`). Az Installer szerződése szerint minden release-ben pontosan ezek a mellékletek vannak: `deploy.json`, `docker-compose.deploy.yml`, `image.tar.gz`, `migrations.txt`, `SHA256SUMS`. A build a GitHubon történik, a szerver csak kész image-et tölt be.

**Miért kell a B út.** Ma a `VITE_BASE_PATH`, `VITE_SERVER_URL` és `ENABLED_GAMES` build-időben ég a kliens bundle-be. A szerződés szerint viszont egyetlen, GitHubon épített image-et töltenek le a szerverek, és az alútvonalat (`BASE_PATH`) a telepítő kérdezi meg telepítéskor. A kliensnek tehát **futásidőben** kell megtudnia az alútvonalat és a bekapcsolt játékokat.

**Nincs hatókörben:** a játéklogika, a játékok UI-ja, az Apache/systemd kezelése (az Installer ezt sem módosítja, csak kiírja).

## 2. Eldöntendő/eldöntött pontok

| Kérdés | Döntés |
|---|---|
| Konfiguráció átadása a kliensnek | A szerver az `index.html`-be injektálja: egy `<base href>` és egy `window.__APP_CONFIG__` szkript. Nincs bundle-átírás. |
| Vite `base` | Buildben `./` (relatív), dev-ben `/`. Az `<base href>` oldja fel a relatív útvonalakat, mélylinkeken is. |
| Szerver URL a kliensben | Elhagyható: `location.origin` + alútvonal (záró `/` nélkül). A `VITE_SERVER_URL` csak dev-felülírás marad. |
| Bekapcsolt játékok | Egyetlen, **futásidejű** `ENABLED_GAMES` env. A szerver a játékszobákat és a kliens konfigját is ebből veszi. A build-arg megszűnik. |
| Health endpoint | `GET /api/health` → `{"status":"ok","version":"<APP_VERSION>"}`. Az `/api` előtag miatt nem ütközik a SPA-fallbackkel. |
| Verzió a konténerben | Az image-be égetett `APP_VERSION` (a compose változója csak az image-címkét adja, a konténerbe nem jut be). |
| Volume | A Games Centernek **nem kell** (a szerver ma nem ír fájlt). A kezelés az Installer feladata, lásd 7. szakasz. |
| Régi deploy | A mai `deploy.yml` az átállás sikeréig marad, utána törlendő (6. szakasz). |

## 3. Változtatások a kódban

### 3.1 Futásidejű konfiguráció

```
src/shared/core/appConfig.ts          AppConfig típus + parse/normalize (tiszta függvények, tesztelhető)
src/server/core/clientShell.ts        renderIndexHtml(template, config) — tiszta függvény
src/server/index.ts                   BASE_PATH/ENABLED_GAMES beolvasás, /api/health, statikus kiszolgálás
src/client/core/appConfig.ts          window.__APP_CONFIG__ olvasása, dev-alapértékekkel
src/client/core/assetUrl.ts           a runtime basePath-t használja (nem import.meta.env.BASE_URL)
src/client/core/serverUrl.ts          egyetlen resolveServerUrl() (origin + basePath), dev-fallback marad
src/client/shell/routes.tsx           BASENAME a runtime basePath-ból
src/client/shell/gamesRegistry.ts     a szűrés a config.enabledGames-ből
vite.config.ts                        base: build=./, dev=/; a VITE_ENABLED_GAMES define törlése
```

- **`AppConfig`**: `{ basePath: string; enabledGames: string[] | null }`. A `basePath` mindig `/`-rel kezdődik és végződik (`/` vagy `/game-center/`). A `null` jelentése: minden játék engedélyezett (mai viselkedés).
- **`BASE_PATH` validálás** a szerveren indításkor: `^/([a-z0-9._~-]+/)*$`. Hibás érték esetén a szerver nem indul el, hanem érthető hibával leáll.
- **`renderIndexHtml`**: a `dist/index.html`-t egyszer olvassa be indításkor, és a `<head>` után beszúrja a `<base href="<basePath>">` elemet és az inline `<script>window.__APP_CONFIG__={...}</script>`-t. A JSON-ban a `<` karaktert escape-elni kell (`<`), hogy ne lehessen szkript-kitörés. A modul-szkript a `<head>`-beli inline szkript után fut, így a modul-szintű `assetUrl(...)` hívások már látják a konfigot.
- **Statikus kiszolgálás**: `express.static(distDir, { index: false })`, hogy a `/` se a nyers `index.html`-t adja. A SPA-fallback (`/^(?!\/api).*/`) a renderelt HTML-t küldi, `Cache-Control: no-cache` fejlécekkel. A hash-elt `assets/*` fájlok hosszú gyorsítótárat kaphatnak.
- **Az Apache továbbra is levágja az előtagot**, a szerver útvonalai nem változnak.
- **`/api/health`**: hitelesítés nélkül, csak `status` és `version`. A `version` az `APP_VERSION` env-ből jön, ennek hiányában (dev) a `package.json`-ból.

### 3.2 Kockázat és ellenőrzés a relatív `base`-nél

A relatív `base` + `<base href>` kombináció támogatott, de kockázatos pontokat ellenőrizni kell: lazy chunk-ok (`import()`), CSS `url()`, a `<link rel="icon">`, a Three.js/GLB betöltők. **Ellenőrzés** (egyszeri, kötegelt Playwright-hívással, a minimális használat elve szerint): a kész buildet `BASE_PATH=/game-center/` mellett kiszolgálni, megnyitni a `/lobby`-t közvetlenül (mélylink + újratöltés), és egy 3D-s játékot. Ha ez elbukik, a tartalék terv: a build `base`-e egy placeholder (`/__APP_BASE__/`), amit a konténer indításkor `sed`-del cserél a `dist/` másolatában.

### 3.3 Dockerfile

- `ARG APP_VERSION` + `ENV APP_VERSION=$APP_VERSION` a **runtime** fázisban.
- A `ENABLED_GAMES`, `VITE_BASE_PATH`, `VITE_SERVER_URL` build-argok törlése.
- A `CMD` (migrate deploy + seed + tsx) marad: a szerződés szerint az alkalmazás induláskor maga futtatja a migrációkat.

### 3.4 Release-artefaktok

```
deploy.json                         a repó gyökerében, release-melléklet
docker-compose.deploy.yml           image:-alapú (a mai build:-os váltja)
scripts/build-release-assets.mjs    migrations.txt, SHA256SUMS összeállítása (helyben is futtatható)
.github/workflows/release.yml       tag → CI → image → mellékletek → release
```

**`docker-compose.deploy.yml`** (a szerződés szerint, a `shared-infra` helyett `db`):

```yaml
services:
  app:
    image: games-center:${APP_VERSION}
    env_file: .env.production
    ports:
      - "127.0.0.1:${PORT}:${PORT}"
    networks: [db]
    restart: unless-stopped
networks:
  db:
    external: true
    name: "${DB_NETWORK}"
```

**`deploy.json`** főbb mezői:

| Mező | Érték |
|---|---|
| `name`, `image.name`, `compose.projectName` | `games-center` |
| `port` | `default: 2567`, `env: PORT` |
| `health` | `path: /api/health`, `versionField: version`, `timeoutSeconds: 120` |
| `database` | `required: true`, `urlEnv: DATABASE_URL`, `defaultDatabase/User: games_center` |
| `migrations.listAsset` | `migrations.txt` |
| `env[]` | `NODE_ENV` (fixed `production`); `BASE_PATH` (default `/game-center/`, validate `^/([a-z0-9._~-]+/)*$`, basic); `JWT_SECRET` (secret, required, generate 48 bájt, minLength 32, basic); `ENABLED_GAMES` (default `dama,hotel,ramses,gwent`, validate `^[a-z-]+(,[a-z-]+)*$`, advanced) |
| `proxy.snippet` | `ProxyPass "{basePath}" ...` (lásd alább) |
| `keep` | 3 |

Megjegyzések: a `PORT` és a `DATABASE_URL` **nem** szerepelhet az `env[]`-ben (a telepítő tölti ki őket). Az értékekben nem lehet aposztróf, sortörés vagy NUL. A `proxy.snippet` az Installer 0.2.0-tól a `{basePath}` helyőrzőt is támogatja (a `BASE_PATH` env értékét helyettesíti, ezért a `BASE_PATH`-nak szerepelnie kell az `env[]`-ben, ami nálunk így van). A snippet így: `ProxyPass "{basePath}" "http://127.0.0.1:{port}/" upgrade=websocket`, `ProxyPassReverse "{basePath}" "http://127.0.0.1:{port}/"`, `ProxyPreserveHost On`. Az Apache-ot az Installer nem módosítja, csak kiírja.

**`release.yml`** lépései: tag (`v*.*.*`) → CI (`lint`, `tsc`, `typecheck:server`, `test`) → a tag egyezik a `package.json` verziójával → `docker build --build-arg APP_VERSION=<v nélkül>` → `docker save | gzip > image.tar.gz` → `migrations.txt` (a `prisma/migrations` almappái, a `.toml` nélkül) → `SHA256SUMS` a négy fájlra → `gh release create` az öt melléklettel (`-` a tagben: előzetes kiadás).

## 4. Tesztelés

- Vitest: `appConfig` normalizálás (hibás `basePath`, üres `enabledGames`), `renderIndexHtml` (beszúrás, JSON-escape, `<head>` hiánya), `/api/health` (verzió, hitelesítés nélkül), `gamesRegistry` szűrés a configból, a `resolveServerUrl` esetei (injektált config / dev-fallback / `VITE_SERVER_URL`).
- A `scripts/build-release-assets.mjs` egységteszt a névszabályokra (migrációnevek `^[A-Za-z0-9][A-Za-z0-9_.-]*$`).
- Ellenőrzés a telepítő `plan` parancsával: `installer plan bbalazs2002/Games-center <verzió> <célmappa>` semmit nem módosít, de jelzi a szerződéssértéseket.
- Dokumentáció: `docs/tests/` bővítése az új tesztekkel.

## 5. Implementációs lépések sorrendje

1. Ez a terv a `docs/`-ba (kész).
2. `AppConfig` + `renderIndexHtml` + tesztek.
3. Szerver: `BASE_PATH`/`ENABLED_GAMES` runtime, `/api/health`, statikus kiszolgálás átalakítása.
4. Kliens: `appConfig`, `assetUrl`, `serverUrl`, `routes.tsx`, `gamesRegistry`, `vite.config.ts`.
5. Helyi ellenőrzés a 3.2 szerint (alútvonal + mélylink + 3D játék).
6. Dockerfile, `docker-compose.deploy.yml`, `deploy.json`, release-script és `release.yml`.
7. Próba-release előzetes taggel (`v0.1.0-rc.1`), `installer plan`, majd telepítés egy teszt-célmappába.
8. Átállás az éles szerveren (6. szakasz), végül a régi `deploy.yml` és a `docker-compose.deploy.yml` régi tartalmának törlése, a `deployment-*.md` frissítése.

A commitokat és a pusholást te intézed.

## 6. Átállás az élő szerveren (nyitott kérdések)

- **Port:** a régi konténer a 2567-en fut. Az új telepítés vagy másik portot kap, vagy a régit le kell állítani.
- **Adatbázis:** az élő `games_center` adatbázis a `shared-postgres`-ben van. Az Installer 0.2.0 felismeri a már létező adatbázist/usert, és megkérdezi, hogy a meglévőt használja-e (`Use the existing one`). Ezt érdemes választani, így nincs adatmozgatás. Biztonságból az átállás előtt dump készül a régi adatbázisról.
- **`JWT_SECRET`:** a meglévőt kell megadni, különben minden felhasználó kijelentkezik.
- **Mappa:** a `/var/www/games-center` ma git-klón; az Installer `releases/`, `current`, `shared/` szerkezetét más mappába vagy a régi mappa kitakarítása után érdemes létrehozni.
- **Hozzáférés:** a telepítő a futtató user `docker` csoporttagságát igényli, sudót nem. A `deploy` user ehhez megfelel, és a GitHub-tokent (Contents: Read) a `~/.config/installer/token` fájlba kell tenni.
- **Apache:** az Installer csak kiírja a blokkot; a meglévő `ProxyPass` sor jó marad, ha a port nem változik.

## 7. Volume-ok az Installerben — megvalósult (Installer 0.2.0, 2026-11-19)

A korábbi tervezet (az Installer 0.1.x állapotából) minden pontját az Installer 0.2.0 lefedi. A Games Center a `docs/release-contract.md` alapján ma már nem igényel további Installer-módosítást.

| Kért képesség | Állapot a 0.2.0-ban |
|---|---|
| `deploy.json` `volumes[]` kulcs (`name`, `mountPath`, `kind`, `hostPath`, `backup`, `description`) | Megvan, egyedi nevek és útvonalak kötelezők |
| Compose-ellenőrzés normalizált modellen | Megvan: `docker compose config --format json`; a nem deklarált mount, a `docker.sock`, más host-útvonal, `external` vagy átnevezett volume leállítja a telepítést a módosítások előtt |
| Első telepítés jóváhagyása | Megvan: új telepítésnél kiírja a volume-okat és a kockázatos beállításokat, és egyszer rákérdez |
| Mentés minden frissítés/visszalépés/újratelepítés előtt | Megvan: `<volume>-<verzió>-<idő>.tar.gz`, 600-as jog, visszaolvasással ellenőrizve, az adatbázis-dumppal azonos időbélyeggel; az alkalmazás a másolás idejére leáll |
| Visszatöltés és helyreállítás | Megvan: a *Backups* menü, a visszatöltés előtt biztonsági másolat (`…-pre-restore-…`), az alkalmazás nevét be kell gépelni; sikertelen indulásnál a helyreállítás a volume-okat is visszaállítja |
| Terv, szabad hely, állapot | Megvan: a terv, az előellenőrzés és az állapot-képernyő ismeri a volume-okat |
| Törlés elleni védelem | Megvan: a telepítő sosem futtat `down -v`-t, `volume rm`-et vagy prune-t (a tesztek ezt rögzítik); a `keep` csak kiadás-mappát és image-et töröl |
| Megőrzés | Egy évnél régebbi mentés törölhető, de az adatbázis és minden volume legújabb mentése mindig megmarad |
| `${DATA_DIR}` bind mount és jogosultság | Megvan: `DATA_DIR=<cél>/shared/data`, `APP_UID`/`APP_GID`, a `user: "${APP_UID}:${APP_GID}"` forma nem számít kockázatos változásnak |

**Megszorítások, amiket az alkalmazás oldalán be kell tartani:**
- Perzisztens fájl csak volume-ban lehet (named vagy `${DATA_DIR}` alatti bind), a konténer fájlrendszerében és a kiadás mappájában nem.
- A named volume-on nem lehet `name:` és `external`, különben a mentés nem találja.
- A mentéshez az image-ben kell `sh` és `tar` (a `node:22-alpine` alap ezt tartalmazza).

**A Games Centerre vonatkozóan:** jelenleg nincs szükség volume-ra (a szerver ma nem ír fájlt), ezért a `deploy.json`-ban nincs `volumes` kulcs. Ha később feltöltött vagy generált fájlok kellenek, a szerződés szerint named volume-ot kell használni.

## 8. Korábbi javaslat — teljesült

A `proxy.snippet` `{basePath}` helyőrzője az Installer 0.2.0-ban elérhető (lásd 3.4). Más nyitott Installer-igény nincs.

## 9. Az Installer átnevezése (tájékoztató)

Az Installer 0.2.0-tól `installer` néven fut (`installer.pyz`, `INSTALLER_STATE_DIR`, `INSTALLER_TOKEN_FILE`, token: `~/.config/installer/token`). A 0.1.x-ről frissítés működik: az első indításkor a `telepito.pyz` átnevezi magát, és szimbolikus linket hagy maga után. A felület és a dokumentáció angol nyelvű. Ennek a tervnek a tartalmát ez nem érinti, csak a parancsnevek változtak.
