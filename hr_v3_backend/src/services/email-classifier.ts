/**
 * @file 邮件分类器
 * @description 零 LLM 成本的邮件预过滤，通过发件人域名、主题关键词和附件
 *              三层规则判断邮件是否可能包含简历，减少不必要的 AI 处理开销。
 */

export interface EmailClassification {
  isResume: "yes" | "no" | "uncertain";
  reason: string;
}

/** 内部域名黑名单 — 公司内部邮件通常不含简历 */
const INTERNAL_DOMAINS = ["ivis-sh.com"];

/** 招聘平台域名白名单 — 来自这些平台的邮件几乎一定含简历 */
const RECRUIT_PLATFORM_DOMAINS = [
  "service.bosszhipin.com",
  "ehire.51job.com",
  "lietou.com",
  "mail.lietou.com",
  "em.zhaopin.com",
  "lagou.com",
];

/** 简历相关关键词（中日英） */
const RESUME_KEYWORDS =
  /简历|resume|应聘|求职|投递|CV|履歴|エントリー/i;

/** 系统通知关键词 — 匹配到这些则不是简历邮件 */
const SYSTEM_KEYWORDS =
  /验证码|notification|unsubscribe|退订|mailer-daemon|noreply|no-reply|自动回复|out\s*of\s*office/i;

/**
 * 三层规则分类邮件是否包含简历
 *
 * Layer 1: 发件人域名（内部黑名单 / 招聘平台白名单）
 * Layer 2: 主题关键词（简历关键词 / 系统通知关键词）
 * Layer 3: 附件兜底（有附件 → uncertain，无附件 → no）
 */
export function classifyEmail(
  senderAddress: string,
  subject: string,
  hasResumeAttachment: boolean,
): EmailClassification {
  const domain = senderAddress.split("@")[1]?.toLowerCase() ?? "";

  // Layer 1: 发件人域名
  if (INTERNAL_DOMAINS.includes(domain)) {
    if (hasResumeAttachment) {
      return { isResume: "uncertain", reason: "internal_with_attachment" };
    }
    return { isResume: "no", reason: "internal_no_attachment" };
  }

  if (RECRUIT_PLATFORM_DOMAINS.includes(domain)) {
    return { isResume: "yes", reason: "recruit_platform" };
  }

  // Layer 2: 主题关键词
  if (RESUME_KEYWORDS.test(subject)) {
    return { isResume: "yes", reason: "keyword_match" };
  }

  if (SYSTEM_KEYWORDS.test(subject)) {
    return { isResume: "no", reason: "system_notification" };
  }

  // Layer 3: 附件兜底
  if (hasResumeAttachment) {
    return { isResume: "uncertain", reason: "has_attachment" };
  }

  return { isResume: "no", reason: "no_indicator" };
}
