
interface Section {
  heading: string;
  body: string;
}

export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'report',
      description:
        'Build a markdown report from JSON input {title, sections:[{heading, body}]}.',
      handler: async (inputData: string) => {
        let title = '报告';
        let sections: Section[] = [];
        try {
          const parsed = JSON.parse(inputData.trim()) as {
            title?: string;
            sections?: Section[];
          };
          if (parsed.title) title = parsed.title;
          if (Array.isArray(parsed.sections)) sections = parsed.sections;
        } catch {
          return [
            '# 报告生成失败',
            '',
            '输入必须是合法 JSON：`{"title": "...", "sections": [{"heading": "...", "body": "..."}]}`',
            '',
            '> 免责声明：仅供参考。',
          ].join('\n');
        }

        const out: string[] = [`# ${title}`, ''];
        sections.forEach((s, i) => {
          out.push(`## ${i + 1}. ${s.heading}`, '', s.body.trim(), '');
        });
        out.push('---', '> 免责声明：本报告由自动化工具生成，不构成投资建议，仅供参考。');
        return out.join('\n');
      },
    });
  },
};
