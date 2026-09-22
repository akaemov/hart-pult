import { describe, expect, it } from "vitest";
import { parseFeed } from "./avito-feed";

const feed = `<?xml version="1.0" encoding="UTF-8"?>
<Ads formatVersion="3" target="Avito.ru">
 <Ad>
  <Id>17815293</Id>
  <Description><![CDATA[ЖК «ЗАРЯ»<br>Общая площадь — 39,5 кв. м]]></Description>
  <Price>7573359</Price>
  <Square>39.5</Square>
  <Floor>2</Floor>
  <Rooms>1</Rooms>
  <LivingSpace/>
  <Images><Image url="https://example.com/1.jpg"/></Images>
 </Ad>
 <Ad>
  <Id>17688965</Id>
  <Price>16 710 204</Price>
  <Square>84,14</Square>
  <LivingSpace>84.58</LivingSpace>
  <Rooms>3</Rooms>
  <Floor>6</Floor>
 </Ad>
 <Ad>
  <Price>1</Price>
 </Ad>
</Ads>`;

describe("parseFeed", () => {
  it("читает нужные поля и пропускает описание с картинками", () => {
    const ads = parseFeed(feed);
    expect(ads).toHaveLength(2);
    expect(ads[0]).toEqual({
      adId: "17815293",
      rooms: 1,
      square: 39.5,
      livingSpace: null,
      floor: 2,
      price: 7573359,
    });
  });

  it("понимает запятую в дробных и пробелы в цене", () => {
    const [, second] = parseFeed(feed);
    expect(second.square).toBe(84.14);
    expect(second.livingSpace).toBe(84.58);
    expect(second.price).toBe(16710204);
  });

  it("выбрасывает лот без Id: его не с чем сопоставить", () => {
    expect(parseFeed(feed).every((ad) => ad.adId)).toBe(true);
  });

  it("на пустом фиде возвращает пустой список, а не падает", () => {
    expect(parseFeed("<Ads></Ads>")).toEqual([]);
  });
});
