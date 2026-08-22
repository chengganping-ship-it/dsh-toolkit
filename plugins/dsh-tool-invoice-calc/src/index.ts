export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'calc',
      description:
        'Invoice calculator. Input JSON: {items:[{name,qty,price,discount?}], taxRate, currency?}',
      handler: async (inputData: string) => {
        let d: any = {};
        try {
          d = JSON.parse(inputData.trim());
        } catch {
          return '# 发票计算失败\n\n输入必须是合法 JSON。\n\n> 免责声明：仅供参考。';
        }
        const items: any[] = Array.isArray(d.items) ? d.items : [];
        const taxRate = Number(d.taxRate ?? 0);
        const cur = String(d.currency ?? 'CNY');
        if (items.length === 0) {
          return '# 发票计算失败\n\nitems 为空。\n\n> 免责声明：仅供参考。';
        }

        const rows = items.map((it, i) => {
          const qty = Number(it.qty ?? 1);
          const price = Number(it.price ?? 0);
          const discount = Number(it.discount ?? 0);
          const line = qty * price * (1 - discount);
          return { no: i + 1, name: String(it.name ?? `项目${i + 1}`), qty, price, discount, line };
        });
        const subtotal = rows.reduce((s, r) => s + r.line, 0);
        const tax = subtotal * taxRate;
        const total = subtotal + tax;

        return [
          '# 发票明细',
          '',
          '| # | 项目 | 数量 | 单价 | 折扣 | 小计 |',
          '|---|---|---|---|---|---|',
          ...rows.map(
            (r) =>
              `| ${r.no} | ${r.name} | ${r.qty} | ${r.price.toFixed(2)} | ${(r.discount * 100).toFixed(0)}% | ${r.line.toFixed(2)} |`,
          ),
          '',
          `- 商品合计：${subtotal.toFixed(2)} ${cur}`,
          `- 税额（${(taxRate * 100).toFixed(1)}%）：${tax.toFixed(2)} ${cur}`,
          `**- 应付总额：${total.toFixed(2)} ${cur}**`,
          '',
          '## 建议',
          `1. 若月开票超过 10 万元，建议核对适用税率（当前 ${(taxRate * 100).toFixed(1)}%）。`,
          `2. 大额折扣行（≥30%）共 ${rows.filter((r) => r.discount >= 0.3).length} 条，注意留存依据。`,
          '',
          '> 免责声明：本计算器不构成税务意见，仅供参考。',
        ].join('\n');
      },
    });
  },
};
