#!/usr/bin/env bash
# Read-only diagnostic script for planning the games-center production
# deploy (see docs/deployment-specifikacio.md §9) — answers the remaining
# open questions there: Docker Compose version (v1 vs v2), Apache
# version/proxy modules, and where the domain's vhost config lives. Also
# checks for pre-existing Postgres containers / an already-bound port 5432,
# purely to avoid a naming/port collision when the NEW central
# `shared-postgres` container (§6) is created — this script does not try to
# find an existing database to connect to, the plan deliberately creates a
# fresh, project-independent one. Makes NO changes to the server — every
# command here is a query, nothing installs/writes/restarts anything.
# Assumes a Debian/Ubuntu layout (apt, apache2ctl, /etc/apache2/...).
#
# Usage (on the server, over SSH):
#   bash server-diagnostics.sh
#   sudo bash server-diagnostics.sh   # if the Apache module listing needs it
set -uo pipefail

section() { printf '\n=== %s ===\n' "$1"; }

section "Rendszer"
grep -E '^(PRETTY_NAME|VERSION)=' /etc/os-release 2>/dev/null
uname -a

section "Docker verzió"
if command -v docker >/dev/null 2>&1; then
  docker --version
  docker info --format 'Server version: {{.ServerVersion}}' 2>/dev/null \
    || echo "(docker info sikertelen — a jelenlegi user tagja a 'docker' csoportnak?)"
else
  echo "docker parancs nem található"
fi

section "Docker démon indul-e magától rendszerindításkor"
if command -v systemctl >/dev/null 2>&1; then
  echo "docker.service: $(systemctl is-enabled docker 2>&1)"
  echo "docker.socket:  $(systemctl is-enabled docker.socket 2>&1)"
else
  echo "systemctl nem található — nem systemd-alapú rendszer?"
fi

section "Docker Compose verzió"
if docker compose version >/dev/null 2>&1; then
  echo "docker compose (v2, plugin) elérhető:"
  docker compose version
else
  echo "docker compose (v2, plugin) NEM érhető el"
fi
if command -v docker-compose >/dev/null 2>&1; then
  echo "docker-compose (v1, önálló bináris) elérhető:"
  docker-compose --version
else
  echo "docker-compose (v1, önálló bináris) NEM érhető el"
fi

section "Futó Docker konténerek"
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}\t{{.Status}}' 2>/dev/null \
  || echo "docker ps sikertelen (jogosultság?)"

section "Docker hálózatok"
docker network ls 2>/dev/null

section "Meglévő Postgres-konténer(ek) — csak ütközés-ellenőrzéshez, NEM ehhez csatlakozunk"
pg_ids=$( (docker ps -q --filter "ancestor=postgres" 2>/dev/null; \
           docker ps -aq --filter "name=postgres" 2>/dev/null) | sort -u)
if [ -z "$pg_ids" ]; then
  echo "Nem található futó/postgres nevű/image-ű konténer — tiszta lappal indul az új shared-postgres."
else
  for cid in $pg_ids; do
    name=$(docker inspect --format '{{.Name}}' "$cid" 2>/dev/null | sed 's#^/##')
    echo "--- $name ($cid) ---"
    docker inspect "$cid" --format 'Image: {{.Config.Image}}' 2>/dev/null
    docker inspect "$cid" --format 'Hálózat(ok): {{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}' 2>/dev/null
    docker inspect "$cid" --format 'Állapot: {{.State.Status}}' 2>/dev/null
    echo "Port-leképezés:"
    docker port "$cid" 2>/dev/null || echo "  (nincs, vagy nem lekérdezhető)"
  done
fi

section "Foglalt portok (5432, 5433, 2567, 3000, 8080)"
for p in 5432 5433 2567 3000 8080; do
  if command -v ss >/dev/null 2>&1; then
    line=$(ss -ltnp 2>/dev/null | grep ":$p ")
  elif command -v netstat >/dev/null 2>&1; then
    line=$(netstat -ltnp 2>/dev/null | grep ":$p ")
  else
    line=""
  fi
  if [ -n "$line" ]; then echo "$p: FOGLALT — $line"; else echo "$p: szabadnak tűnik"; fi
done

section "Apache verzió és proxy-modulok"
APACHECTL=$(command -v apache2ctl || command -v apachectl || true)
if [ -n "$APACHECTL" ]; then
  "$APACHECTL" -v
  echo "--- proxy-releváns modulok ---"
  "$APACHECTL" -M 2>/dev/null | grep -i proxy \
    || echo "(nem sikerült listázni — próbáld: sudo bash server-diagnostics.sh)"
else
  echo "apache2ctl/apachectl nem található"
fi

section "Meglévő vhost-ok (ServerName + DocumentRoot)"
if [ -d /etc/apache2/sites-enabled ]; then
  for f in /etc/apache2/sites-enabled/*; do
    [ -f "$f" ] || continue
    echo "--- $f ---"
    grep -E "ServerName|DocumentRoot" "$f" 2>/dev/null
  done
else
  echo "/etc/apache2/sites-enabled nem található"
fi

section "/var/www/games-center célmappa (games-center-app)"
if [ -d /var/www/games-center ]; then
  echo "Már létezik:"
  ls -la /var/www/games-center
else
  echo "Még nem létezik — a deploy-előkészítés (12. szakasz 8. lépés) hozza majd létre"
fi

section "/var/www/database célmappa (shared-postgres)"
if [ -d /var/www/database ]; then
  echo "Már létezik:"
  ls -la /var/www/database
else
  echo "Még nem létezik — a shared-postgres telepítése (12. szakasz 7. lépés) hozza majd létre"
fi
ls -ld /var/www 2>/dev/null

section "Jelenlegi felhasználó és sudo"
id
if sudo -n true 2>/dev/null; then
  echo "Jelszó nélküli sudo elérhető ehhez a felhasználóhoz"
else
  echo "Nincs (jelszó nélküli) sudo — ez OK, csak jelezze, ha a további lépésekhez kell"
fi

echo
echo "Kész — másold be a teljes kimenetet a beszélgetésbe."
