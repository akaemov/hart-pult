import { amoList, type AmoCustomField, type AmoLead, type AmoNote, type AmoUser } from "../amo";
import { prisma } from "../prisma";
import type { Collector, SyncContext } from "./run";

/// Сбор обращений и звонков из amoCRM.
///
/// Окно сбора — последние `days` дней по дате создания сделки. Прогон
/// идемпотентен: те же данные можно собрать повторно, всё перезапишется.
/// Инкрементальный сбор здесь намеренно не делается: статусы и звонки
/// меняются задним числом, а объём за квартал — тысячи строк, не миллионы.

/// Системные статусы amoCRM: «реализовано» и «закрыто без успеха».
const WON = 142;
const LOST = 143;

/// Поля, похожие на источник обращения. Набор полей у каждого аккаунта свой,
/// поэтому ищем по названию, а не по фиксированным id.
const SOURCE_FIELD = /utm|источник|source|канал|откуда|реклам/i;

const CHUNK = 100;

/// Пакетная запись. Таймаут задан явно: по умолчанию у интерактивной
/// транзакции 5 секунд, а локальная база из `prisma dev` выполняет запросы
/// строго по одному и в этот лимит не укладывается.
const TX = { timeout: 120_000, maxWait: 20_000 };

async function collectAll<T>(source: AsyncGenerator<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of source) items.push(item);
  return items;
}

function chunked<T>(items: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function hasFilledSource(lead: AmoLead, sourceFieldIds: Set<number>): boolean {
  return (lead.custom_fields_values ?? []).some(
    (field) =>
      sourceFieldIds.has(field.field_id) &&
      (field.values ?? []).some((v) => v.value !== null && v.value !== "" && v.value !== undefined),
  );
}

export function amocrmCollector(days: number): Collector {
  return async (ctx: SyncContext) => {
    const from = Math.floor(Date.now() / 1000) - days * 24 * 60 * 60;
    const to = Math.floor(Date.now() / 1000);

    const fields = await collectAll(
      amoList<AmoCustomField>("/api/v4/leads/custom_fields", "custom_fields"),
    );
    const sourceFieldIds = new Set(
      fields.filter((field) => SOURCE_FIELD.test(field.name)).map((field) => field.id),
    );

    const users = await collectAll(amoList<AmoUser>("/api/v4/users", "users"));
    await ctx.saveRaw("/api/v4/users", users as unknown as object[]);
    for (const batch of chunked(users)) {
      await prisma.$transaction(
        batch.map((user) =>
          prisma.amoUser.upsert({
            where: { id: user.id },
            create: { id: user.id, name: user.name },
            update: { name: user.name },
          }),
        ),
        TX,
      );
    }

    const leads = await collectAll(
      amoList<AmoLead>("/api/v4/leads", "leads", {
        filter: { created_at: { from, to } },
        with: "contacts",
      }),
    );
    await ctx.saveRaw("/api/v4/leads", leads as unknown as object[]);

    const knownUsers = new Set(users.map((user) => user.id));
    for (const batch of chunked(leads)) {
      await prisma.$transaction(
        batch.map((lead) => {
          const data = {
            name: lead.name,
            createdAt: new Date(lead.created_at * 1000),
            statusId: lead.status_id,
            pipelineId: lead.pipeline_id,
            isClosed: lead.status_id === WON || lead.status_id === LOST,
            hasSource: hasFilledSource(lead, sourceFieldIds),
            // Ответственный может быть удалён из аккаунта — тогда связи нет,
            // но сделка всё равно должна сохраниться.
            responsibleUserId: knownUsers.has(lead.responsible_user_id)
              ? lead.responsible_user_id
              : null,
          };
          return prisma.lead.upsert({
            where: { id: lead.id },
            create: { id: lead.id, ...data },
            update: data,
          });
        }),
        TX,
      );
    }

    const links = leads.flatMap((lead) =>
      (lead._embedded?.contacts ?? []).map((contact) => ({
        leadId: lead.id,
        contactId: contact.id,
      })),
    );
    await prisma.leadContact.deleteMany({ where: { leadId: { in: leads.map((l) => l.id) } } });
    for (const batch of chunked(links)) {
      await prisma.leadContact.createMany({ data: batch, skipDuplicates: true });
    }

    // Звонки лежат примечаниями и на сделке, и на контакте: какой вариант
    // пишет телефония, зависит от интеграции, поэтому читаем оба.
    const leadNotes = await collectAll(
      amoList<AmoNote>("/api/v4/leads/notes", "notes", { filter: { updated_at: { from, to } } }),
    );
    const contactNotes = await collectAll(
      amoList<AmoNote>("/api/v4/contacts/notes", "notes", { filter: { updated_at: { from, to } } }),
    );
    await ctx.saveRaw("/api/v4/leads/notes", leadNotes as unknown as object[]);
    await ctx.saveRaw("/api/v4/contacts/notes", contactNotes as unknown as object[]);

    const leadById = new Map(leads.map((lead) => [lead.id, lead]));
    const leadsByContact = new Map<number, number[]>();
    for (const link of links) {
      leadsByContact.set(link.contactId, [
        ...(leadsByContact.get(link.contactId) ?? []),
        link.leadId,
      ]);
    }

    const isCall = (note: AmoNote) =>
      note.note_type === "call_in" || note.note_type === "call_out";

    type CallRow = {
      id: number;
      direction: "IN" | "OUT";
      createdAt: Date;
      durationSec: number | null;
      provider: string;
      leadId: number;
    };
    const calls = new Map<number, CallRow>();

    const remember = (note: AmoNote, leadId: number) => {
      const lead = leadById.get(leadId);
      // Звонок раньше создания сделки относится к прошлому обращению того же
      // человека — в скорость ответа по этой сделке он не входит.
      if (!lead || note.created_at < lead.created_at) return;
      // Один и тот же звонок может прийти и со сделки, и с контакта:
      // ключ по id примечания склеивает дубли.
      calls.set(note.id, {
        id: note.id,
        direction: note.note_type === "call_out" ? "OUT" : "IN",
        createdAt: new Date(note.created_at * 1000),
        durationSec: note.params?.duration ?? null,
        provider: note.params?.source ?? "",
        leadId,
      });
    };

    for (const note of leadNotes.filter(isCall)) remember(note, note.entity_id);
    for (const note of contactNotes.filter(isCall)) {
      for (const leadId of leadsByContact.get(note.entity_id) ?? []) remember(note, leadId);
    }

    const callRows = [...calls.values()];
    for (const batch of chunked(callRows)) {
      await prisma.$transaction(
        batch.map((call) =>
          prisma.call.upsert({
            where: { id: call.id },
            create: call,
            update: call,
          }),
        ),
        TX,
      );
    }

    // Первый исходящий звонок считается один раз при сборе: иначе каждое окно
    // пересчитывало бы минимум по всем звонкам на каждый показ страницы.
    const firstCalls = await prisma.call.groupBy({
      by: ["leadId"],
      where: { direction: "OUT", leadId: { in: leads.map((lead) => lead.id) } },
      _min: { createdAt: true },
    });
    const firstByLead = new Map(firstCalls.map((row) => [row.leadId, row._min.createdAt]));

    for (const batch of chunked(leads)) {
      await prisma.$transaction(
        batch.map((lead) =>
          prisma.lead.update({
            where: { id: lead.id },
            data: { firstOutgoingCallAt: firstByLead.get(lead.id) ?? null },
          }),
        ),
        TX,
      );
    }

    return { rows: leads.length + callRows.length };
  };
}
