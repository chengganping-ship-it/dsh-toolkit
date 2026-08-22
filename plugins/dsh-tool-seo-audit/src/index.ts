export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'audit',
      description: 'On-page SEO audit. Input JSON: {url?, title, description, keywords[], content}',
      handler: async (inputData: string) => {
        let d: any = {};
        try {
          d = JSON.parse(inputData.trim());
        } catch {
          return '# SEO 审计失败\n\n输入必须是合法 JSON。\n\n> 免责声明：仅供参考。';
        }
        const title: string = d.title ?? '';
        const desc: string = d.description ?? '';
        const keywords: string[] = Array.isArray(d.keywords) ? d.keywords : [];
        const content: string = d.content ?? '';

        const checks: [string, boolean, string][] = [
          ['标题长度 15-60 字符', title.length >= 15 && title.length <= 60, `当前 ${title.length}`],
          ['描述长度 50-160 字符', desc.length >= 50 && desc.length <= 160, `当前 ${desc.length}`],
          ['关键词数量 1-10', keywords.length >= 1 && keywords.length <= 10, `当前 ${keywords.length}`],
          ['关键词出现在标题', keywords.some((k) => k && title.includes(k)), ''],
          ['正文字数 >= 300', content.length >= 300, `当前 ${content.length}`],
          ['正文含至少一半关键词', keywords.filter((k) => k && content.includes(k)).length >= Math.ceil(keywords.length / 2), ''],
        ];
        const passed = checks.filter((c) => c[1]).length;
        const score = Math.round((passed / checks.length) * 100);

        return [
          '# SEO 页面审计报告',
          '',
          '| 检查项 | 结果 | 说明 |',
          '|---|---|---|',
          ...checks.map((c) => `| ${c[0]} | ${c[1] ? 'PASS' : 'FAIL'} | ${c[2]} |`),
          '',
          `**综合得分：${score}/100**`,
          '',
          '## 改进建议',
          ...(checks.filter((c) => !c[1]).map((c) => `- 修复：${c[0]}（${c[2] || '未通过'}）`)),
          ...(checks.every((c) => c[1]) ? ['- 全部通过，保持现状并持续监测排名。'] : []),
          '',
          '> 免责声明：本审计基于页面静态规则的启发式评分，不构成搜索排名承诺，仅供参考。',
        ].join('\n');
      },
    });
  },
};
