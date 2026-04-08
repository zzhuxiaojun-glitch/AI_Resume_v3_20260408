/**
 * @file 文件存储抽象层
 * @description 提供简历原件保存的统一接口，当前实现为本地文件系统存储。
 *              未来切换到 Supabase Storage 只需替换 fileStorage 的实现类，调用方零改动。
 */

import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { env } from "../env";

/**
 * 文件存储接口
 * @description 定义保存和检查文件的统一方法，便于替换底层实现
 */
export interface FileStorage {
  /** 保存文件，返回相对路径 key（如 "resumes/{candidateId}.pdf"） */
  save(candidateId: string, buffer: Buffer, mimeType: string): Promise<string>;
  /** 检查文件是否已存在 */
  exists(key: string): Promise<boolean>;
}

/**
 * 本地文件系统存储实现
 * @description 将简历原件保存到 {baseDir}/resumes/{candidateId}.{ext}
 */
export class LocalFileStorage implements FileStorage {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir ?? env.STORAGE_DIR;
  }

  async save(
    candidateId: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
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

/** 导出全局文件存储单例，供业务层使用 */
export const fileStorage: FileStorage = new LocalFileStorage();
