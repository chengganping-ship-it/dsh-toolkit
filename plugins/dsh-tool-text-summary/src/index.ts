
const STOP = new Set([
  '的', '了', '和', '是', '在', '与', '及', '对', '为', 'the', 'a', 'an', 'of',
  'and', 'to', 'in', 'is', 'for', 'on', 'with', 'as', 'by', 'at',
]);

export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'summarize',
      description:
        'Extractive summary: top sentences ranked by term frequency plus key-figure bullets.',
      handler: async (inputData: string) => {
        const text = inputData.trim();
        if (!text) return '# 摘要\n\n输入为空。\n\n> 免责声明：仅供参考。';

        // Parse optional "top=N" directive on first line
        let top = 3;
        let body = text;
        const m = text.match(/^top=(\d+)\s*\n/);
        if (m) {
          top = Math.max(1, Math.min(10, Number(m[1])));
          body = text.slice(m[0].length);
        }

        const sentences = body
          .split(/(?<=[。！？.!?\n])/)
          .map((s) => s.trim())
          .filter((s) => s.length > 4);
        if (sentences.length === 0) {
          return `# 摘要\n\n- ${body}\n\n> 免责声明：本摘要由确定性算法生成，仅供参考。`;
        }

        const freq = new Map<string, number>();
        for (const s of sentences) {
          for (const w of s.split(/[^\p{L}\p{N}%]+/u)) {
            const k = w.toLowerCase();
            if (!k || STOP.has(k)) continue;
            freq.set(k, (freq.get(k) ?? 0) + 1);
          }
        }
        const scoreOf = (s: string) =>
          [...new Set(s.split(/[^\p{L}\p{N}%]+/u).map((w) => w.toLowerCase()))]
            .filter((w) => w && !STOP.has(w))
            .reduce((acc, w) => acc + (freq.get(w) ?? 0), 0);

        const ranked = sentences
          .map((s, i) => ({ s, i, score: scoreOf(s) }))
          .sort((a, b) => b.score - a.score || a.i - b.i)
          .slice(0, top)
          .sort((a, b) => a.i - b.i);

        const figures = [
          ...new Set(body.match(/\d+(?:\.\d+)?(?:%|万吨|亿|万元|tCO2e|kWh|km|台|个)?/g) ?? []),
        ].slice(0, 8);

        return [
          '# 摘要',
          '',
          ...ranked.map((r) => `- ${r.s}`),
          '',
          '## 关键数字',
          ...(figures.length ? figures.map((f) => `- ${f}`) : ['- 无']),
          '',
          '> 免责声明：本摘要由确定性抽取算法生成，仅供参考。',
        ].join('\n');
      },
    });
  },
};
