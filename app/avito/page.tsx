import Link from "next/link";
import { GradeLegend } from "@/components/grade-legend";
import { PultHeader } from "@/components/pult-header";
import { PultWindow } from "@/components/pult-window";
import { requireUser } from "@/lib/auth/dal";
import { ACCOUNTS } from "@/lib/avito";
import { summarizeRejections, type AccountCheck } from "@/lib/avito-check";
import { avitoReport } from "@/lib/report/avito";
import { freshnessOf } from "@/lib/sync/status";

/// Окно сверки Авито: где фид Profitbase, кабинет Авито и то, что видит
/// покупатель, разошлись между собой.

const money = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;
const area = (value: number | null) =>
  value === null ? "—" : `${value.toLocaleString("ru-RU")} м²`;

function Stat({ label, value, tone }: { label: string; value: number; tone?: "warn" | "crit" }) {
  const color = value === 0 ? "" : tone === "crit" ? "text-crit" : tone === "warn" ? "text-warn" : "";
  return (
    <div className="flex flex-col gap-1 bg-surface-2 px-4 py-3">
      <span className="font-mono text-[10px] uppercase tracking-[0.09em] text-ink-3">{label}</span>
      <span className={`font-mono text-2xl font-semibold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}

function Rejected({ check }: { check: AccountCheck }) {
  const cause = summarizeRejections(check.rejected);

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">
        Не доехали до Авито — {check.rejected.length}
      </h3>
      <div className="overflow-x-auto border border-line">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-line-2 bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
              <th className="px-3 py-2 font-medium">Лот</th>
              <th className="px-3 py-2 text-right font-medium">Комнат</th>
              <th className="px-3 py-2 text-right font-medium">Общая</th>
              <th className="px-3 py-2 text-right font-medium">Жилая</th>
              <th className="px-3 py-2 text-right font-medium">Этаж</th>
              <th className="px-3 py-2 text-right font-medium">Цена</th>
              <th className="px-3 py-2 font-medium">Что говорит Авито</th>
            </tr>
          </thead>
          <tbody>
            {check.rejected.map((lot) => (
              <tr key={lot.adId} className="border-b border-line align-top last:border-b-0">
                <td className="px-3 py-1.5 font-mono tabular-nums">{lot.adId}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{lot.rooms ?? "—"}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{area(lot.square)}</td>
                <td
                  className={`px-3 py-1.5 text-right font-mono tabular-nums ${
                    lot.square !== null && lot.livingSpace !== null && lot.livingSpace > lot.square
                      ? "bg-crit-soft text-crit"
                      : ""
                  }`}
                >
                  {area(lot.livingSpace)}
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{lot.floor ?? "—"}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                  {lot.price === null ? "—" : money(lot.price)}
                </td>
                <td className="px-3 py-1.5 text-ink-2">
                  {lot.reasons.length === 0 ? "Причина в отчёте не указана" : lot.reasons.join("; ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cause && (
        <p className="border-l-2 border-crit pl-3 text-sm text-ink-2">
          <span className="font-medium text-ink">Что на самом деле не так.</span> {cause}
        </p>
      )}
    </div>
  );
}

function Orphans({ check }: { check: AccountCheck }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Висят на Авито, а в фиде их нет — {check.orphans.length}</h3>
      <p className="text-sm text-ink-2">
        Profitbase перестал отдавать лот, а объявление осталось: автозагрузка не снимает то, чего
        не видит. Покупатель такое объявление видит и звонит по нему.
      </p>
      <div className="overflow-x-auto border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line-2 bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
              <th className="px-3 py-2 font-medium">Объявление</th>
              <th className="px-3 py-2 font-medium">Адрес</th>
              <th className="px-3 py-2 text-right font-medium">Цена</th>
              <th className="px-3 py-2 font-medium">Состояние</th>
            </tr>
          </thead>
          <tbody>
            {check.orphans.map((item) => (
              <tr key={item.avitoId} className="border-b border-line last:border-b-0">
                <td className="px-3 py-1.5">
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-line-2 underline-offset-4 hover:text-accent"
                  >
                    {item.title || item.avitoId}
                  </a>
                </td>
                <td className="px-3 py-1.5 text-ink-2">{item.address}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                  {item.price === null ? "—" : money(item.price)}
                </td>
                <td className="px-3 py-1.5 text-ink-2">{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PriceGaps({ check }: { check: AccountCheck }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Цена в объявлении не та, что в фиде — {check.priceGaps.length}</h3>
      <div className="overflow-x-auto border border-line">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line-2 bg-surface-2 text-left font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3">
              <th className="px-3 py-2 font-medium">Лот</th>
              <th className="px-3 py-2 font-medium">Объявление</th>
              <th className="px-3 py-2 text-right font-medium">В фиде</th>
              <th className="px-3 py-2 text-right font-medium">На Авито</th>
              <th className="px-3 py-2 text-right font-medium">Разница</th>
            </tr>
          </thead>
          <tbody>
            {check.priceGaps.map((gap) => (
              <tr key={gap.adId} className="border-b border-line last:border-b-0">
                <td className="px-3 py-1.5 font-mono tabular-nums">{gap.adId}</td>
                <td className="px-3 py-1.5">
                  <a
                    href={gap.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-line-2 underline-offset-4 hover:text-accent"
                  >
                    {gap.title || gap.avitoId}
                  </a>
                </td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{money(gap.feedPrice)}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums">{money(gap.avitoPrice)}</td>
                <td className="px-3 py-1.5 text-right font-mono tabular-nums text-warn">
                  {gap.diff > 0 ? "+" : ""}
                  {money(gap.diff)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default async function AvitoPage() {
  const user = await requireUser();
  const now = new Date();
  const [report, freshness] = await Promise.all([avitoReport(), freshnessOf("avito", now)]);

  return (
    <>
      <PultHeader user={user} active="/avito" />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-8">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Сверка Авито</h1>
          <p className="max-w-[68ch] text-sm text-ink-2">
            Сверяются три списка: что Profitbase отдаёт в фид, что Авито принял и что сейчас видит
            покупатель. Пока они совпадают, объявлений ровно столько, сколько квартир в продаже.
            Каждое расхождение — либо квартира, которую не показывают, либо объявление, за которым
            ничего не стоит.
          </p>
        </div>

        <GradeLegend present={["A", "B"]} />

        {report.accounts.map((check, index) => {
          const account = ACCOUNTS[index];
          const clean =
            check.rejected.length === 0 && check.orphans.length === 0 && check.priceGaps.length === 0;

          return (
            <PultWindow
              key={account.id}
              title={`«${check.object}»`}
              grade="A"
              sources="Авито, Profitbase"
              freshness={freshness}
              action={
                <Link
                  href={`/avito/export?account=${account.id}`}
                  className="underline decoration-line-2 underline-offset-4 hover:text-accent"
                  prefetch={false}
                >
                  Выгрузить расхождения в CSV
                </Link>
              }
            >
              <div className="grid gap-px bg-line sm:grid-cols-2 lg:grid-cols-5">
                <Stat label="В фиде" value={check.feed} />
                <Stat label="На Авито" value={check.published} />
                <Stat label="Не доехали" value={check.rejected.length} tone="crit" />
                <Stat label="Лишние" value={check.orphans.length} tone="crit" />
                <Stat label="Цена разошлась" value={check.priceGaps.length} tone="warn" />
              </div>

              {clean ? (
                <p className="text-sm text-ink-2">
                  Расхождений нет: все {check.feed} лотов фида опубликованы, лишних объявлений
                  не висит, цены совпадают.
                </p>
              ) : (
                <>
                  {check.rejected.length > 0 && <Rejected check={check} />}
                  {check.orphans.length > 0 && <Orphans check={check} />}
                  {check.priceGaps.length > 0 && <PriceGaps check={check} />}
                </>
              )}
            </PultWindow>
          );
        })}

        <section className="border border-line bg-surface px-4 py-3">
          <h2 className="text-sm font-medium">Чего эта сверка пока не видит</h2>
          <p className="mt-1.5 max-w-[68ch] text-sm text-ink-2">
            Проданную квартиру, которая осталась в продаже. Profitbase отдаёт проданные лоты
            в фид наравне с остальными, а признака «продано» в фиде нет — для пульта такой лот
            выглядит обычным. Проверка включится, когда откроется API Profitbase: нужно добавить
            IP сервера в список разрешённых.
          </p>
        </section>
      </main>
    </>
  );
}
