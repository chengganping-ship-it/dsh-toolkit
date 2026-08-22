
export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'format',
      description: 'Validate JSON and return pretty-printed result with stats.',
      handler: async (inputData: string) => {
        const raw = inputData.trim();
        let parsed: unknown;
        try {
          parsed = JSON.parse(raw);
        } catch (e) {
          return [
            '```json',
            JSON.stringify({ valid: false, error: String(e) }, null, 2),
            '```',
            '',
            '> 免责声明：本结果由确定性校验器生成，仅供参考。',
          ].join('\n');
        }
        const stats = {
          valid: true,
          type: Array.isArray(parsed) ? 'array' : typeof parsed,
          keys: parsed && typeof parsed === 'object' ? Object.keys(parsed).length : 0,
        };
        return [
          '```json',
          JSON.stringify(parsed, null, 2),
          '```',
          '',
          `统计：${JSON.stringify(stats)}`,
          '',
          '> 免责声明：本结果由确定性校验器生成，仅供参考。',
        ].join('\n');
      },
    });
  },
};
