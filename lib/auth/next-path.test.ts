import { describe, expect, it } from "vitest";
import { safeNextPath } from "./next-path";

describe("возврат после входа", () => {
  it("пропускает путь внутри пульта вместе с параметрами", () => {
    expect(safeNextPath("/sales?period=q3")).toBe("/sales?period=q3");
  });

  it("не уводит на чужой сайт", () => {
    expect(safeNextPath("https://evil.example")).toBe("/");
    expect(safeNextPath("//evil.example")).toBe("/");
    expect(safeNextPath("/\\evil.example")).toBe("/");
  });

  it("не возвращает на страницу входа", () => {
    expect(safeNextPath("/login")).toBe("/");
    expect(safeNextPath("/login?next=/x")).toBe("/");
  });

  it("мусор превращается в главную", () => {
    expect(safeNextPath(undefined)).toBe("/");
    expect(safeNextPath(["/a", "/b"])).toBe("/");
  });
});
