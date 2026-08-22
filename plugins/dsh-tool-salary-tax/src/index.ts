// 2026 reference: generic city rates, cumulative IIT brackets (annual).
const BRACKETS: [number, number, number][] = [
  // annualTaxableUpper, rate, quickDeduct
  [36000, 0.03, 0],
  [144000, 0.1, 2520],
  [300000, 0.2, 16920],
  [420000, 0.25, 31920],
  [660000, 0.3, 52920],
  [960000, 0.35, 85920],
  [Infinity, 0.45, 181920],
];

export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'calc',
      description:
        'Input JSON: {monthlySalary, socialBase?, housingPct?(default 12)} -> take-home + IIT estimate.',
      handler: async (inputData: string) => {
        let monthly = NaN;
        let base = NaN;
        let housingPct = 12;
        try {
          const j = JSON.parse(inputData.trim());
          monthly = Number(j.monthlySalary);
          base = Number(j.socialBase ?? j.monthlySalary);
          if (Number.isFinite(Number(j.housingPct))) housingPct = Number(j.housingPct);
        } catch {
          return '# 薪资计算失败\n\n输入格式：{"monthlySalary":25000}\n\n> 免责声明：仅供参考。';
        }
        if (!(monthly > 0)) {
          return '# 薪资计算失败\n\nmonthlySalary 必须大于 0。\n\n> 免责声明：仅供参考。';
        }
        const sb = Number.isFinite(base) && base > 0 ? base : monthly;

        const pension = sb * 0.08;
        const medical = sb * 0.02;
        const unemployment = sb * 0.005;
        const fund = sb * (housingPct / 100);
        const socialTotal = pension + medical + unemployment + fund;

        const taxableAnnual = Math.max(0, (monthly - socialTotal - 5000) * 12);
        const bracket = BRACKETS.find((b) => taxableAnnual <= b[0])!;
        const iitAnnual = taxableAnnual * bracket[1] - bracket[2];
        const iitMonthly = iitAnnual / 12;
        const net = monthly - socialTotal - iitMonthly;
        const employerCost =
          monthly + sb * 0.16 + sb * 0.095 + sb * 0.005 + sb * (housingPct / 100);

        return [
          '# 月度薪资测算',
          '',
          `**税后到手：约 ${net.toFixed(0)} 元/月**`,
          '',
          '| 项目 | 个人 | 说明 |',
          '|---|---|---|',
          `| 养老保险 | ${pension.toFixed(0)} | 8% × 基数 |`,
          `| 医疗保险 | ${medical.toFixed(0)} | 2% × 基数 |`,
          `| 失业保险 | ${unemployment.toFixed(0)} | 0.5% × 基数 |`,
          `| 住房公积金 | ${fund.toFixed(0)} | ${housingPct}% × 基数 |`,
          `| 个税（累计预扣估） | ${iitMonthly.toFixed(0)} | 年应税 ${taxableAnnual.toFixed(0)}，适用 ${(bracket[1] * 100).toFixed(0)}% 档 |`,
          '',
          `- 企业用工成本合计：约 ${employerCost.toFixed(0)} 元/月`,
          `- 个人缴存公积金 + 企业缴存：${(fund * 2).toFixed(0)} 元/月入账`,
          '',
          '## 建议',
          '1. 公积金为免税收入，实际"隐性收入"高于表面到手工资。',
          '2. 专项附加扣除（房租/房贷/子女教育等）可进一步降低个税，本测算未计入。',
          '',
          '> 免责声明：采用通用比例与累计预扣模型，各城市政策不同，不构成税务意见，仅供参考。',
        ].join('\n');
      },
    });
  },
};
