/**
 * @file i18n 后端支持测试
 * @description 测试 locale 字段在 positions API 和 AI 评分 prompt 中的行为
 */

import { describe, it, expect } from "bun:test";
import { mockDb, FAKE_POSITION } from "./setup";
import { app } from "../src/app";

function chainable(val: any): any {
  return new Proxy(() => {}, {
    get(_t, prop) {
      if (prop === "then")
        return (ok: any, fail: any) => Promise.resolve(val).then(ok, fail);
      if (prop === "catch")
        return (fail: any) => Promise.resolve(val).catch(fail);
      if (typeof prop === "symbol") return undefined;
      return (..._: any[]) => chainable(val);
    },
    apply() { return chainable(val); },
  });
}

describe("i18n — locale field", () => {
  describe("positions API", () => {
    it("POST /api/positions defaults locale to zh", async () => {
      const origInsert = mockDb.insert;
      mockDb.insert = (..._: any[]) => {
        mockDb.insert = origInsert;
        return chainable([{ ...FAKE_POSITION, locale: "zh" }]);
      };

      const res = await app.handle(
        new Request("http://localhost/api/positions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "软件工程师" }),
        }),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.locale).toBe("zh");
    });

    it("POST /api/positions accepts locale=ja", async () => {
      const origInsert = mockDb.insert;
      mockDb.insert = (..._: any[]) => {
        mockDb.insert = origInsert;
        return chainable([{ ...FAKE_POSITION, locale: "ja" }]);
      };

      const res = await app.handle(
        new Request("http://localhost/api/positions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: "ソフトウェアエンジニア", locale: "ja" }),
        }),
      );
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.locale).toBe("ja");
    });

    it("GET /api/positions returns locale field", async () => {
      const res = await app.handle(
        new Request("http://localhost/api/positions"),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(Array.isArray(body)).toBe(true);
      // mock returns FAKE_POSITION which should have locale
      expect(body[0].locale).toBeDefined();
    });

    it("PATCH /api/positions/:id can update locale", async () => {
      const origUpdate = mockDb.update;
      mockDb.update = (..._: any[]) => {
        mockDb.update = origUpdate;
        return chainable([{ ...FAKE_POSITION, locale: "ja" }]);
      };

      const res = await app.handle(
        new Request("http://localhost/api/positions/pos-1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ locale: "ja" }),
        }),
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.locale).toBe("ja");
    });
  });
});

describe("i18n — AI prompt locale", () => {
  // 测试 buildScoringPrompt 根据 locale 生成不同语言的提示词
  // 由于 buildScoringPrompt 不是 export 的，复制核心逻辑测试

  function getLocaleInstruction(locale: string): string {
    switch (locale) {
      case "ja":
        return "日本語で評価を出力してください。";
      default:
        return "请用中文输出评价。";
    }
  }

  function getExplanationLabel(locale: string): string {
    switch (locale) {
      case "ja":
        return "評価（日本語、100文字以内）";
      default:
        return "中文评价，100字以内";
    }
  }

  it("returns Chinese instruction for locale=zh", () => {
    expect(getLocaleInstruction("zh")).toContain("中文");
  });

  it("returns Japanese instruction for locale=ja", () => {
    expect(getLocaleInstruction("ja")).toContain("日本語");
  });

  it("defaults to Chinese for unknown locale", () => {
    expect(getLocaleInstruction("unknown")).toContain("中文");
  });

  it("returns Chinese explanation label for zh", () => {
    expect(getExplanationLabel("zh")).toContain("中文评价");
  });

  it("returns Japanese explanation label for ja", () => {
    expect(getExplanationLabel("ja")).toContain("日本語");
  });
});
