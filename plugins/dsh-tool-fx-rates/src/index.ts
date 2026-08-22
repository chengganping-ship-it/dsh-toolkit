// Reference rates snapshot (deterministic, stamped). Refresh by updating this table.
const RATES: Record<string, number> = {
  USD: 1.0,
  CNY: 7.16,
  EUR: 0.92,
  JPY: 149.5,
  GBP: 0.79,
  HKD: 7.81,
};
const STAMP = '2026-08-01';

export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'convert',
      description:
        'Currency conversion from snapshot rate table. Input JSON: {amount, from, to} (USD/CNY/EUR/JPY/GBP/HKD).',
      handler: async (inputData: string) => {
        let amount = NaN;
        let from = '';
        let to = '';
        try {
          const j = JSON.parse(inputData.trim());
          amount = Number(j.amount);
          from = String(j.from ?? '').toUpperCase();
          to = String(j.to ?? '').toUpperCase();
        } catch {
          const m = inputData.match(/([\d.,]+)\s*([A-Za-z]{3})\s*(?:to|->|→)\s*([A-Za-z]{3})/i);
          if (m) {
            amount = Number(m[1].replace(/,/g, ''));
            from = m[2].toUpperCase();
            to = m[3].toUpperCase();
          }
        }
        if (!(Number.isFinite(amount) && RATES[from] && RATES[to])) {
          return `# 汇率换算失败\n\n支持的币种：${Object.keys(RATES).join(' / ')}\n\n> 免责声明：仅供参考。`;
        }
        const result = (amount / RATES[from]) * RATES[to];
        return [
          '# 货币换算结果',
          '',
          `**${amount.toLocaleString('en-US')} ${from} = ${result.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${to}**`,
          '',
          `- 参考汇率（${STAMP} 快照）：1 ${from} ≈ ${(result / amount).toFixed(4)} ${to}`,
          '- 换算金额超过 5 万美元等值时，注意个人年度购汇额度（5 万美元）限制。',
          '',
          '> 免责声明：使用静态快照汇率，非实时牌价，不构成结售汇建议，仅供参考。',
        ].join('\n');
      },
    });
  },
};
