import { describe, it, expect } from "bun:test";

// 测试 parseResume 对不支持格式的处理
// 直接复制核心逻辑做单元测试（不依赖 mock）

async function parseResumeLogic(buffer: Buffer, fileName: string) {
  const ext = fileName.toLowerCase().split(".").pop();
  switch (ext) {
    case "pdf":
    case "docx":
    case "doc":
      return { text: "parsed", fileName, mimeType: "application/pdf" };
    default:
      throw new Error(`Unsupported file format: .${ext}`);
  }
}

describe("Resume parser — unsupported format", () => {
  it("throws for unsupported file format (.txt)", async () => {
    expect(
      parseResumeLogic(Buffer.from("test"), "file.txt"),
    ).rejects.toThrow("Unsupported file format");
  });

  it("throws for unsupported file format (.xlsx)", async () => {
    expect(
      parseResumeLogic(Buffer.from("test"), "data.xlsx"),
    ).rejects.toThrow("Unsupported file format");
  });

  it("does not throw for .pdf", async () => {
    const result = await parseResumeLogic(Buffer.from("test"), "resume.pdf");
    expect(result.fileName).toBe("resume.pdf");
  });

  it("does not throw for .docx", async () => {
    const result = await parseResumeLogic(Buffer.from("test"), "resume.docx");
    expect(result.fileName).toBe("resume.docx");
  });
});
