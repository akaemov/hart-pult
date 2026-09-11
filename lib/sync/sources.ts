/// Источники данных пульта. maxAgeMinutes — сколько данные считаются свежими:
/// после этого окно помечается устаревшим, а не молча показывает старое.

export type SourceId = "amocrm" | "inventory" | "metrika" | "direct" | "vk_ads" | "wordstat";

export type Source = {
  id: SourceId;
  label: string;
  /// Что пульт из него берёт — в словах пользователя, не API.
  feeds: string;
  maxAgeMinutes: number;
};

const HOUR = 60;

export const SOURCES: readonly Source[] = [
  // Опрашивается каждые несколько минут: на необработанные обращения реагируют в течение дня.
  { id: "amocrm", label: "amoCRM", feeds: "обращения, сделки, звонки", maxAgeMinutes: 30 },
  { id: "inventory", label: "Учёт остатков", feeds: "шахматка, продажи, цены", maxAgeMinutes: 30 * HOUR },
  { id: "metrika", label: "Яндекс.Метрика", feeds: "визиты, цели сайта", maxAgeMinutes: 30 * HOUR },
  { id: "direct", label: "Яндекс.Директ", feeds: "расход, показы, клики", maxAgeMinutes: 30 * HOUR },
  { id: "vk_ads", label: "VK Ads", feeds: "расход, показы, клики", maxAgeMinutes: 30 * HOUR },
  // Опрашивается раз в неделю из-за суточных лимитов API.
  { id: "wordstat", label: "Вордстат", feeds: "динамика спроса", maxAgeMinutes: 8 * 24 * HOUR },
];
