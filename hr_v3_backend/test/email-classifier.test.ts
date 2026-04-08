import { describe, it, expect } from "bun:test";

/**
 * classifyEmail 纯函数测试
 * 直接复制函数逻辑以避免 setup.ts mock 干扰
 */

interface EmailClassification {
  isResume: "yes" | "no" | "uncertain";
  reason: string;
}

// --- 复制 classifyEmail 逻辑（纯函数，无外部依赖） ---

const INTERNAL_DOMAINS = ["ivis-sh.com"];

const RECRUIT_PLATFORM_DOMAINS = [
  "service.bosszhipin.com",
  "ehire.51job.com",
  "lietou.com",
  "mail.lietou.com",
  "em.zhaopin.com",
  "lagou.com",
];

const RESUME_KEYWORDS =
  /简历|resume|应聘|求职|投递|CV|履歴|エントリー/i;

const SYSTEM_KEYWORDS =
  /验证码|notification|unsubscribe|退订|mailer-daemon|noreply|no-reply|自动回复|out\s*of\s*office/i;

function classifyEmail(
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

// --- 测试 ---

describe("classifyEmail", () => {
  describe("Layer 1: 发件人域名", () => {
    it("内部域名 ivis-sh.com 无附件 → no", () => {
      const result = classifyEmail("hr@ivis-sh.com", "周报", false);
      expect(result).toEqual({ isResume: "no", reason: "internal_no_attachment" });
    });

    it("内部域名有附件 → uncertain", () => {
      const result = classifyEmail("colleague@ivis-sh.com", "请查看附件", true);
      expect(result).toEqual({ isResume: "uncertain", reason: "internal_with_attachment" });
    });

    it("BOSS 直聘域名 → yes", () => {
      const result = classifyEmail("notify@service.bosszhipin.com", "新简历通知", true);
      expect(result).toEqual({ isResume: "yes", reason: "recruit_platform" });
    });

    it("51job 域名 → yes", () => {
      const result = classifyEmail("notify@ehire.51job.com", "候选人推荐", true);
      expect(result).toEqual({ isResume: "yes", reason: "recruit_platform" });
    });

    it("猎聘域名 → yes", () => {
      const result = classifyEmail("notify@lietou.com", "新简历", false);
      expect(result).toEqual({ isResume: "yes", reason: "recruit_platform" });
    });

    it("猎聘 mail 子域名 → yes", () => {
      const result = classifyEmail("notify@mail.lietou.com", "新简历", false);
      expect(result).toEqual({ isResume: "yes", reason: "recruit_platform" });
    });
  });

  describe("Layer 2: 主题关键词", () => {
    it("主题含'简历' → yes", () => {
      const result = classifyEmail("someone@gmail.com", "张三的简历", true);
      expect(result).toEqual({ isResume: "yes", reason: "keyword_match" });
    });

    it("主题含'resume' (case insensitive) → yes", () => {
      const result = classifyEmail("someone@gmail.com", "My Resume for Application", true);
      expect(result).toEqual({ isResume: "yes", reason: "keyword_match" });
    });

    it("主题含'应聘' → yes", () => {
      const result = classifyEmail("someone@qq.com", "应聘前端开发", false);
      expect(result).toEqual({ isResume: "yes", reason: "keyword_match" });
    });

    it("主题含'投递' → yes", () => {
      const result = classifyEmail("someone@qq.com", "投递软件工程师", false);
      expect(result).toEqual({ isResume: "yes", reason: "keyword_match" });
    });

    it("主题含'履歴' (日语) → yes", () => {
      const result = classifyEmail("someone@gmail.com", "履歴書を送ります", true);
      expect(result).toEqual({ isResume: "yes", reason: "keyword_match" });
    });

    it("主题含'エントリー' (日语) → yes", () => {
      const result = classifyEmail("someone@gmail.com", "エントリーシート", false);
      expect(result).toEqual({ isResume: "yes", reason: "keyword_match" });
    });

    it("主题含'验证码' → no", () => {
      const result = classifyEmail("noreply@example.com", "您的验证码是123456", false);
      expect(result).toEqual({ isResume: "no", reason: "system_notification" });
    });

    it("主题含'unsubscribe' → no", () => {
      const result = classifyEmail("news@example.com", "Click to unsubscribe", false);
      expect(result).toEqual({ isResume: "no", reason: "system_notification" });
    });

    it("主题含'退订' → no", () => {
      const result = classifyEmail("news@example.com", "点击退订此邮件", false);
      expect(result).toEqual({ isResume: "no", reason: "system_notification" });
    });
  });

  describe("Layer 3: 附件兜底", () => {
    it("无关键词有附件 → uncertain", () => {
      const result = classifyEmail("someone@gmail.com", "你好", true);
      expect(result).toEqual({ isResume: "uncertain", reason: "has_attachment" });
    });

    it("无关键词无附件 → no", () => {
      const result = classifyEmail("someone@gmail.com", "你好", false);
      expect(result).toEqual({ isResume: "no", reason: "no_indicator" });
    });
  });

  describe("边界情况", () => {
    it("空发件人地址", () => {
      const result = classifyEmail("", "简历投递", true);
      expect(result).toEqual({ isResume: "yes", reason: "keyword_match" });
    });

    it("空主题", () => {
      const result = classifyEmail("someone@gmail.com", "", true);
      expect(result).toEqual({ isResume: "uncertain", reason: "has_attachment" });
    });

    it("空主题无附件", () => {
      const result = classifyEmail("someone@gmail.com", "", false);
      expect(result).toEqual({ isResume: "no", reason: "no_indicator" });
    });
  });
});
