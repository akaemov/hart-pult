#!/bin/bash
#
# Локальный PostgreSQL для разработки — настоящий, а не однопоточная заглушка.
#
#   scripts/db-local.sh start|stop|status
#
# Бинарники приезжают пакетом embedded-postgres: ни Docker, ни Homebrew,
# ни прав администратора не нужно. Данные лежат в .pgdata (в git не попадает).
#
# Почему не `prisma dev`: та база обслуживает одно соединение за раз, поэтому
# сбор данных и открытая страница пульта роняли друг друга.
set -euo pipefail

cd "$(dirname "$0")/.."
BIN="node_modules/@embedded-postgres/darwin-x64/native/bin"
DATA=".pgdata"
PORT=5433

case "${1:-start}" in
  start)
    if [ ! -f "$DATA/PG_VERSION" ]; then
      echo "Первый запуск: создаю базу данных в $DATA"
      mkdir -p "$DATA"
      "$BIN/initdb" -D "$DATA" -U postgres --auth=trust --encoding=UTF8 >/dev/null
    fi
    if "$BIN/pg_ctl" -D "$DATA" status >/dev/null 2>&1; then
      echo "PostgreSQL уже работает на порту $PORT"
      exit 0
    fi
    "$BIN/pg_ctl" -D "$DATA" -o "-p $PORT -k /tmp" -l "$DATA/server.log" -w start
    echo "PostgreSQL запущен на порту $PORT"
    ;;
  stop)
    "$BIN/pg_ctl" -D "$DATA" -m fast -w stop
    ;;
  status)
    "$BIN/pg_ctl" -D "$DATA" status || true
    ;;
  *)
    echo "Использование: $0 start|stop|status"; exit 1;;
esac
