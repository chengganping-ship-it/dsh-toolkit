export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'analyze',
      description: 'Input: raw text. Output readability report with concrete improvement targets.',
      handler: async (inputData: string) => {
        const text = inputData.trim();
        if (text.length < 50) {
          return '# 可读性分析失败\n\n文本过短（至少 50 字符）。\n\n> 免责声明：仅供参考。';
        }

        const cjkChars = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
        const latinWords = (
          text.match(/[A-Za-z]+(?:[''-][A-Za-z]+)*/g) ?? []
        ).length;
        const totalUnits = cjkChars + latinWords;
        const sentences = text
          .split(/(?<=[。！？.!?\n])/)
          .map((s) => s.trim())
          .filter((s) => s.length > 1);
        const longSentences = sentences.filter((s) => s.length > 80).length;

        // Paragraph & heading structure
        const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
        const headings = (text.match(/^#{1,4}\s/m) ?? []).length;
        const bullets = (text.match(/^\s*[-*\d]+[.)]?\s/m) ?? []).length;

        const avgSentence = totalUnits / Math.max(sentences.length, 1);
        const readMinutes = Math.max(1, Math.round(totalUnits / 400));

        let grade = '良好';
        if (avgSentence > 60 || longSentences / Math.max(sentences.length, 1) > 0.3)
          grade = '偏难';
        else if (avgSentence < 20 && bullets > 0) grade = '易读';

        return [
          '# 文本可读性报告',
          '',
          `**综合评级：${grade}**`,
          '',
          `- 总量：${totalUnits} 计数单位（中文 ${cjkChars} 字 + 英文 ${latinWords} 词）`,
          `- 句子数：${sentences.length}，平均句长：${avgSentence.toFixed(1)} 字/句`,
          `- 超长句（>80 字符）：${longSentences} 句`,
          `- 预计阅读时长：约 ${readMinutes} 分钟`,
          `- 结构：${paragraphs} 段落 / ${headings} 标题 / ${bullets} 列表项`,
          '',
          '## 改进目标',
          ...(avgSentence > 40
            ? ['1. 平均句长超过 40，建议拆分长句至 25-35 字。']
            : ['1. 句长控制良好，保持现状。']),
          ...(longSentences > 0
            ? [`2. 处理 ${longSentences} 个超长句：一个句子只表达一个核心信息。`]
            : []),
          ...(bullets === 0 && text.length > 800
            ? ['3. 长文缺少列表结构，建议为步骤类内容增加编号列表。']
            : []),
          '',
          '> 免责声明：基于启发式统计的可读性估算，仅供参考。',
        ].join('\n');
      },
    });
  },
};
