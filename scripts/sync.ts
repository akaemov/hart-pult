/// Сбор данных по одному источнику. На сервере запускается systemd-таймером,
/// локально — руками: npm run sync -- amocrm --days 120
import "../lib/load-env";
import { amocrmCollector } from "../lib/sync/amocrm";
import { runSync } from "../lib/sync/run";
import { SOURCES, type SourceId } from "../lib/sync/sources";

const COLLECTORS: Partial<Record<SourceId, (days: number) => ReturnType<typeof amocrmCollector>>> = {
  amocrm: amocrmCollector,
};

function arg(name: string, fallback: number): number {
  const index = process.argv.indexOf(`--${name}`);
  if (index === -1) return fallback;
  const value = Number(process.argv[index + 1]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function main() {
  const source = process.argv[2] as SourceId | undefined;
  const available = Object.keys(COLLECTORS);

  if (!source || !COLLECTORS[source]) {
    console.log(`Укажите источник. Подключены: ${available.join(", ")}.`);
    console.log(`Ждут подключения: ${SOURCES.map((s) => s.id).filter((id) => !available.includes(id)).join(", ")}.`);
    process.exitCode = 1;
    return;
  }

  const days = arg("days", 120);
  const started = Date.now();
  console.log(`Сбор «${source}» за ${days} дней…`);

  const result = await runSync(source, COLLECTORS[source]!(days));

  if (result.skipped) {
    console.log(
      `Пропущено: сбор «${source}» уже идёт с ${result.runningSince.toLocaleString("ru-RU")}. ` +
        "Дождитесь его окончания или остановите прогон.",
    );
    return;
  }

  console.log(`Готово: ${result.rows} строк за ${Math.round((Date.now() - started) / 1000)} с.`);
}


main().catch((error) => {
  console.error(`\n${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
});
