/// Куда вернуть человека после входа. Принимается только путь внутри пульта:
/// `//evil.example` и `/\evil.example` браузер понимает как другой сайт.
export function safeNextPath(value: unknown): string {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/")) return "/";
  if (value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (value === "/login" || value.startsWith("/login?")) return "/";
  return value;
}
