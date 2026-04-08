/**
 * @file 环境变量配置模块
 * @description 使用 Zod 校验库定义并验证应用所需的全部环境变量。
 *              包括数据库连接地址、AI 服务密钥、邮件收发（IMAP/SMTP）配置等。
 *              应用启动时会自动执行校验，若环境变量缺失或格式不正确则立即终止进程。
 */

import { z } from "zod/v4";

/**
 * 环境变量的 Zod（校验）模式定义
 * 每个字段对应一个环境变量，包含类型、默认值和校验规则
 */
const envSchema = z.object({
  /** PostgreSQL 数据库连接字符串，不可为空 */
  DATABASE_URL: z.string().min(1),
  /** DeepSeek AI 服务的 API 密钥，用于简历评分 */
  DEEPSEEK_API_KEY: z.string().min(1),

  // IMAP — 接收邮件相关配置
  /** IMAP 邮件服务器地址 */
  IMAP_HOST: z.string().default("mail.ivis-sh.com"),
  /** IMAP 端口号，143 表示使用 STARTTLS 连接 */
  IMAP_PORT: z.coerce.number().default(143),
  /** IMAP 登录用户名（即收件邮箱地址） */
  IMAP_USER: z.string().default("hr@ivis-sh.com"),
  /** IMAP 登录密码，不可为空 */
  IMAP_PASS: z.string().min(1),

  // SMTP — 发送邮件相关配置（可选）
  /** SMTP 邮件服务器地址 */
  SMTP_HOST: z.string().default("mail.ivis-sh.com"),
  /** SMTP 端口号，587 表示使用 STARTTLS 加密 */
  SMTP_PORT: z.coerce.number().default(587),
  /** SMTP 登录用户名（即发件邮箱地址） */
  SMTP_USER: z.string().default("hr@ivis-sh.com"),
  /** SMTP 登录密码，可选（未配置时不启用邮件发送功能） */
  SMTP_PASS: z.string().optional(),

  /** 本地文件存储根目录，用于保存简历原件 */
  STORAGE_DIR: z.string().default("./storage"),
});

/** 从 Zod 模式推断出的环境变量类型，供其他模块使用 */
export type Env = z.infer<typeof envSchema>;

/**
 * 加载并校验环境变量
 * @description 使用 safeParse 安全解析 process.env，校验失败时输出详细错误信息并终止进程
 * @returns {Env} 经过校验的环境变量对象
 */
function loadEnv(): Env {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // 校验失败：打印格式化的错误信息，方便开发者排查问题
    console.error("Invalid environment variables:");
    console.error(z.prettifyError(result.error));
    process.exit(1);
  }
  return result.data;
}

/** 导出校验后的环境变量单例，在应用启动时立即执行校验 */
export const env = loadEnv();
