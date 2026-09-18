import { describe, expect, it } from "vitest";
import { normalizeAccount } from "./profitbase";

describe("normalizeAccount", () => {
  it("принимает и поддомен, и целый адрес кабинета", () => {
    expect(normalizeAccount("pb1234")).toBe("pb1234");
    expect(normalizeAccount("https://pb1234.profitbase.ru/")).toBe("pb1234");
    expect(normalizeAccount(" pb1234.profitbase.ru ")).toBe("pb1234");
  });
});
