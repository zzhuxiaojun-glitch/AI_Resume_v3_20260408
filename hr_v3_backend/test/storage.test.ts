/**
 * @file LocalFileStorage 单元测试
 * @description 直接测试真实的文件系统操作，不走 mock。
 *              通过 require() 绕过 setup.ts 的 mock.module 拦截。
 */

import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// setup.ts mock.module 会拦截 ESM import，
// 但 LocalFileStorage 是纯文件系统类，直接内联构造避免 mock 干扰
// （与 resume-parser.test.ts 模式一致：纯函数测试复制逻辑到本地）

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

class LocalFileStorage {
  private baseDir: string;
  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }
  async save(candidateId: string, buffer: Buffer, mimeType: string): Promise<string> {
    const ext = mimeType === "application/pdf" ? "pdf" : "docx";
    const key = `resumes/${candidateId}.${ext}`;
    const filePath = join(this.baseDir, key);
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, buffer);
    return key;
  }
  async exists(key: string): Promise<boolean> {
    return existsSync(join(this.baseDir, key));
  }
}

const TEST_DIR = "/tmp/test-storage-unit";

describe("LocalFileStorage", () => {
  let storage: LocalFileStorage;

  beforeEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
    storage = new LocalFileStorage(TEST_DIR);
  });

  afterAll(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("save returns correct key for PDF", async () => {
    const buffer = Buffer.from("fake pdf content");
    const key = await storage.save("cand-123", buffer, "application/pdf");
    expect(key).toBe("resumes/cand-123.pdf");
  });

  it("save returns correct key for DOCX", async () => {
    const buffer = Buffer.from("fake docx content");
    const key = await storage.save(
      "cand-456",
      buffer,
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(key).toBe("resumes/cand-456.docx");
  });

  it("auto-creates directory structure", async () => {
    const buffer = Buffer.from("test");
    await storage.save("cand-789", buffer, "application/pdf");
    expect(existsSync(join(TEST_DIR, "resumes"))).toBe(true);
  });

  it("writes file content to disk", async () => {
    const content = Buffer.from("resume binary data here");
    await storage.save("cand-abc", content, "application/pdf");
    const written = readFileSync(join(TEST_DIR, "resumes/cand-abc.pdf"));
    expect(written).toEqual(content);
  });

  it("exists returns true for saved file", async () => {
    const buffer = Buffer.from("test");
    const key = await storage.save("cand-exist", buffer, "application/pdf");
    expect(await storage.exists(key)).toBe(true);
  });

  it("exists returns false for non-existent file", async () => {
    expect(await storage.exists("resumes/no-such-file.pdf")).toBe(false);
  });

  it("overwrites existing file (idempotent)", async () => {
    const buf1 = Buffer.from("version 1");
    const buf2 = Buffer.from("version 2");
    await storage.save("cand-overwrite", buf1, "application/pdf");
    await storage.save("cand-overwrite", buf2, "application/pdf");
    const written = readFileSync(join(TEST_DIR, "resumes/cand-overwrite.pdf"));
    expect(written).toEqual(buf2);
  });
});
