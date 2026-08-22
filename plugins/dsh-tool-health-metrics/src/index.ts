export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'metrics',
      description:
        'Input JSON: {weightKg, heightCm, age, sex(male/female), activity(1.2-1.9)} -> BMI/BMR/TDEE report.',
      handler: async (inputData: string) => {
        let d: any = {};
        try {
          d = JSON.parse(inputData.trim());
        } catch {
          return '# 健康指标计算失败\n\n输入必须是合法 JSON。\n\n> 免责声明：仅供参考。';
        }
        const w = Number(d.weightKg);
        const h = Number(d.heightCm);
        const age = Number(d.age);
        const sex = String(d.sex ?? 'male').toLowerCase();
        const activity = Number(d.activity ?? 1.375);

        if (!(w > 0 && h > 0 && age > 0)) {
          return '# 健康指标计算失败\n\n需要 weightKg>0、heightCm>0、age>0。\n\n> 免责声明：仅供参考。';
        }

        const bmi = w / Math.pow(h / 100, 2);
        const bmr =
          sex === 'female'
            ? 10 * w + 6.25 * h - 5 * age - 161
            : 10 * w + 6.25 * h - 5 * age + 5;
        const tdee = bmr * (Number.isFinite(activity) && activity >= 1 && activity <= 2.2 ? activity : 1.375);

        let bmiLevel = '正常';
        if (bmi < 18.5) bmiLevel = '偏瘦';
        else if (bmi >= 24) bmiLevel = bmi >= 28 ? '肥胖' : '超重';
        const idealLow = 18.5 * Math.pow(h / 100, 2);
        const idealHigh = 23.9 * Math.pow(h / 100, 2);

        return [
          '# 个人健康指标报告',
          '',
          `**BMI：${bmi.toFixed(1)}（${bmiLevel}）**`,
          `- 基础代谢 BMR：${bmr.toFixed(0)} kcal/天`,
          `- 每日总消耗 TDEE：${tdee.toFixed(0)} kcal/天`,
          `- 理想体重区间：${idealLow.toFixed(1)} - ${idealHigh.toFixed(1)} kg`,
          '',
          '## 建议',
          ...(bmiLevel === '正常'
            ? ['1. 保持当前热量平衡，TDEE 上下 10% 内摄入。', '2. 每周至少 150 分钟中等强度运动。']
            : [
                `1. 目标区间 ${idealLow.toFixed(1)}-${idealHigh.toFixed(1)} kg，按每周 ±0.5 kg 渐进调整。`,
                `2. ${bmi >= 24 ? '摄入控制在 TDEE 的 80%（约 ' + (tdee * 0.8).toFixed(0) + ' kcal）' : '摄入提高到 TDEE 的 110%（约 ' + (tdee * 1.1).toFixed(0) + ' kcal）'}。`,
                '3. 每 4 周复测一次指标并记录趋势。',
              ]),
          '',
          '> 免责声明：本报告基于 Mifflin-St Jeor 公式的静态估算，不构成医疗建议，仅供参考。',
        ].join('\n');
      },
    });
  },
};
