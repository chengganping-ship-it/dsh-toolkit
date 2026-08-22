export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'project',
      description:
        'Input JSON: {principal, monthlyAdd?, annualRatePct, years} -> yearly compound projection.',
      handler: async (inputData: string) => {
        let principal = 0;
        let monthlyAdd = 0;
        let rate = NaN;
        let years = 0;
        try {
          const j = JSON.parse(inputData.trim());
          principal = Number(j.principal);
          monthlyAdd = Number(j.monthlyAdd ?? 0);
          rate = Number(j.annualRatePct);
          years = Number(j.years);
        } catch {
          return '# 投资测算失败\n\n输入必须是 {"principal":100000,"annualRatePct":6,"years":10}。\n\n> 免责声明：仅供参考。';
        }
        if (!(principal >= 0 && Number.isFinite(rate) && years > 0)) {
          return '# 投资测算失败\n\n需要 principal>=0、annualRatePct、years>0。\n\n> 免责声明：不构成投资建议，仅供参考。';
        }

        const r = rate / 100;
        const mr = Math.pow(1 + r, 1 / 12) - 1; // 月复利
        let balance = principal;
        let contributed = principal;
        const rows: string[] = [];
        for (let y = 1; y <= Math.min(years, 50); y++) {
          for (let m = 0; m < 12; m++) {
            balance = balance * (1 + mr) + monthlyAdd;
            contributed += monthlyAdd;
          }
          rows.push(
            `| ${y} | ${contributed.toFixed(0)} | ${(balance - contributed).toFixed(0)} | ${balance.toFixed(0)} |`,
          );
        }

        return [
          '# 复利增长测算',
          '',
          `- 初始本金：${principal.toFixed(0)}，每月定投：${monthlyAdd.toFixed(0)}`,
          `- 年化收益率假设：${rate}%（按月复利）`,
          '',
          '| 年份 | 累计投入 | 累计收益 | 期末资产 |',
          '|---|---|---|---|',
          ...rows,
          '',
          '## 建议',
          `1. 第 ${Math.min(years, 50)} 年末资产约为累计投入的 ${(balance / Math.max(contributed, 1)).toFixed(2)} 倍。`,
          '2. 收益率假设每降 2%，长期终值可能相差 30% 以上——保守估计更安全。',
          '',
          '> 免责声明：静态模型测算，不含税费与波动风险，不构成投资建议，仅供参考。',
        ].join('\n');
      },
    });
  },
};
