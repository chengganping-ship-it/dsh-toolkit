export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'test',
      description: 'Input JSON: {pattern, flags?, text} -> matches, groups, positions, diagnostics.',
      handler: async (inputData: string) => {
        let pattern = '';
        let flags = 'g';
        let text = '';
        try {
          const j = JSON.parse(inputData.trim()) as { pattern?: string; flags?: string; text?: string };
          pattern = String(j.pattern ?? '');
          flags = String(j.flags ?? 'g');
          text = String(j.text ?? '');
        } catch {
          return '# 正则测试失败\n\n输入必须是 {"pattern":"...","flags":"g","text":"..."}。\n\n> 免责声明：仅供参考。';
        }
        if (!pattern) {
          return '# 正则测试失败\n\npattern 为空。\n\n> 免责声明：仅供参考。';
        }
        let re: RegExp;
        try {
          re = new RegExp(pattern, flags.includes('g') ? flags : flags + 'g');
        } catch (e) {
          return `# 正则语法错误\n\n\`\`\`\n${String(e)}\n\`\`\`\n\n> 免责声明：仅供参考。`;
        }

        const matches = [...text.matchAll(re)].slice(0, 50);
        const lines = [
          '# 正则匹配报告',
          '',
          `- 模式：\`${pattern}\`（flags: ${flags}）`,
          `**- 匹配数：${matches.length}${matches.length >= 50 ? '（仅展示前 50）' : ''}**`,
          '',
        ];
        if (matches.length > 0) {
          lines.push('| # | 匹配内容 | 起始位置 | 捕获组 |', '|---|---|---|---|');
          matches.forEach((m, i) => {
            const groups = m.slice(1).map((g, gi) => `$${gi + 1}=${g ?? '-'}`).join(', ');
            lines.push(`| ${i + 1} | ${(m[0] ?? '').slice(0, 40)} | ${m.index ?? -1} | ${groups || '-'} |`);
          });
        }
        lines.push(
          '',
          '## 建议',
          ...(matches.length === 0
            ? ['1. 零匹配：检查转义字符与量词贪婪度，先用小样本调试。']
            : ['1. 若用于替换，建议先在完整样本上确认无过度匹配。']),
          '',
          '> 免责声明：本结果由 JavaScript 正则引擎生成，其他语言行为可能不同，仅供参考。',
        );
        return lines.join('\n');
      },
    });
  },
};
