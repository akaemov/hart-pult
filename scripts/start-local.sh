#!/bin/bash
#
# Запуск пульта на Mac одной командой: npm run pult
#
# Поднимает локальную базу, если она не запущена, дожидается её и стартует
# сервис. База и сервис — два разных процесса, и забытая база даёт ошибку
# подключения в браузере, а не внятное сообщение. Поэтому порядок здесь.
set -euo pipefail

cd "$(dirname "$0")/.."

DB_PORT=5433
APP_PORT=3050
APP_URL="http://localhost:$APP_PORT"

if lsof -nP -iTCP:"$APP_PORT" -sTCP:LISTEN >/dev/null 2>&1; then
  echo "Пульт уже запущен: $APP_URL"
  echo "Если нужно перезапустить — остановите старый процесс (Ctrl+C в его окне)."
  exit 0
fi

if nc -z localhost "$DB_PORT" 2>/dev/null; then
  echo "База уже работает."
else
  echo "Поднимаю базу…"
  npm run --silent db:dev >/dev/null

  for _ in $(seq 1 30); do
    nc -z localhost "$DB_PORT" 2>/dev/null && break
    sleep 1
  done

  if ! nc -z localhost "$DB_PORT" 2>/dev/null; then
    echo "База не поднялась за 30 секунд. Запустите вручную: npm run db:dev"
    exit 1
  fi
  echo "База готова."
fi

# Открыть браузер, когда сервис ответит: первая сборка страницы занимает
# несколько секунд, и открытая раньше вкладка покажет ошибку подключения.
(
  for _ in $(seq 1 60); do
    if curl -sf -o /dev/null "$APP_URL/login"; then
      open "$APP_URL"
      break
    fi
    sleep 1
  done
) &

echo
echo "Пульт открывается: $APP_URL"
echo "Вход — owner@hart.local"
echo "Остановить — Ctrl+C в этом окне."
echo

exec npm run --silent dev
