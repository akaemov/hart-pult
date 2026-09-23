import Link from "next/link";
import { GradeLegend } from "@/components/grade-legend";
import { PultHeader } from "@/components/pult-header";
import { PultWindow } from "@/components/pult-window";
import { requireUser } from "@/lib/auth/dal";
import type { ObjectName } from "@/lib/channels";
import type { Freshness } from "@/lib/sync/freshness";
import { parseMonthKey } from "@/lib/report/leads-by-channel";
import { salesReport, type ObjectSales } from "@/lib/report/sales";
import type { StockRow } from "@/lib/sales";
import { freshnessOf } from "@/lib/sync/status";

/// Вкладка «Продажи»: что осталось, почём и как уходит.

const MONTH_NAMES = [
  "янв", "фев", "мар", "апр", "май", "июн",
  "июл", "авг", "сен", "окт", "ноя", "дек",
];

const money = (value: number) => `${Math.round(value).toLocaleString("ru-RU")} ₽`;
const short = (value: number) =>
  value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1).replace(".", ",")} млн ₽` : money(value);
const share = (value: number | null) => (value === null ? "—" : `${Math.round(value * 100)}%`);

function monthLabel(key: string): string {
  const { year, month } = parseMonthKey(key);
  return `${MONTH_NAMES[month - 1]} ${String(year).slice(2)}`;
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-1 bg-surface-2 px-4 py-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.09em] text-ink-3">{label}</span>
      <span className="font-mono text-2xl font-semibold tabular-nums">{value}</span>
      {note && <span className="text-xs text-ink-3">{note}</span>}
    </div>
  );
}

function StockTable({
  rows,
  header,
  meters,
}: {
  rows: StockRow[];
  header: string;
  meters?: { key: string; value: number | null }[];
}) {
  return (
    <div className="overflow-x-auto border border-line">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-line-2 bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
            <th className="px-3 py-2 font-medium">{header}</th>
            <th className="px-3 py-2 text-right font-medium">Свободно</th>
            <th className="px-3 py-2 text-right font-medium">Бронь</th>
            <th className="px-3 py-2 text-right font-medium">Продано</th>
            <th className="px-3 py-2 text-right font-medium">Продано, %</th>
            <th className="px-3 py-2 text-right font-medium">Остаток, м²</th>
            <th className="px-3 py-2 text-right font-medium">Остаток, ₽</th>
            {meters && <th className="px-3 py-2 text-right font-medium">Цена м²</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const meter = meters?.find((item) => item.key === row.key);
            return (
              <tr key={row.key} className="border-b border-line last:border-b-0">
                <td className="px-3 py-1.5">{row.key}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{row.available}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                  {row.booked === 0 ? <span className="text-ink-3">—</span> : row.booked}
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{row.sold}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{share(row.soldShare)}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                  {row.availableArea.toLocaleString("ru-RU")}
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                  {short(row.availableValue)}
                </td>
                {meters && (
                  <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                    {meter?.value === null || meter === undefined ? "—" : money(meter.value)}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ObjectWindows({
  sales,
  freshness,
}: {
  sales: ObjectSales;
  freshness: Freshness;
}) {
  return (
    <PultWindow
      title={`«${sales.object}» — остатки`}
      grade="B"
      sources="Profitbase"
      freshness={freshness}
      action={
        <Link
          href={`/sales/export?object=${encodeURIComponent(sales.object)}`}
          className="underline decoration-line-2 underline-offset-4 hover:text-accent"
          prefetch={false}
        >
          Выгрузить остатки в CSV
        </Link>
      }
    >
      <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Свободно" value={String(sales.available)} note={`из ${sales.lots} квартир`} />
        <Stat label="Бронь" value={String(sales.booked)} />
        <Stat label="Продано" value={String(sales.sold)} note={share(sales.soldShare)} />
        <Stat
          label="Остаток"
          value={short(sales.availableValue)}
          note={`${Math.round(sales.availableArea).toLocaleString("ru-RU")} м²`}
        />
        <Stat
          label="Цена метра"
          value={sales.pricePerMeter === null ? "—" : money(sales.pricePerMeter)}
          note="по свободным"
        />
      </div>

      <StockTable rows={sales.bySection} header="Секция" />
      <StockTable rows={sales.byRooms} header="Комнатность" meters={sales.meterByRooms} />

      {sales.slow.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Что не разбирают</h3>
          <ul className="flex flex-col gap-1.5 text-sm text-ink-2">
            {sales.slow.map((row) => (
              <li key={row.key} className="border-l-2 border-warn pl-3">
                <span className="font-medium text-ink">{row.key}</span> — продано {share(row.soldShare)}{" "}
                против {share(sales.soldShare)} по объекту. В остатке {row.available}{" "}
                {row.available === 1 ? "квартира" : "квартир"} на {short(row.availableValue)}.
              </li>
            ))}
          </ul>
          <p className="text-xs text-ink-3">
            Отставание меньше 10 процентных пунктов не показывается: это шум выборки. Остаток
            меньше пяти квартир — тоже.
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-2">
          Провалов по комнатности нет: все типы квартир уходят примерно вровень с объектом.
        </p>
      )}
    </PultWindow>
  );
}

export default async function SalesPage() {
  const user = await requireUser();
  const now = new Date();
  const [report, stockFreshness, amoFreshness] = await Promise.all([
    salesReport(now),
    freshnessOf("inventory", now),
    freshnessOf("amocrm", now),
  ]);

  const paceObjects = [...report.pace.keys()].sort((a, b) =>
    a === "Не определён" ? 1 : b === "Не определён" ? -1 : a.localeCompare(b, "ru"),
  );

  return (
    <>
      <PultHeader user={user} active="/sales" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Продажи</h1>
          <p className="max-w-[68ch] text-sm text-ink-2">
            Что осталось и почём — из Profitbase, как уходит — из закрытых сделок amoCRM. Две
            стороны считаются порознь и в одну цифру не складываются: сток ведёт отдел продаж,
            сделки живут в CRM, и сходиться они будут ровно настолько, насколько аккуратно
            заполнено и то, и другое.
          </p>
        </div>

        <GradeLegend present={["B", "C"]} />

        {report.objects.map((sales) => (
          <ObjectWindows key={sales.object} sales={sales} freshness={stockFreshness} />
        ))}

        <PultWindow
          title="Темп продаж"
          grade="C"
          sources="amoCRM"
          freshness={amoFreshness}
        >
          <p className="text-sm text-ink-2">
            Успешно закрытые сделки по месяцу закрытия. Объект определяется по названию сделки,
            лендингу и кампании — поле «ЖК» в amoCRM заполнено у 4% сделок, поэтому строка
            «не определён» здесь будет, пока это не починят.
          </p>
          <div className="overflow-x-auto border border-line">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-line-2 bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
                  <th className="sticky left-0 bg-surface-2 px-3 py-2 font-medium">Объект</th>
                  {report.months.map((month) => (
                    <th key={month} className="px-2 py-2 text-right font-medium">
                      {monthLabel(month)}
                    </th>
                  ))}
                  <th className="px-3 py-2 text-right font-medium">Итого</th>
                </tr>
              </thead>
              <tbody>
                {paceObjects.map((object: ObjectName) => {
                  const row = report.pace.get(object)!;
                  const total = report.paceTotals.get(object)!;
                  const unknown = object === "Не определён";
                  return (
                    <tr
                      key={object}
                      className={`border-b border-line last:border-b-0 ${unknown ? "bg-warn-soft" : ""}`}
                    >
                      <td className={`sticky left-0 px-3 py-1.5 ${unknown ? "bg-warn-soft" : "bg-surface"}`}>
                        {object}
                      </td>
                      {report.months.map((month) => {
                        const cell = row.get(month);
                        return (
                          <td key={month} className="px-2 py-1.5 text-right font-mono tabular-nums">
                            {cell ? (
                              <>
                                {cell.deals}
                                <span className="block text-[10px] text-ink-3">
                                  {short(cell.value)}
                                </span>
                              </>
                            ) : (
                              <span className="text-ink-3">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="px-3 py-1.5 text-right font-mono font-semibold tabular-nums">
                        {total.deals}
                        <span className="block text-[10px] font-normal text-ink-3">
                          {short(total.value)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {report.dealsWithoutPrice > 0 && (
            <p className="border-l-2 border-warn pl-3 text-sm text-ink-2">
              У {report.dealsWithoutPrice} закрытых сделок не проставлена сумма — в штуках они
              здесь есть, в рублях их нет. Зона отдела продаж.
            </p>
          )}
        </PultWindow>

        <section className="border border-line bg-surface px-4 py-3">
          <h2 className="text-sm font-medium">Чего здесь пока нет</h2>
          <ul className="mt-1.5 flex max-w-[68ch] list-disc flex-col gap-1 pl-4 text-sm text-ink-2">
            <li>
              <span className="text-ink">Сравнения с планом.</span> Нужен помесячный план продаж
              из финмодели — в штуках, метрах и деньгах. Без него пульт покажет темп, но не
              скажет, хороший он или плохой.
            </li>
            <li>
              <span className="text-ink">Динамики остатка.</span> Profitbase отдаёт только
              состояние на сейчас, истории у него нет — поэтому пульт копит её сам, по снимку
              в день.{" "}
              {report.historyDays === 0
                ? "Первый снимок появится после ближайшего сбора."
                : `Накоплено дней: ${report.historyDays}.`}{" "}
              Брони и снятия с продажи станут видны в движении, а не только числом.
            </li>
          </ul>
        </section>
      </main>
    </>
  );
}
