export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'calc',
      description:
        'Loan calculator. Input JSON or k=v: {principal, annualRatePct, years} -> monthly payment schedule summary.',
      handler: async (inputData: string) => {
        let principal = 0;
        let annualRatePct = 0;
        let years = 0;
        try {
          const j = JSON.parse(inputData.trim());
          principal = Number(j.principal);
          annualRatePct = Number(j.annualRatePct);
          years = Number(j.years);
        } catch {
          for (const pair of inputData.split(/[;\n]/)) {
            const m = pair.match(/^\s*(principal|annualRatePct|years)\s*[=:]\s*([\d.]+)\s*$/i);
            if (!m) continue;
            if (/principal/i.test(m[1])) principal = Number(m[2]);
            if (/annualRatePct/i.test(m[1])) annualRatePct = Number(m[2]);
            if (/years/i.test(m[1])) years = Number(m[2]);
          }
        }
        if (!(principal > 0 && annualRatePct >= 0 && years > 0)) {
          return '# 贷款计算失败\n\n需要 principal>0、annualRatePct>=0、years>0。\n\n> 免责声明：不构成投资建议，仅供参考。';
        }

        const n = Math.round(years * 12);
        const r = annualRatePct / 100 / 12;
        const monthly =
          r === 0 ? principal / n : (principal * r) / (1 - Math.pow(1 + r, -n));
        const totalPay = monthly * n;
        const totalInterest = totalPay - principal;

        // Yearly amortization milestones
        let balance = principal;
        const yearRows: string[] = [];
        for (let y = 1; y <= Math.min(years, 30); y++) {
          let interestYear = 0;
          for (let m = 0; m < 12 && balance > 0; m++) {
            const interest = balance * r;
            const princ = monthly - interest;
            balance -= princ;
            interestYear += interest;
          }
          yearRows.push(`| 第 ${y} 年 | ${Math.max(balance, 0).toFixed(2)} | ${interestYear.toFixed(2)} |`);
        }

        return [
          '# 等额本息贷款测算',
          '',
          `- 本金：${principal.toFixed(2)}`,
          `- 年利率：${annualRatePct}%`,
          `- 期限：${years} 年（${n} 期）`,
          '',
          `**月供：${monthly.toFixed(2)}**`,
          `**总利息：${totalInterest.toFixed(2)}**`,
          `**还款总额：${totalPay.toFixed(2)}**`,
          '',
          '| 年份 | 期末余额 | 当年利息 |',
          '|---|---|---|',
          ...yearRows,
          '',
          '> 免责声明：本测算基于等额本息模型，不构成投资或信贷建议，仅供参考。',
        ].join('\n');
      },
    });
  },
};
