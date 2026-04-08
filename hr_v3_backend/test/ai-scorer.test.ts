import { describe, it, expect } from "bun:test";
import { z } from "zod/v4";

// 直接测试 extractJson 纯函数（不需要 mock）
// 由于 extractJson 不是 export 的，我们在这里复制逻辑做单元测试
// 后续可以考虑 export 它

function extractJson(text: string): string {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) cleaned = fenceMatch[1].trim();
  return cleaned;
}

// 复制 round2 和 scoreSchema 做单元测试

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

const scoreSchema = z.object({
  totalScore: z.number().min(0).max(100).transform(round2),
  mustScore: z.number().min(0).max(100).transform(round2),
  niceScore: z.number().min(0).max(100).transform(round2),
  rejectPenalty: z.number().min(0).max(100).transform(round2),
  educationScore: z.number().min(0).max(100).transform(round2).default(0),
  grade: z.enum(["A", "B", "C", "D", "F"]),
  matchedSkills: z.array(z.string()),
  missingSkills: z.array(z.string()),
  explanation: z.string(),
});

describe("AI Scorer — extractJson", () => {
  it("removes <think> tags", () => {
    const input = '<think>让我分析一下...</think>{"totalScore": 75}';
    const result = extractJson(input);
    expect(result).toBe('{"totalScore": 75}');
  });

  it("removes markdown code fences", () => {
    const input = '```json\n{"totalScore": 75}\n```';
    const result = extractJson(input);
    expect(result).toBe('{"totalScore": 75}');
  });

  it("handles <think> + code fence together", () => {
    const input =
      '<think>分析简历中...</think>\n```json\n{"totalScore": 75, "grade": "B"}\n```';
    const result = extractJson(input);
    expect(JSON.parse(result)).toEqual({ totalScore: 75, grade: "B" });
  });

  it("handles plain JSON with no wrapping", () => {
    const input = '{"totalScore": 100}';
    const result = extractJson(input);
    expect(result).toBe('{"totalScore": 100}');
  });

  it("handles code fence without json label", () => {
    const input = '```\n{"totalScore": 50}\n```';
    const result = extractJson(input);
    expect(result).toBe('{"totalScore": 50}');
  });
});

describe("AI Scorer — round2", () => {
  it("rounds to 2 decimal places", () => {
    expect(round2(75.555)).toBe(75.56);
    expect(round2(75.554)).toBe(75.55);
    expect(round2(80)).toBe(80);
    expect(round2(0.001)).toBe(0);
    expect(round2(99.999)).toBe(100);
  });

  it("handles exact 2 decimal values unchanged", () => {
    expect(round2(75.50)).toBe(75.5);
    expect(round2(33.33)).toBe(33.33);
  });

  it("handles edge values", () => {
    expect(round2(0)).toBe(0);
    expect(round2(100)).toBe(100);
    expect(round2(0.005)).toBe(0.01);
  });
});

describe("AI Scorer — scoreSchema", () => {
  const validInput = {
    totalScore: 75.555,
    mustScore: 80.123,
    niceScore: 60.999,
    rejectPenalty: 5.001,
    grade: "B",
    matchedSkills: ["TypeScript"],
    missingSkills: ["Docker"],
    explanation: "评价内容",
  };

  it("rounds all score fields to 2 decimal places", () => {
    const result = scoreSchema.parse(validInput);
    expect(result.totalScore).toBe(75.56);
    expect(result.mustScore).toBe(80.12);
    expect(result.niceScore).toBe(61);
    expect(result.rejectPenalty).toBe(5);
  });

  it("preserves non-score fields unchanged", () => {
    const result = scoreSchema.parse(validInput);
    expect(result.grade).toBe("B");
    expect(result.matchedSkills).toEqual(["TypeScript"]);
    expect(result.missingSkills).toEqual(["Docker"]);
    expect(result.explanation).toBe("评价内容");
  });

  it("rejects score out of range (negative)", () => {
    expect(() =>
      scoreSchema.parse({ ...validInput, totalScore: -1 }),
    ).toThrow();
  });

  it("rejects score out of range (>100)", () => {
    expect(() =>
      scoreSchema.parse({ ...validInput, mustScore: 101 }),
    ).toThrow();
  });

  it("rejects invalid grade", () => {
    expect(() =>
      scoreSchema.parse({ ...validInput, grade: "E" }),
    ).toThrow();
  });

  it("accepts integer scores and rounds correctly", () => {
    const result = scoreSchema.parse({
      ...validInput,
      totalScore: 80,
      mustScore: 90,
      niceScore: 70,
      rejectPenalty: 0,
    });
    expect(result.totalScore).toBe(80);
    expect(result.mustScore).toBe(90);
    expect(result.niceScore).toBe(70);
    expect(result.rejectPenalty).toBe(0);
  });

  it("rounds educationScore to 2 decimal places", () => {
    const result = scoreSchema.parse({
      ...validInput,
      educationScore: 85.555,
    });
    expect(result.educationScore).toBe(85.56);
  });

  it("rejects educationScore out of range (negative)", () => {
    expect(() =>
      scoreSchema.parse({ ...validInput, educationScore: -1 }),
    ).toThrow();
  });

  it("rejects educationScore out of range (>100)", () => {
    expect(() =>
      scoreSchema.parse({ ...validInput, educationScore: 101 }),
    ).toThrow();
  });

  it("defaults educationScore to 0 when missing (backward compat)", () => {
    const input = { ...validInput };
    delete (input as any).educationScore;
    const result = scoreSchema.parse(input);
    expect(result.educationScore).toBe(0);
  });
});
