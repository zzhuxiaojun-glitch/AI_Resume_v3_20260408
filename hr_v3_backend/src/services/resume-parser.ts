/**
 * @file 简历文件解析服务
 * @description 负责将上传的简历文件（PDF、DOC、DOCX 格式）解析为纯文本内容。
 *              支持两种文件格式：
 *              - PDF：使用 pdf-parse 库提取文本
 *              - DOC/DOCX：使用 mammoth 库提取文本
 *              解析后的文本将用于 AI 评分服务进行候选人评估。
 */

import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import type { ParsedResume } from "../lib/types";

/**
 * 解析简历文件，提取纯文本内容
 * @description 根据文件扩展名自动选择对应的解析器，将二进制文件内容转换为纯文本。
 *              目前支持 PDF 和 DOC/DOCX 两种格式，遇到其他格式会抛出异常。
 * @param buffer - 简历文件的二进制数据（Buffer）
 * @param fileName - 原始文件名，用于判断文件格式和作为返回值的一部分
 * @returns {Promise<ParsedResume>} 包含文本内容、文件名和 MIME 类型的解析结果
 * @throws {Error} 当文件格式不受支持时抛出错误
 */
export async function parseResume(
  buffer: Buffer,
  fileName: string,
): Promise<ParsedResume> {
  // 从文件名中提取扩展名（转为小写以兼容不同大小写）
  const ext = fileName.toLowerCase().split(".").pop();
  let text: string;

  switch (ext) {
    case "pdf": {
      // 使用 pdf-parse 解析 PDF 文件，提取全部文本内容
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      text = result.text;
      // 解析完成后销毁解析器，释放内存资源
      await parser.destroy();
      break;
    }
    case "docx":
    case "doc": {
      // 使用 mammoth 解析 Word 文档，提取原始文本（不保留格式）
      const result = await mammoth.extractRawText({ buffer });
      text = result.value;
      break;
    }
    default:
      // 不支持的文件格式，抛出明确的错误信息
      throw new Error(`Unsupported file format: .${ext}`);
  }

  // 根据文件扩展名确定对应的 MIME 类型
  const mimeType =
    ext === "pdf"
      ? "application/pdf"
      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  // 返回解析结果：清除 PostgreSQL text 不支持的 null bytes + 其他控制字符，去除首尾空白
  return { text: text.replace(/[\0\x00]/g, "").replace(/\uFFFD/g, "").trim(), fileName, mimeType };
}
