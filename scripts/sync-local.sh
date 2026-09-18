#!/bin/bash
#
# Обёртка для автозапуска сбора на Mac (launchd). Аргумент — глубина в днях.
#
#   scripts/sync-local.sh 7
#
# launchd запускает процессы с пустым окружением и из корня файловой системы,
# поэтому здесь явно задаются и каталог проекта, и путь к node.
set -euo pipefail

cd "$(dirname "$0")/.."
export PATH="/usr/local/bin:/usr/bin:/bin"

days="${1:-7}"
mkdir -p logs

# Сбор идёт только когда база отвечает: после перезагрузки Mac локальная база
# из `prisma dev` не поднимается сама, и без этой проверки лог засыпало бы
# одинаковыми ошибками подключения раз в пятнадцать минут.
if ! nc -z localhost 5433 2>/dev/null; then
  echo "$(date '+%F %T') база не запущена (npm run db:dev) — сбор пропущен" >> logs/sync.log
  exit 0
fi

echo "$(date '+%F %T') сбор за $days дней" >> logs/sync.log
if npm run --silent sync -- amocrm --days "$days" >> logs/sync.log 2>&1; then
  echo "$(date '+%F %T') готово" >> logs/sync.log
else
  echo "$(date '+%F %T') ОШИБКА, подробности выше" >> logs/sync.log
fi

# Лог не должен расти бесконечно: держим последние 2000 строк.
tail -n 2000 logs/sync.log > logs/sync.log.tmp && mv logs/sync.log.tmp logs/sync.log
