/**
 * 岗位筛选规则引擎
 *
 * 功能：
 * - 支持 must/nice/reject 规则配置
 * - 支持关键词、正则、数值范围、枚举匹配
 * - 生成 0-100 分数和 A/B/C/D 等级
 * - 详细评分解释和风险点分析
 * - 规则版本管理
 */

// ==================== 类型定义 ====================

export interface SkillRule {
  skill: string;           // 技能名称
  weight: number;          // 权重（1-5）
  type?: 'keyword' | 'regex'; // 匹配类型
  pattern?: string;        // 正则表达式（可选）
}

export interface NumericRule {
  field: string;           // 字段名（如 work_years）
  operator: '>=' | '<=' | '>' | '<' | '=' | 'range';
  value: number | [number, number]; // 值或范围
  weight: number;          // 权重
  label: string;           // 显示标签
}

export interface EnumRule {
  field: string;           // 字段名（如 education）
  values: string[];        // 允许的值列表
  weight: number;          // 权重
  label: string;           // 显示标签
}

export interface RejectRule {
  keyword: string;         // 拒绝关键词
  penalty: number;         // 扣分（默认15）
  description?: string;    // 描述
}

export interface GradeThresholds {
  A: number;  // A级阈值（如 80）
  B: number;  // B级阈值（如 60）
  C: number;  // C级阈值（如 40）
  D: number;  // D级阈值（默认 0）
}

export interface ScoringRules {
  version: string;                    // 规则版本号（如 "1.0.0"）
  must_skills: SkillRule[];          // 必备技能
  nice_skills: SkillRule[];          // 加分技能
  numeric_rules: NumericRule[];      // 数值规则
  enum_rules: EnumRule[];            // 枚举规则
  reject_rules: RejectRule[];        // 拒绝规则
  grade_thresholds: GradeThresholds; // 分级阈值
  must_weight_multiplier: number;    // Must 权重倍数（默认10）
  nice_weight_multiplier: number;    // Nice 权重倍数（默认5）
  created_at?: string;               // 创建时间
  description?: string;              // 规则描述
}

export interface CandidateData {
  name: string;
  email: string;
  phone: string;
  education: string;              // 学历：本科/硕士/博士
  school: string;
  major: string;
  graduation_date?: string;
  work_years: number;             // 工作年限
  skills: string[];               // 技能列表
  projects: string[];             // 项目描述列表
  raw_text: string;               // 原始简历文本
  [key: string]: any;             // 其他字段
}

export interface MatchedItem {
  name: string;                   // 匹配项名称
  weight: number;                 // 权重
  score: number;                  // 得分
  matched_via?: string;           // 匹配方式
}

export interface MissingItem {
  name: string;                   // 缺失项名称
  weight: number;                 // 权重
  potential_score: number;        // 潜在得分
}

export interface RiskItem {
  type: 'reject_keyword' | 'missing_must' | 'low_experience' | 'low_education' | 'other';
  severity: 'high' | 'medium' | 'low';
  description: string;
  impact: string;
}

export interface ScoringResult {
  // 基本分数
  total_score: number;            // 总分 0-100
  grade: 'A' | 'B' | 'C' | 'D';  // 等级

  // 分项得分
  must_score: number;             // Must 技能得分
  nice_score: number;             // Nice 技能得分
  numeric_score: number;          // 数值规则得分
  enum_score: number;             // 枚举规则得分
  reject_penalty: number;         // 拒绝扣分

  // 详细匹配信息
  matched_must: MatchedItem[];    // 匹配的 Must
  matched_nice: MatchedItem[];    // 匹配的 Nice
  matched_numeric: MatchedItem[]; // 匹配的数值规则
  matched_enum: MatchedItem[];    // 匹配的枚举规则
  matched_reject: string[];       // 匹配的拒绝关键词

  // 缺失信息
  missing_must: MissingItem[];    // 缺失的 Must
  missing_nice: MissingItem[];    // 缺失的 Nice

  // 风险点
  risks: RiskItem[];              // 风险列表

  // 解释文本
  explanation: string;            // 详细解释
  summary: string;                // 简短总结

  // 元数据
  rule_version: string;           // 使用的规则版本
  scored_at: string;              // 评分时间
}

// ==================== 规则引擎核心 ====================

export class ScoringEngine {
  private rules: ScoringRules;

  constructor(rules: ScoringRules) {
    this.rules = rules;
    this.validateRules();
  }

  /**
   * 验证规则配置
   */
  private validateRules(): void {
    if (!this.rules.version) {
      throw new Error('Rule version is required');
    }

    if (!this.rules.grade_thresholds) {
      throw new Error('Grade thresholds are required');
    }

    const { A, B, C, D } = this.rules.grade_thresholds;
    if (A < B || B < C || C < D) {
      throw new Error('Invalid grade thresholds: A >= B >= C >= D');
    }
  }

  /**
   * 评分主函数
   */
  public score(candidate: CandidateData): ScoringResult {
    const startTime = new Date().toISOString();

    // 1. 技能匹配
    const mustResults = this.evaluateSkills(
      candidate,
      this.rules.must_skills,
      this.rules.must_weight_multiplier
    );

    const niceResults = this.evaluateSkills(
      candidate,
      this.rules.nice_skills,
      this.rules.nice_weight_multiplier
    );

    // 2. 数值规则评估
    const numericResults = this.evaluateNumericRules(candidate);

    // 3. 枚举规则评估
    const enumResults = this.evaluateEnumRules(candidate);

    // 4. 拒绝规则检查
    const rejectResults = this.evaluateRejectRules(candidate);

    // 5. 计算总分
    const totalScore = Math.max(
      0,
      Math.min(
        100,
        mustResults.score +
        niceResults.score +
        numericResults.score +
        enumResults.score -
        rejectResults.penalty
      )
    );

    // 6. 确定等级
    const grade = this.determineGrade(totalScore);

    // 7. 识别风险
    const risks = this.identifyRisks(
      candidate,
      mustResults,
      rejectResults,
      totalScore
    );

    // 8. 生成解释
    const explanation = this.generateExplanation(
      candidate,
      totalScore,
      grade,
      mustResults,
      niceResults,
      numericResults,
      enumResults,
      rejectResults,
      risks
    );

    const summary = this.generateSummary(totalScore, grade, risks.length);

    return {
      total_score: Math.round(totalScore * 10) / 10,
      grade,

      must_score: Math.round(mustResults.score * 10) / 10,
      nice_score: Math.round(niceResults.score * 10) / 10,
      numeric_score: Math.round(numericResults.score * 10) / 10,
      enum_score: Math.round(enumResults.score * 10) / 10,
      reject_penalty: Math.round(rejectResults.penalty * 10) / 10,

      matched_must: mustResults.matched,
      matched_nice: niceResults.matched,
      matched_numeric: numericResults.matched,
      matched_enum: enumResults.matched,
      matched_reject: rejectResults.matched,

      missing_must: mustResults.missing,
      missing_nice: niceResults.missing,

      risks,
      explanation,
      summary,

      rule_version: this.rules.version,
      scored_at: startTime,
    };
  }

  /**
   * 评估技能匹配
   */
  private evaluateSkills(
    candidate: CandidateData,
    skillRules: SkillRule[],
    multiplier: number
  ): {
    score: number;
    matched: MatchedItem[];
    missing: MissingItem[];
  } {
    const matched: MatchedItem[] = [];
    const missing: MissingItem[] = [];
    let score = 0;

    const candidateSkills = candidate.skills.map(s => s.toLowerCase());
    const rawTextLower = candidate.raw_text.toLowerCase();

    for (const rule of skillRules) {
      const isMatched = this.matchSkill(
        rule,
        candidateSkills,
        rawTextLower
      );

      if (isMatched.matched) {
        const itemScore = rule.weight * multiplier;
        score += itemScore;
        matched.push({
          name: rule.skill,
          weight: rule.weight,
          score: itemScore,
          matched_via: isMatched.via,
        });
      } else {
        const potentialScore = rule.weight * multiplier;
        missing.push({
          name: rule.skill,
          weight: rule.weight,
          potential_score: potentialScore,
        });
      }
    }

    return { score, matched, missing };
  }

  /**
   * 匹配单个技能
   */
  private matchSkill(
    rule: SkillRule,
    candidateSkills: string[],
    rawText: string
  ): { matched: boolean; via?: string } {
    const skillLower = rule.skill.toLowerCase();

    // 关键词匹配（默认）
    if (!rule.type || rule.type === 'keyword') {
      if (candidateSkills.includes(skillLower)) {
        return { matched: true, via: 'skills_list' };
      }
      if (rawText.includes(skillLower)) {
        return { matched: true, via: 'raw_text' };
      }
    }

    // 正则匹配
    if (rule.type === 'regex' && rule.pattern) {
      try {
        const regex = new RegExp(rule.pattern, 'i');
        if (regex.test(rawText)) {
          return { matched: true, via: 'regex' };
        }
      } catch (e) {
        console.error(`Invalid regex pattern: ${rule.pattern}`, e);
      }
    }

    return { matched: false };
  }

  /**
   * 评估数值规则
   */
  private evaluateNumericRules(candidate: CandidateData): {
    score: number;
    matched: MatchedItem[];
  } {
    const matched: MatchedItem[] = [];
    let score = 0;

    for (const rule of this.rules.numeric_rules) {
      const fieldValue = candidate[rule.field];

      if (fieldValue === undefined || fieldValue === null) {
        continue;
      }

      const numValue = typeof fieldValue === 'number'
        ? fieldValue
        : parseFloat(fieldValue);

      if (isNaN(numValue)) {
        continue;
      }

      const isMatched = this.matchNumericRule(rule, numValue);

      if (isMatched) {
        const itemScore = rule.weight * 5; // 数值规则倍数为5
        score += itemScore;
        matched.push({
          name: rule.label,
          weight: rule.weight,
          score: itemScore,
          matched_via: `${rule.field}=${numValue}`,
        });
      }
    }

    return { score, matched };
  }

  /**
   * 匹配数值规则
   */
  private matchNumericRule(rule: NumericRule, value: number): boolean {
    switch (rule.operator) {
      case '>=':
        return value >= (rule.value as number);
      case '<=':
        return value <= (rule.value as number);
      case '>':
        return value > (rule.value as number);
      case '<':
        return value < (rule.value as number);
      case '=':
        return value === (rule.value as number);
      case 'range':
        const [min, max] = rule.value as [number, number];
        return value >= min && value <= max;
      default:
        return false;
    }
  }

  /**
   * 评估枚举规则
   */
  private evaluateEnumRules(candidate: CandidateData): {
    score: number;
    matched: MatchedItem[];
  } {
    const matched: MatchedItem[] = [];
    let score = 0;

    for (const rule of this.rules.enum_rules) {
      const fieldValue = candidate[rule.field];

      if (!fieldValue) {
        continue;
      }

      const valueLower = String(fieldValue).toLowerCase();
      const isMatched = rule.values.some(v =>
        v.toLowerCase() === valueLower
      );

      if (isMatched) {
        const itemScore = rule.weight * 5; // 枚举规则倍数为5
        score += itemScore;
        matched.push({
          name: rule.label,
          weight: rule.weight,
          score: itemScore,
          matched_via: `${rule.field}=${fieldValue}`,
        });
      }
    }

    return { score, matched };
  }

  /**
   * 评估拒绝规则
   */
  private evaluateRejectRules(candidate: CandidateData): {
    penalty: number;
    matched: string[];
  } {
    const matched: string[] = [];
    let penalty = 0;

    const rawTextLower = candidate.raw_text.toLowerCase();

    for (const rule of this.rules.reject_rules) {
      const keywordLower = rule.keyword.toLowerCase();

      if (rawTextLower.includes(keywordLower)) {
        matched.push(rule.keyword);
        penalty += rule.penalty;
      }
    }

    return { penalty, matched };
  }

  /**
   * 确定等级
   */
  private determineGrade(score: number): 'A' | 'B' | 'C' | 'D' {
    const { A, B, C } = this.rules.grade_thresholds;

    if (score >= A) return 'A';
    if (score >= B) return 'B';
    if (score >= C) return 'C';
    return 'D';
  }

  /**
   * 识别风险点
   */
  private identifyRisks(
    candidate: CandidateData,
    mustResults: any,
    rejectResults: any,
    totalScore: number
  ): RiskItem[] {
    const risks: RiskItem[] = [];

    // 1. 拒绝关键词风险
    if (rejectResults.matched.length > 0) {
      risks.push({
        type: 'reject_keyword',
        severity: 'high',
        description: `包含拒绝关键词: ${rejectResults.matched.join(', ')}`,
        impact: `扣除 ${rejectResults.penalty} 分`,
      });
    }

    // 2. 关键技能缺失
    const criticalMissing = mustResults.missing.filter(
      (m: MissingItem) => m.weight >= 3
    );
    if (criticalMissing.length > 0) {
      risks.push({
        type: 'missing_must',
        severity: 'high',
        description: `缺少关键技能: ${criticalMissing.map((m: MissingItem) => m.name).join(', ')}`,
        impact: `影响核心能力评估`,
      });
    }

    // 3. 工作经验不足
    if (candidate.work_years < 2) {
      risks.push({
        type: 'low_experience',
        severity: candidate.work_years === 0 ? 'high' : 'medium',
        description: `工作经验较少: ${candidate.work_years} 年`,
        impact: '可能缺乏实际项目经验',
      });
    }

    // 4. 学历较低（如果配置了学历规则）
    const educationRule = this.rules.enum_rules.find(
      r => r.field === 'education'
    );
    if (educationRule) {
      const candidateEdu = candidate.education.toLowerCase();
      const hasMatch = educationRule.values.some(
        v => v.toLowerCase() === candidateEdu
      );

      if (!hasMatch && candidate.education) {
        risks.push({
          type: 'low_education',
          severity: 'medium',
          description: `学历未达标: ${candidate.education}`,
          impact: `期望: ${educationRule.values.join('/')}`,
        });
      }
    }

    // 5. 总分过低
    if (totalScore < this.rules.grade_thresholds.C) {
      risks.push({
        type: 'other',
        severity: 'high',
        description: '总体匹配度较低',
        impact: `总分 ${totalScore.toFixed(1)} < 及格线 ${this.rules.grade_thresholds.C}`,
      });
    }

    return risks;
  }

  /**
   * 生成详细解释
   */
  private generateExplanation(
    candidate: CandidateData,
    totalScore: number,
    grade: string,
    mustResults: any,
    niceResults: any,
    numericResults: any,
    enumResults: any,
    rejectResults: any,
    risks: RiskItem[]
  ): string {
    const lines: string[] = [];

    lines.push('=== 评分详情 ===\n');

    // 总分和等级
    lines.push(`总分: ${totalScore.toFixed(1)} / 100`);
    lines.push(`等级: ${grade}\n`);

    // Must 技能
    lines.push(`【必备技能】得分: ${mustResults.score.toFixed(1)}`);
    if (mustResults.matched.length > 0) {
      lines.push(`✓ 匹配 (${mustResults.matched.length}/${this.rules.must_skills.length}):`);
      mustResults.matched.forEach((m: MatchedItem) => {
        lines.push(`  - ${m.name} (权重${m.weight}, +${m.score.toFixed(1)}分)`);
      });
    }
    if (mustResults.missing.length > 0) {
      lines.push(`✗ 缺失 (${mustResults.missing.length}):`);
      mustResults.missing.forEach((m: MissingItem) => {
        lines.push(`  - ${m.name} (权重${m.weight}, 损失${m.potential_score.toFixed(1)}分)`);
      });
    }
    lines.push('');

    // Nice 技能
    if (this.rules.nice_skills.length > 0) {
      lines.push(`【加分技能】得分: ${niceResults.score.toFixed(1)}`);
      if (niceResults.matched.length > 0) {
        lines.push(`✓ 匹配 (${niceResults.matched.length}/${this.rules.nice_skills.length}):`);
        niceResults.matched.forEach((m: MatchedItem) => {
          lines.push(`  - ${m.name} (权重${m.weight}, +${m.score.toFixed(1)}分)`);
        });
      } else {
        lines.push('  未匹配到加分技能');
      }
      lines.push('');
    }

    // 数值规则
    if (this.rules.numeric_rules.length > 0 && numericResults.matched.length > 0) {
      lines.push(`【数值规则】得分: ${numericResults.score.toFixed(1)}`);
      numericResults.matched.forEach((m: MatchedItem) => {
        lines.push(`  ✓ ${m.name}: ${m.matched_via} (+${m.score.toFixed(1)}分)`);
      });
      lines.push('');
    }

    // 枚举规则
    if (this.rules.enum_rules.length > 0 && enumResults.matched.length > 0) {
      lines.push(`【资质要求】得分: ${enumResults.score.toFixed(1)}`);
      enumResults.matched.forEach((m: MatchedItem) => {
        lines.push(`  ✓ ${m.name}: ${m.matched_via} (+${m.score.toFixed(1)}分)`);
      });
      lines.push('');
    }

    // 拒绝关键词
    if (rejectResults.matched.length > 0) {
      lines.push(`【拒绝关键词】扣分: -${rejectResults.penalty.toFixed(1)}`);
      rejectResults.matched.forEach((keyword: string) => {
        const rule = this.rules.reject_rules.find(r => r.keyword === keyword);
        lines.push(`  ✗ "${keyword}" (-${rule?.penalty || 15}分)`);
      });
      lines.push('');
    }

    // 风险点
    if (risks.length > 0) {
      lines.push('【风险提示】');
      risks.forEach((risk, idx) => {
        const icon = risk.severity === 'high' ? '⚠️' : 'ℹ️';
        lines.push(`  ${icon} ${risk.description}`);
        lines.push(`     → ${risk.impact}`);
      });
      lines.push('');
    }

    // 总结建议
    lines.push('【评估总结】');
    if (grade === 'A') {
      lines.push('✓ 优秀候选人，强烈推荐面试');
    } else if (grade === 'B') {
      lines.push('✓ 合格候选人，建议面试');
    } else if (grade === 'C') {
      lines.push('⚠ 基本合格，可考虑备选');
    } else {
      lines.push('✗ 不符合岗位要求，不推荐');
    }

    return lines.join('\n');
  }

  /**
   * 生成简短总结
   */
  private generateSummary(
    score: number,
    grade: string,
    riskCount: number
  ): string {
    const gradeText = {
      A: '优秀',
      B: '良好',
      C: '一般',
      D: '不合格',
    }[grade];

    const riskText = riskCount > 0 ? `，${riskCount}个风险点` : '';

    return `评分${score.toFixed(1)}分(${gradeText})${riskText}`;
  }

  /**
   * 获取规则版本
   */
  public getVersion(): string {
    return this.rules.version;
  }

  /**
   * 导出规则配置
   */
  public exportRules(): ScoringRules {
    return JSON.parse(JSON.stringify(this.rules));
  }
}

// ==================== 工具函数 ====================

/**
 * 创建默认规则模板
 */
export function createDefaultRules(positionTitle: string): ScoringRules {
  return {
    version: '1.0.0',
    description: `${positionTitle} 岗位评分规则`,

    must_skills: [
      { skill: 'JavaScript', weight: 2 },
      { skill: 'React', weight: 3 },
    ],

    nice_skills: [
      { skill: 'TypeScript', weight: 2 },
      { skill: 'Node.js', weight: 1 },
    ],

    numeric_rules: [
      {
        field: 'work_years',
        operator: '>=',
        value: 2,
        weight: 2,
        label: '工作经验≥2年',
      },
    ],

    enum_rules: [
      {
        field: 'education',
        values: ['本科', '硕士', '博士'],
        weight: 1,
        label: '本科及以上学历',
      },
    ],

    reject_rules: [
      { keyword: '在校生', penalty: 20, description: '在校学生' },
      { keyword: '实习', penalty: 15, description: '实习经历' },
    ],

    grade_thresholds: {
      A: 80,
      B: 60,
      C: 40,
      D: 0,
    },

    must_weight_multiplier: 10,
    nice_weight_multiplier: 5,

    created_at: new Date().toISOString(),
  };
}

/**
 * 验证候选人数据完整性
 */
export function validateCandidateData(data: Partial<CandidateData>): string[] {
  const errors: string[] = [];

  if (!data.name) errors.push('Missing name');
  if (!data.skills || data.skills.length === 0) errors.push('Missing skills');
  if (data.work_years === undefined) errors.push('Missing work_years');
  if (!data.raw_text) errors.push('Missing raw_text');

  return errors;
}

/**
 * 比较两个评分结果
 */
export function compareResults(
  result1: ScoringResult,
  result2: ScoringResult
): {
  score_diff: number;
  grade_changed: boolean;
  version_diff: boolean;
} {
  return {
    score_diff: result2.total_score - result1.total_score,
    grade_changed: result1.grade !== result2.grade,
    version_diff: result1.rule_version !== result2.rule_version,
  };
}
