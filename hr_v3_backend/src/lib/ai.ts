/**
 * @file AI 模型客户端配置
 * @description 配置并导出 DeepSeek AI 大语言模型客户端。
 *              使用 Vercel AI SDK 的 OpenAI 兼容适配器连接 DeepSeek API，
 *              为简历评分等 AI 功能提供底层模型调用能力。
 */

import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV3 } from "@ai-sdk/provider";
import { env } from "../env";

/**
 * DeepSeek AI 服务的 OpenAI 兼容客户端
 * 通过 @ai-sdk/openai 适配器连接 DeepSeek API（接口兼容 OpenAI 协议）
 */
export const deepseek = createOpenAI({
  apiKey: env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com/v1",
});

/**
 * 默认使用的语言模型实例
 * 采用 deepseek-chat (DeepSeek-V3) 模型，用于简历内容分析和候选人评分
 */
export const model: LanguageModelV3 = deepseek.chat("deepseek-chat");
