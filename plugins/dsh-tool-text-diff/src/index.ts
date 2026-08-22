export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'diff',
      description: 'Text comparison. Input JSON: {a, b} -> word-level added/removed stats and Jaccard similarity.',
      handler: async (inputData: string) => {
        let a = '';
        let b = '';
        try {
          const j = JSON.parse(inputData.trim()) as { a?: string; b?: string };
          a = String(j.a ?? '');
          b = String(j.b ?? '');
        } catch {
          return '# 文本对比失败\n\n输入必须是 {"a": "...", "b": "..."}。\n\n> 免责声明：仅供参考。';
        }
        if (!a && !b) {
          return '# 文本对比失败\n\n两个文本均为空。\n\n> 免责声明：仅供参考。';
        }

        const words = (s: string) =>
          new Set(s.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map((w) => w.toLowerCase()));
        const sa = words(a);
        const sb = words(b);
        const removed = [...sa].filter((w) => !sb.has(w));
        const added = [...sb].filter((w) => !sa.has(w));
        const kept = [...sa].filter((w) => sb.has(w));
        const union = new Set([...sa, ...sb]).size;
        const jaccard = union === 0 ? 1 : kept.length / union;

        return [
          '# 文本对比报告',
          '',
          `- 文本 A 词数（去重）：${sa.size}`,
          `- 文本 B 词数（去重）：${sb.size}`,
          `**- 相似度（Jaccard）：${(jaccard * 100).toFixed(1)}%**`,
          '',
          '## 变更明细',
          `- 保留词：${kept.length} 个`,
          `- 删除词（A 有 B 无）：${removed.length} 个`,
          ...(removed.slice(0, 10).map((w) => `  - ${w}`)),
          `- 新增词（B 有 A 无）：${added.length} 个`,
          ...(added.slice(0, 10).map((w) => `  - ${w}`)),
          '',
          '## 建议',
          jaccard > 0.9
            ? '1. 两文本高度相似，若用于 SEO 需注意重复内容风险。'
            : '1. 变更幅度较大，建议人工复核关键术语是否被误改。',
          '',
          '> 免责声明：基于词集的统计对比，仅供参考。',
        ].join('\n');
      },
    });
  },
};
