/**
 * 规则引擎单元测试
 */

import {
  ScoringEngine,
  ScoringRules,
  CandidateData,
  createDefaultRules,
  validateCandidateData,
  compareResults,
} from './scoring-engine';

// ==================== 测试数据 ====================

const mockRules: ScoringRules = {
  version: '1.0.0',
  description: 'Frontend Developer 测试规则',

  must_skills: [
    { skill: 'React', weight: 3 },
    { skill: 'TypeScript', weight: 2 },
    { skill: 'JavaScript', weight: 2 },
  ],

  nice_skills: [
    { skill: 'Node.js', weight: 2 },
    { skill: 'Docker', weight: 1 },
    { skill: 'AWS', weight: 1 },
  ],

  numeric_rules: [
    {
      field: 'work_years',
      operator: '>=',
      value: 3,
      weight: 2,
      label: '3年以上工作经验',
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
    { keyword: '在校生', penalty: 20 },
    { keyword: '实习', penalty: 15 },
  ],

  grade_thresholds: {
    A: 80,
    B: 60,
    C: 40,
    D: 0,
  },

  must_weight_multiplier: 10,
  nice_weight_multiplier: 5,
};

const excellentCandidate: CandidateData = {
  name: '张三',
  email: 'zhangsan@example.com',
  phone: '13800138000',
  education: '硕士',
  school: '清华大学',
  major: '计算机科学',
  graduation_date: '2018-06-01',
  work_years: 5,
  skills: ['React', 'TypeScript', 'JavaScript', 'Node.js', 'Docker', 'AWS'],
  projects: [
    '电商平台前端架构设计',
    '微服务后端开发',
  ],
  raw_text: `
    姓名：张三
    邮箱：zhangsan@example.com
    学历：硕士
    工作经验：5年
    技能：React、TypeScript、JavaScript、Node.js、Docker、AWS
    项目经验：电商平台前端架构设计，微服务后端开发
  `,
};

const averageCandidate: CandidateData = {
  name: '李四',
  email: 'lisi@example.com',
  phone: '13900139000',
  education: '本科',
  school: '北京大学',
  major: '软件工程',
  work_years: 2,
  skills: ['React', 'JavaScript'],
  projects: ['企业管理系统'],
  raw_text: `
    姓名：李四
    学历：本科
    工作经验：2年
    技能：React、JavaScript
  `,
};

const rejectedCandidate: CandidateData = {
  name: '王五',
  email: 'wangwu@example.com',
  phone: '13700137000',
  education: '本科',
  school: '某大学',
  major: '计算机',
  work_years: 0,
  skills: ['HTML', 'CSS'],
  projects: [],
  raw_text: `
    姓名：王五
    在校生，寻找实习机会
    技能：HTML、CSS基础
  `,
};

// ==================== 测试套件 ====================

describe('ScoringEngine', () => {
  let engine: ScoringEngine;

  beforeEach(() => {
    engine = new ScoringEngine(mockRules);
  });

  describe('规则验证', () => {
    test('应该接受有效规则', () => {
      expect(() => new ScoringEngine(mockRules)).not.toThrow();
    });

    test('应该拒绝缺少版本的规则', () => {
      const invalidRules = { ...mockRules, version: '' };
      expect(() => new ScoringEngine(invalidRules)).toThrow('Rule version is required');
    });

    test('应该拒绝无效的阈值', () => {
      const invalidRules = {
        ...mockRules,
        grade_thresholds: { A: 50, B: 60, C: 70, D: 0 }, // A < B
      };
      expect(() => new ScoringEngine(invalidRules)).toThrow('Invalid grade thresholds');
    });
  });

  describe('优秀候选人评分', () => {
    test('应该获得高分和A级', () => {
      const result = engine.score(excellentCandidate);

      expect(result.total_score).toBeGreaterThanOrEqual(80);
      expect(result.grade).toBe('A');
      expect(result.rule_version).toBe('1.0.0');
    });

    test('应该匹配所有 Must 技能', () => {
      const result = engine.score(excellentCandidate);

      expect(result.matched_must).toHaveLength(3);
      expect(result.missing_must).toHaveLength(0);

      const mustSkills = result.matched_must.map(m => m.name);
      expect(mustSkills).toContain('React');
      expect(mustSkills).toContain('TypeScript');
      expect(mustSkills).toContain('JavaScript');
    });

    test('应该匹配所有 Nice 技能', () => {
      const result = engine.score(excellentCandidate);

      expect(result.matched_nice).toHaveLength(3);

      const niceSkills = result.matched_nice.map(m => m.name);
      expect(niceSkills).toContain('Node.js');
      expect(niceSkills).toContain('Docker');
      expect(niceSkills).toContain('AWS');
    });

    test('应该正确计算 Must 分数', () => {
      const result = engine.score(excellentCandidate);

      // React(3×10) + TypeScript(2×10) + JavaScript(2×10) = 70
      expect(result.must_score).toBe(70);
    });

    test('应该正确计算 Nice 分数', () => {
      const result = engine.score(excellentCandidate);

      // Node.js(2×5) + Docker(1×5) + AWS(1×5) = 20
      expect(result.nice_score).toBe(20);
    });

    test('应该匹配数值规则', () => {
      const result = engine.score(excellentCandidate);

      expect(result.matched_numeric).toHaveLength(1);
      expect(result.matched_numeric[0].name).toBe('3年以上工作经验');
      expect(result.numeric_score).toBe(10); // weight=2, multiplier=5
    });

    test('应该匹配枚举规则', () => {
      const result = engine.score(excellentCandidate);

      expect(result.matched_enum).toHaveLength(1);
      expect(result.matched_enum[0].name).toBe('本科及以上学历');
      expect(result.enum_score).toBe(5); // weight=1, multiplier=5
    });

    test('不应该有拒绝关键词', () => {
      const result = engine.score(excellentCandidate);

      expect(result.matched_reject).toHaveLength(0);
      expect(result.reject_penalty).toBe(0);
    });

    test('应该识别最少的风险', () => {
      const result = engine.score(excellentCandidate);

      expect(result.risks.length).toBeLessThanOrEqual(1);
    });
  });

  describe('中等候选人评分', () => {
    test('应该获得中等分数和B或C级', () => {
      const result = engine.score(averageCandidate);

      expect(result.total_score).toBeGreaterThanOrEqual(40);
      expect(result.total_score).toBeLessThan(80);
      expect(['B', 'C']).toContain(result.grade);
    });

    test('应该部分匹配 Must 技能', () => {
      const result = engine.score(averageCandidate);

      expect(result.matched_must.length).toBeGreaterThan(0);
      expect(result.matched_must.length).toBeLessThan(3);

      const mustSkills = result.matched_must.map(m => m.name);
      expect(mustSkills).toContain('React');
      expect(mustSkills).toContain('JavaScript');
    });

    test('应该有缺失的 Must 技能', () => {
      const result = engine.score(averageCandidate);

      expect(result.missing_must.length).toBeGreaterThan(0);

      const missingSkills = result.missing_must.map(m => m.name);
      expect(missingSkills).toContain('TypeScript');
    });

    test('应该没有匹配 Nice 技能', () => {
      const result = engine.score(averageCandidate);

      expect(result.matched_nice).toHaveLength(0);
      expect(result.nice_score).toBe(0);
    });

    test('应该识别一些风险', () => {
      const result = engine.score(averageCandidate);

      expect(result.risks.length).toBeGreaterThan(0);

      const riskTypes = result.risks.map(r => r.type);
      expect(riskTypes).toContain('missing_must');
    });
  });

  describe('被拒绝候选人评分', () => {
    test('应该获得低分和D级', () => {
      const result = engine.score(rejectedCandidate);

      expect(result.total_score).toBeLessThan(40);
      expect(result.grade).toBe('D');
    });

    test('应该匹配拒绝关键词', () => {
      const result = engine.score(rejectedCandidate);

      expect(result.matched_reject.length).toBeGreaterThan(0);
      expect(result.matched_reject).toContain('在校生');
      expect(result.matched_reject).toContain('实习');
    });

    test('应该有拒绝扣分', () => {
      const result = engine.score(rejectedCandidate);

      // "在校生"(-20) + "实习"(-15) = -35
      expect(result.reject_penalty).toBe(35);
    });

    test('应该识别高风险', () => {
      const result = engine.score(rejectedCandidate);

      expect(result.risks.length).toBeGreaterThan(2);

      const highRisks = result.risks.filter(r => r.severity === 'high');
      expect(highRisks.length).toBeGreaterThan(0);

      const riskTypes = result.risks.map(r => r.type);
      expect(riskTypes).toContain('reject_keyword');
    });

    test('总分不应低于0', () => {
      const result = engine.score(rejectedCandidate);

      expect(result.total_score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('解释文本生成', () => {
    test('应该生成详细解释', () => {
      const result = engine.score(excellentCandidate);

      expect(result.explanation).toContain('评分详情');
      expect(result.explanation).toContain('必备技能');
      expect(result.explanation).toContain('加分技能');
      expect(result.explanation).toContain('总分');
    });

    test('应该生成简短总结', () => {
      const result = engine.score(excellentCandidate);

      expect(result.summary).toBeTruthy();
      expect(result.summary).toContain('分');
      expect(result.summary.length).toBeLessThan(100);
    });

    test('应该在解释中包含缺失技能', () => {
      const result = engine.score(averageCandidate);

      expect(result.explanation).toContain('缺失');
      expect(result.explanation).toContain('TypeScript');
    });

    test('应该在解释中包含拒绝关键词', () => {
      const result = engine.score(rejectedCandidate);

      expect(result.explanation).toContain('拒绝关键词');
      expect(result.explanation).toContain('在校生');
    });
  });

  describe('特殊场景测试', () => {
    test('应该处理空技能列表', () => {
      const candidate = {
        ...excellentCandidate,
        skills: [],
      };

      const result = engine.score(candidate);

      expect(result.matched_must).toHaveLength(0);
      expect(result.missing_must).toHaveLength(3);
    });

    test('应该处理缺失的数值字段', () => {
      const candidate = {
        ...excellentCandidate,
        work_years: undefined as any,
      };

      const result = engine.score(candidate);

      expect(result.matched_numeric).toHaveLength(0);
    });

    test('应该处理缺失的枚举字段', () => {
      const candidate = {
        ...excellentCandidate,
        education: '',
      };

      const result = engine.score(candidate);

      expect(result.matched_enum).toHaveLength(0);
    });

    test('总分不应超过100', () => {
      const superCandidate = {
        ...excellentCandidate,
        skills: [
          'React', 'TypeScript', 'JavaScript',
          'Node.js', 'Docker', 'AWS',
          'Python', 'Java', 'Go', 'Rust', // 额外技能
        ],
        work_years: 10,
      };

      const result = engine.score(superCandidate);

      expect(result.total_score).toBeLessThanOrEqual(100);
    });
  });

  describe('正则匹配测试', () => {
    test('应该支持正则表达式匹配', () => {
      const rulesWithRegex: ScoringRules = {
        ...mockRules,
        must_skills: [
          {
            skill: 'React',
            weight: 3,
            type: 'regex',
            pattern: 'react|reactjs|react\\.js',
          },
        ],
      };

      const engine = new ScoringEngine(rulesWithRegex);
      const candidate = {
        ...excellentCandidate,
        skills: [],
        raw_text: '精通 ReactJS 框架开发',
      };

      const result = engine.score(candidate);

      expect(result.matched_must).toHaveLength(1);
      expect(result.matched_must[0].matched_via).toBe('regex');
    });
  });

  describe('数值规则操作符测试', () => {
    test('应该支持 >= 操作符', () => {
      const result = engine.score({ ...excellentCandidate, work_years: 3 });
      expect(result.matched_numeric).toHaveLength(1);
    });

    test('应该支持 > 操作符', () => {
      const rulesWithGreater: ScoringRules = {
        ...mockRules,
        numeric_rules: [
          {
            field: 'work_years',
            operator: '>',
            value: 3,
            weight: 2,
            label: '超过3年经验',
          },
        ],
      };

      const engine = new ScoringEngine(rulesWithGreater);
      const result = engine.score({ ...excellentCandidate, work_years: 4 });

      expect(result.matched_numeric).toHaveLength(1);
    });

    test('应该支持 range 操作符', () => {
      const rulesWithRange: ScoringRules = {
        ...mockRules,
        numeric_rules: [
          {
            field: 'work_years',
            operator: 'range',
            value: [3, 7],
            weight: 2,
            label: '3-7年经验',
          },
        ],
      };

      const engine = new ScoringEngine(rulesWithRange);
      const result = engine.score({ ...excellentCandidate, work_years: 5 });

      expect(result.matched_numeric).toHaveLength(1);
    });

    test('不应该匹配超出范围的值', () => {
      const rulesWithRange: ScoringRules = {
        ...mockRules,
        numeric_rules: [
          {
            field: 'work_years',
            operator: 'range',
            value: [3, 7],
            weight: 2,
            label: '3-7年经验',
          },
        ],
      };

      const engine = new ScoringEngine(rulesWithRange);
      const result = engine.score({ ...excellentCandidate, work_years: 10 });

      expect(result.matched_numeric).toHaveLength(0);
    });
  });
});

describe('工具函数测试', () => {
  describe('createDefaultRules', () => {
    test('应该创建有效的默认规则', () => {
      const rules = createDefaultRules('Frontend Developer');

      expect(rules.version).toBe('1.0.0');
      expect(rules.description).toContain('Frontend Developer');
      expect(rules.must_skills.length).toBeGreaterThan(0);
      expect(rules.grade_thresholds).toBeDefined();
    });
  });

  describe('validateCandidateData', () => {
    test('应该验证完整数据', () => {
      const errors = validateCandidateData(excellentCandidate);
      expect(errors).toHaveLength(0);
    });

    test('应该检测缺失字段', () => {
      const incompleteData = {
        email: 'test@example.com',
      };

      const errors = validateCandidateData(incompleteData);

      expect(errors.length).toBeGreaterThan(0);
      expect(errors).toContain('Missing name');
      expect(errors).toContain('Missing skills');
    });
  });

  describe('compareResults', () => {
    test('应该比较两个评分结果', () => {
      const engine = new ScoringEngine(mockRules);
      const result1 = engine.score(excellentCandidate);
      const result2 = engine.score(averageCandidate);

      const comparison = compareResults(result1, result2);

      expect(comparison.score_diff).toBeLessThan(0); // result2 分数更低
      expect(comparison.grade_changed).toBe(true);
    });
  });
});

describe('版本管理测试', () => {
  test('应该记录规则版本', () => {
    const result = engine.score(excellentCandidate);

    expect(result.rule_version).toBe('1.0.0');
  });

  test('应该记录评分时间', () => {
    const result = engine.score(excellentCandidate);

    expect(result.scored_at).toBeTruthy();
    expect(new Date(result.scored_at)).toBeInstanceOf(Date);
  });

  test('应该支持版本比较', () => {
    const rulesV1 = { ...mockRules, version: '1.0.0' };
    const rulesV2 = { ...mockRules, version: '2.0.0' };

    const engineV1 = new ScoringEngine(rulesV1);
    const engineV2 = new ScoringEngine(rulesV2);

    const resultV1 = engineV1.score(excellentCandidate);
    const resultV2 = engineV2.score(excellentCandidate);

    const comparison = compareResults(resultV1, resultV2);

    expect(comparison.version_diff).toBe(true);
  });

  test('应该导出规则配置', () => {
    const exported = engine.exportRules();

    expect(exported.version).toBe(mockRules.version);
    expect(exported.must_skills).toEqual(mockRules.must_skills);
  });
});

describe('边界条件测试', () => {
  test('应该处理极低分数', () => {
    const veryPoorCandidate = {
      ...rejectedCandidate,
      raw_text: '在校生实习在校生实习', // 多个拒绝关键词
    };

    const result = engine.score(veryPoorCandidate);

    expect(result.total_score).toBeGreaterThanOrEqual(0);
  });

  test('应该处理空规则', () => {
    const emptyRules: ScoringRules = {
      version: '1.0.0',
      must_skills: [],
      nice_skills: [],
      numeric_rules: [],
      enum_rules: [],
      reject_rules: [],
      grade_thresholds: { A: 80, B: 60, C: 40, D: 0 },
      must_weight_multiplier: 10,
      nice_weight_multiplier: 5,
    };

    const engine = new ScoringEngine(emptyRules);
    const result = engine.score(excellentCandidate);

    expect(result.total_score).toBe(0);
    expect(result.grade).toBe('D');
  });

  test('应该处理大小写不敏感匹配', () => {
    const candidate = {
      ...excellentCandidate,
      skills: ['react', 'TYPESCRIPT', 'JavaScript'],
    };

    const result = engine.score(candidate);

    expect(result.matched_must.length).toBe(3);
  });
});

// ==================== 性能测试 ====================

describe('性能测试', () => {
  test('应该在合理时间内完成评分', () => {
    const startTime = Date.now();
    engine.score(excellentCandidate);
    const endTime = Date.now();

    const duration = endTime - startTime;
    expect(duration).toBeLessThan(100); // 应该在100ms内完成
  });

  test('应该支持批量评分', () => {
    const candidates = [
      excellentCandidate,
      averageCandidate,
      rejectedCandidate,
    ];

    const startTime = Date.now();
    const results = candidates.map(c => engine.score(c));
    const endTime = Date.now();

    expect(results).toHaveLength(3);
    expect(endTime - startTime).toBeLessThan(300);
  });
});

// ==================== 集成测试 ====================

describe('完整流程集成测试', () => {
  test('端到端评分流程', () => {
    // 1. 创建规则
    const rules = createDefaultRules('Full Stack Developer');

    // 2. 自定义规则
    rules.must_skills = [
      { skill: 'React', weight: 3 },
      { skill: 'Node.js', weight: 3 },
    ];
    rules.nice_skills = [
      { skill: 'Docker', weight: 2 },
    ];

    // 3. 创建引擎
    const engine = new ScoringEngine(rules);

    // 4. 评分
    const result = engine.score(excellentCandidate);

    // 5. 验证结果
    expect(result).toBeDefined();
    expect(result.total_score).toBeGreaterThan(0);
    expect(result.grade).toMatch(/^[ABCD]$/);
    expect(result.explanation).toBeTruthy();
    expect(result.summary).toBeTruthy();

    // 6. 验证元数据
    expect(result.rule_version).toBe(rules.version);
    expect(result.scored_at).toBeTruthy();

    console.log('\n=== 集成测试结果 ===');
    console.log(`候选人: ${excellentCandidate.name}`);
    console.log(`总分: ${result.total_score}`);
    console.log(`等级: ${result.grade}`);
    console.log(`总结: ${result.summary}`);
    console.log('\n详细解释:');
    console.log(result.explanation);
  });
});
