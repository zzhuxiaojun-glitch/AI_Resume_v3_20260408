import { describe, it, expect } from "bun:test";

// 测试 findAttachments 纯函数（从 email.ts 复制逻辑）
interface AttachmentInfo {
  part: string;
  filename: string;
}

function findAttachments(structure: any, prefix = ""): AttachmentInfo[] {
  const results: AttachmentInfo[] = [];

  if (structure.childNodes) {
    for (let i = 0; i < structure.childNodes.length; i++) {
      const part = prefix ? `${prefix}.${i + 1}` : String(i + 1);
      results.push(...findAttachments(structure.childNodes[i], part));
    }
  } else {
    const filename =
      structure.dispositionParameters?.filename ??
      structure.parameters?.name ??
      "";

    if (/\.(pdf|docx?)$/i.test(filename)) {
      const part = prefix || "1";
      results.push({ part, filename });
    }
  }

  return results;
}

describe("Email helpers — findAttachments", () => {
  it("finds PDF attachment at top level", () => {
    const structure = {
      childNodes: [
        { type: "text/plain" },
        {
          dispositionParameters: { filename: "resume.pdf" },
        },
      ],
    };
    const result = findAttachments(structure);
    expect(result).toEqual([{ part: "2", filename: "resume.pdf" }]);
  });

  it("finds nested DOCX attachment", () => {
    const structure = {
      childNodes: [
        {
          childNodes: [
            { type: "text/html" },
            {
              parameters: { name: "简历.docx" },
            },
          ],
        },
      ],
    };
    const result = findAttachments(structure);
    expect(result).toEqual([{ part: "1.2", filename: "简历.docx" }]);
  });

  it("finds inline attachment (BOSS直聘 style)", () => {
    const structure = {
      childNodes: [
        { type: "text/plain" },
        {
          // BOSS直聘 sends as inline, not attachment
          parameters: { name: "候选人简历.pdf" },
        },
      ],
    };
    const result = findAttachments(structure);
    expect(result).toEqual([{ part: "2", filename: "候选人简历.pdf" }]);
  });

  it("ignores non-resume attachments", () => {
    const structure = {
      childNodes: [
        { dispositionParameters: { filename: "photo.jpg" } },
        { dispositionParameters: { filename: "data.xlsx" } },
      ],
    };
    const result = findAttachments(structure);
    expect(result).toEqual([]);
  });

  it("finds multiple attachments", () => {
    const structure = {
      childNodes: [
        { type: "text/plain" },
        { dispositionParameters: { filename: "resume1.pdf" } },
        { parameters: { name: "resume2.doc" } },
      ],
    };
    const result = findAttachments(structure);
    expect(result).toHaveLength(2);
  });

  it("handles leaf node with no children", () => {
    const structure = {
      dispositionParameters: { filename: "resume.pdf" },
    };
    const result = findAttachments(structure);
    expect(result).toEqual([{ part: "1", filename: "resume.pdf" }]);
  });
});
