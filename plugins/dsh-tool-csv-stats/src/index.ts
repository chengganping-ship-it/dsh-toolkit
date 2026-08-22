export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'stats',
      description: 'CSV column statistics. Input: raw CSV text (first row = header).',
      handler: async (inputData: string) => {
        const lines = inputData.trim().split(/\r?\n/).filter((l) => l.trim());
        if (lines.length < 2) {
          return '# CSV 统计失败\n\n至少需要表头 + 1 行数据。\n\n> 免责声明：仅供参考。';
        }
        const headers = lines[0].split(',').map((h) => h.trim());
        const rows = lines.slice(1).map((l) => l.split(','));

        const cols = headers.map((h, i) => {
          const nums = rows
            .map((r) => Number((r[i] ?? '').trim()))
            .filter((v) => Number.isFinite(v));
          const nonEmpty = rows.filter((r) => (r[i] ?? '').trim()).length;
          if (nums.length === 0) {
            return { h, kind: 'text', nonEmpty };
          }
          const min = Math.min(...nums);
          const max = Math.max(...nums);
          const mean = nums.reduce((s, v) => s + v, 0) / nums.length;
          return { h, kind: 'numeric', nonEmpty, count: nums.length, min, max, mean };
        });

        return [
          '# CSV 数据统计',
          '',
          `- 行数（不含表头）：${rows.length}`,
          `- 列数：${headers.length}`,
          '',
          '| 列名 | 类型 | 非空数 | 最小值 | 最大值 | 均值 |',
          '|---|---|---|---|---|---|',
          ...cols.map((c) =>
            c.kind === 'numeric'
              ? `| ${c.h} | 数值 | ${c.nonEmpty} | ${c.min!.toFixed(2)} | ${c.max!.toFixed(2)} | ${c.mean!.toFixed(2)} |`
              : `| ${c.h} | 文本 | ${c.nonEmpty} | - | - | - |`,
          ),
          '',
          '## 建议',
          '1. 数值列均值与最大值差距过大时，检查是否存在离群值。',
          '2. 非空数小于总行数的列考虑补全或剔除。',
          '',
          '> 免责声明：本统计由确定性算法生成，仅供参考。',
        ].join('\n');
      },
    });
  },
};
