import { describe, expect, it } from "vitest";
import { CHANNELS, detectChannel, detectObject, type LeadMarks } from "./channels";

const lead = (marks: Partial<LeadMarks> = {}): LeadMarks => ({
  name: null, sourceLabel: null, utmSource: null, utmCampaign: null, referrer: null, ...marks,
});

describe("detectObject", () => {
  it("читает объект из названия сделки", () => {
    expect(detectObject(lead({ name: "ЗАРЯ/Бураканова Наиля" }))).toBe("Заря");
    expect(detectObject(lead({ name: "Пьермонт/Алия Иванова" }))).toBe("Пьермонт");
  });

  it("падает на лендинг, когда в названии пусто", () => {
    expect(detectObject(lead({ name: "Заявка с сайта", referrer: "https://zaryaufa.rqch.ru/" }))).toBe("Заря");
    expect(detectObject(lead({ referrer: "https://pjermontufa-transh.rqch.ru/" }))).toBe("Пьермонт");
  });

  it("затем на рекламную кампанию", () => {
    expect(detectObject(lead({ utmCampaign: "rsya_zarya" }))).toBe("Заря");
    expect(detectObject(lead({ utmCampaign: "telegram_perform" }))).toBe("Пьермонт");
  });

  it("оба объекта сразу — это неопределённость, а не выбор первого", () => {
    expect(detectObject(lead({ name: "Заря и Пьермонт, сравнивает" }))).toBe("Не определён");
  });

  it("без единого признака честно отвечает «не определён»", () => {
    expect(detectObject(lead({ name: "Входящий звонок" }))).toBe("Не определён");
  });
});

describe("detectChannel", () => {
  it("метка означает диджитал", () => {
    expect(detectChannel(lead({ utmSource: "yandex" }))).toBe("Диджитал (Директ / VK / соцсети)");
  });

  it("фиксация агентством сильнее метки", () => {
    // Человек пришёл по рекламе, но сделку ведёт риелтор — это фиксация.
    expect(detectChannel(lead({ sourceLabel: "Риелтор", utmSource: "yandex" })))
      .toBe("Фиксации от агентств");
  });

  it("раскладывает значения поля «Источник заявки»", () => {
    expect(detectChannel(lead({ sourceLabel: "Сайт" }))).toBe("Сайт / прямые обращения");
    expect(detectChannel(lead({ sourceLabel: "Звонок" }))).toBe("Сайт / прямые обращения");
    expect(detectChannel(lead({ sourceLabel: "Пешеход" }))).toBe("Наружка / офлайн");
    expect(detectChannel(lead({ sourceLabel: "Рекомендация" }))).toBe("Сарафан / реферал");
    expect(detectChannel(lead({ sourceLabel: "Другое" }))).toBe("Прочие источники");
  });

  it("готов к источникам, которых в CRM пока нет", () => {
    expect(detectChannel(lead({ sourceLabel: "Авито" }))).toBe("Avito");
    expect(detectChannel(lead({ sourceLabel: "ЦИАН" }))).toBe("ЦИАН");
  });

  it("неизвестное значение идёт в «не указан», а не в «прочие»", () => {
    expect(detectChannel(lead({ sourceLabel: "Вконтакте директ" }))).toBe("Источник не указан");
    expect(detectChannel(lead())).toBe("Источник не указан");
  });

  it("каждый канал из списка достижим или зарезервирован осознанно", () => {
    expect(CHANNELS).toHaveLength(10);
    expect(CHANNELS[CHANNELS.length - 1]).toBe("Источник не указан");
  });
});
