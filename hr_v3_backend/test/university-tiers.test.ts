import { describe, it, expect } from "bun:test";
import type { UniversityTier } from "../src/lib/types";

// 复制纯函数到测试文件中（与 ai-scorer.test.ts 同理，避免被 setup.ts mock 覆盖）

const DOMESTIC_TAG_MAP: Record<string, UniversityTier> = {
  "985": "S",
  "211": "A",
  "双一流": "A",
  "省重点一本": "B",
  "普通一本": "C",
  "普通本科": "D",
};

const TIER_SCORE_MAP: Record<UniversityTier, number> = {
  S: 95.00,
  A: 85.00,
  B: 70.00,
  C: 55.00,
  D: 30.00,
};

function mapDomesticTagToTier(tag: string | null | undefined): UniversityTier {
  if (!tag) return "D";
  return DOMESTIC_TAG_MAP[tag] ?? "D";
}

function mapQsRankToTier(rank: number | null | undefined): UniversityTier {
  if (rank == null) return "D";
  if (rank <= 50) return "S";
  if (rank <= 100) return "A";
  if (rank <= 300) return "B";
  if (rank <= 500) return "C";
  return "D";
}

function tierToScore(tier: UniversityTier): number {
  return TIER_SCORE_MAP[tier];
}

function extractUniversityName(text: string): string | null {
  const cnGraduated = text.match(/毕业于([\u4e00-\u9fa5]{2,20}(?:大学|学院))/);
  if (cnGraduated) return cnGraduated[1];

  const cnDirect = text.match(/([\u4e00-\u9fa5]{2,10}大学)/);
  if (cnDirect) return cnDirect[1];

  const enUnivOf = text.match(/\b(University of [A-Z][\w\s]*?)(?:\s+with|\s*,|\s*\.|$)/);
  if (enUnivOf) return enUnivOf[1].trim();

  const enUnivSuffix = text.match(
    /\b((?:[A-Z][\w]*\s+)+(?:University|Institute of Technology))\b/,
  );
  if (enUnivSuffix) return enUnivSuffix[1].trim();

  return null;
}

describe("University Tier Mapping — mapDomesticTagToTier", () => {
  it("maps 985 to S tier", () => {
    expect(mapDomesticTagToTier("985")).toBe("S");
  });

  it("maps 211 to A tier", () => {
    expect(mapDomesticTagToTier("211")).toBe("A");
  });

  it("maps 双一流 to A tier", () => {
    expect(mapDomesticTagToTier("双一流")).toBe("A");
  });

  it("maps 省重点一本 to B tier", () => {
    expect(mapDomesticTagToTier("省重点一本")).toBe("B");
  });

  it("maps 普通一本 to C tier", () => {
    expect(mapDomesticTagToTier("普通一本")).toBe("C");
  });

  it("maps 普通本科 to D tier", () => {
    expect(mapDomesticTagToTier("普通本科")).toBe("D");
  });

  it("maps null/undefined to D tier", () => {
    expect(mapDomesticTagToTier(null)).toBe("D");
    expect(mapDomesticTagToTier(undefined)).toBe("D");
  });

  it("maps unknown tag to D tier", () => {
    expect(mapDomesticTagToTier("未知类型")).toBe("D");
  });
});

describe("University Tier Mapping — mapQsRankToTier", () => {
  it("maps rank 1-50 to S tier", () => {
    expect(mapQsRankToTier(1)).toBe("S");
    expect(mapQsRankToTier(50)).toBe("S");
  });

  it("maps rank 51-100 to A tier", () => {
    expect(mapQsRankToTier(51)).toBe("A");
    expect(mapQsRankToTier(100)).toBe("A");
  });

  it("maps rank 101-300 to B tier", () => {
    expect(mapQsRankToTier(101)).toBe("B");
    expect(mapQsRankToTier(300)).toBe("B");
  });

  it("maps rank 301-500 to C tier", () => {
    expect(mapQsRankToTier(301)).toBe("C");
    expect(mapQsRankToTier(500)).toBe("C");
  });

  it("maps rank 500+ to D tier", () => {
    expect(mapQsRankToTier(501)).toBe("D");
    expect(mapQsRankToTier(1000)).toBe("D");
  });

  it("maps null/undefined to D tier", () => {
    expect(mapQsRankToTier(null)).toBe("D");
    expect(mapQsRankToTier(undefined)).toBe("D");
  });
});

describe("University Tier Mapping — tierToScore", () => {
  it("S tier → 95.00", () => {
    expect(tierToScore("S")).toBe(95.00);
  });

  it("A tier → 85.00", () => {
    expect(tierToScore("A")).toBe(85.00);
  });

  it("B tier → 70.00", () => {
    expect(tierToScore("B")).toBe(70.00);
  });

  it("C tier → 55.00", () => {
    expect(tierToScore("C")).toBe(55.00);
  });

  it("D tier → 30.00", () => {
    expect(tierToScore("D")).toBe(30.00);
  });
});

// ── extractJlptLevel (copied from university-lookup.ts to avoid mock) ──────────

function extractJlptLevel(text: string): "N1" | "N2" | "N3" | "N4" | "N5" | null {
  const matches = text.matchAll(/(?:JLPT\s*|日本語能力試験\s*|日语能力考试\s*|日语\s*)?[Nn]([1-5])(?:\s*级|級)?/g);
  let highest: number | null = null;
  for (const m of matches) {
    const level = parseInt(m[1]);
    if (highest === null || level < highest) highest = level;
  }
  if (highest === null) return null;
  return `N${highest}` as "N1" | "N2" | "N3" | "N4" | "N5";
}

describe("extractJlptLevel", () => {
  it("extracts N1 from plain text 'N1'", () => {
    expect(extractJlptLevel("日语水平：N1")).toBe("N1");
  });

  it("extracts N2 from 'JLPT N2'", () => {
    expect(extractJlptLevel("持有 JLPT N2 证书")).toBe("N2");
  });

  it("extracts N3 from Japanese 日本語能力試験N3", () => {
    expect(extractJlptLevel("日本語能力試験N3合格")).toBe("N3");
  });

  it("extracts N2 from Chinese '日语N2级'", () => {
    expect(extractJlptLevel("日语N2级")).toBe("N2");
  });

  it("picks the highest level when multiple are mentioned", () => {
    expect(extractJlptLevel("曾持有N3，现已通过N1考试")).toBe("N1");
  });

  it("returns null when no JLPT mentioned", () => {
    expect(extractJlptLevel("有三年Java开发经验")).toBeNull();
  });

  it("handles lowercase n", () => {
    expect(extractJlptLevel("日语 n2 level")).toBe("N2");
  });

  it("handles N5", () => {
    expect(extractJlptLevel("JLPT N5 通過")).toBe("N5");
  });
});

describe("University Tier Mapping — extractUniversityName", () => {
  it("extracts Chinese university name with 毕业于...大学", () => {
    const text = "教育经历：毕业于清华大学计算机科学与技术专业";
    expect(extractUniversityName(text)).toBe("清华大学");
  });

  it("extracts Chinese university name with 毕业于...学院", () => {
    const text = "毕业于浙江工商大学杭州商学院";
    expect(extractUniversityName(text)).toBe("浙江工商大学杭州商学院");
  });

  it("extracts English university name with University keyword", () => {
    const text = "Education: B.S. from Massachusetts Institute of Technology, 2020";
    expect(extractUniversityName(text)).toBe("Massachusetts Institute of Technology");
  });

  it("extracts English university name with University of pattern", () => {
    const text = "I graduated from University of Tokyo with a Master's degree";
    expect(extractUniversityName(text)).toBe("University of Tokyo");
  });

  it("returns null when no university found", () => {
    const text = "有三年工作经验，熟悉TypeScript和React";
    expect(extractUniversityName(text)).toBeNull();
  });

  it("extracts name with XX大学 pattern (no 毕业于 prefix)", () => {
    const text = "北京大学 计算机科学专业 2020年毕业";
    expect(extractUniversityName(text)).toBe("北京大学");
  });
});
