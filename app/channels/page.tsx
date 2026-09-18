import { GradeLegend } from "@/components/grade-legend";
import { PultHeader } from "@/components/pult-header";
import { PultWindow } from "@/components/pult-window";
import { requireUser } from "@/lib/auth/dal";
import { buildChannelTable } from "@/lib/report/channel-table";
import { freshnessOf } from "@/lib/sync/status";

/// Глубина выгрузки: документ заказчика ведётся с января 2024, но в amoCRM
/// столько нет — берём всё, что собрано.
const FROM = new Date("2024-01-01T00:00:00Z");

export default async function ChannelsPage() {
  const user = await requireUser();
  const now = new Date();
  const [table, freshness] = await Promise.all([buildChannelTable(FROM), freshnessOf("amocrm", now)]);

  return (
    <>
      <PultHeader user={user} active="/channels" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Лиды по источникам</h1>
          <p className="max-w-[68ch] text-sm text-ink-2">
            Строки и порядок — как во вкладке «2. Лиды по источникам» вашего документа. Кнопка
            ниже отдаёт эти же цифры файлом: в Google-таблице Файл → Импорт → «Заменить лист».
            Никаких скриптов и разрешений.
          </p>
        </div>

        <GradeLegend present={["B", "C"]} />

        {table.objects.map((block) => (
          <PultWindow
            key={block.object}
            title={block.object === "Не определён" ? "Объект не определён" : `«${block.object}»`}
            grade={block.object === "Не определён" ? "C" : "B"}
            sources="amoCRM"
            freshness={freshness}
          >
            {block.object === "Не определён" && (
              <p className="border-l-2 border-warn pl-3 text-sm text-ink-2">
                Эти лиды не удалось отнести ни к «Заре», ни к «Пьермонту»: поле «ЖК» в amoCRM
                заполнено у 3% сделок, воронка одна на два объекта. В документе заказчика места
                для них нет — поэтому они здесь, отдельным блоком, а не размазаны по объектам.
              </p>
            )}
            <div className="overflow-x-auto border border-line">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-line-2 bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                    <th className="sticky left-0 bg-surface-2 px-3 py-2 font-medium">Источник</th>
                    {table.monthLabels.map((label) => (
                      <th key={label} className="px-2 py-2 text-right font-medium">{label}</th>
                    ))}
                    <th className="px-3 py-2 text-right font-medium">Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row) => {
                    const isTotal = row.channel === "ВСЕГО лидов" || row.channel === "из них целевых";
                    const isGap = row.channel === "Источник не указан";
                    return (
                      <tr
                        key={row.channel}
                        className={`border-b border-line last:border-b-0 ${
                          isTotal ? "bg-ok-soft font-medium" : isGap ? "bg-warn-soft" : ""
                        }`}
                      >
                        <td className={`sticky left-0 px-3 py-1.5 ${isTotal ? "bg-ok-soft" : isGap ? "bg-warn-soft" : "bg-surface"}`}>
                          {row.channel}
                        </td>
                        {row.values.map((value, i) => (
                          <td key={i} className="px-2 py-1.5 text-right font-mono tabular-nums">
                            {value === 0 ? <span className="text-ink-3">—</span> : value}
                          </td>
                        ))}
                        <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
                          {row.total}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </PultWindow>
        ))}

        <PultWindow title="Сверка" grade="B" sources="amoCRM" freshness={freshness}>
          <ul className="flex flex-col gap-2 text-sm text-ink-2">
            <li>Всего сделок в выгрузке: <strong className="text-ink">{table.totalLeads}</strong></li>
            <li>Не отнесено к объекту: <strong className="text-crit">{table.unassignedObject}</strong> — нужно обязательное поле «ЖК» в amoCRM</li>
            <li>Без источника: <strong className="text-crit">{table.unknownChannel}</strong> — нужно обязательное поле «Источник заявки» и восстановленная UTM-разметка</li>
            <li>Avito, ЦИАН и Домклик пусты не потому, что лидов не было, а потому что таких источников в CRM нет ни у одной сделки</li>
          </ul>
          <a
            href="/channels/export"
            className="self-start border border-line-2 bg-surface px-4 py-2 text-sm hover:border-accent hover:text-accent"
          >
            Скачать для таблицы (CSV)
          </a>
        </PultWindow>
      </main>
    </>
  );
}
