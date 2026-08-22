export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'codec',
      description:
        'Input JSON: {action: encode|decode, encoding: base64|base64url|hex|uri, text}',
      handler: async (inputData: string) => {
        let action = '';
        let encoding = '';
        let text = '';
        try {
          const j = JSON.parse(inputData.trim());
          action = String(j.action ?? '');
          encoding = String(j.encoding ?? '').toLowerCase();
          text = String(j.text ?? '');
        } catch {
          return '# 编解码失败\n\n输入必须是 {"action":"encode","encoding":"base64","text":"..."}。\n\n> 免责声明：仅供参考。';
        }

        try {
          let out = '';
          if (encoding === 'base64' || encoding === 'base64url') {
            if (action === 'encode') {
              out = Buffer.from(text, 'utf8').toString('base64');
              if (encoding === 'base64url')
                out = out.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            } else {
              let b64 = text.replace(/-/g, '+').replace(/_/g, '/');
              while (b64.length % 4) b64 += '=';
              out = Buffer.from(b64, 'base64').toString('utf8');
            }
          } else if (encoding === 'hex') {
            out =
              action === 'encode'
                ? Buffer.from(text, 'utf8').toString('hex')
                : Buffer.from(text, 'hex').toString('utf8');
          } else if (encoding === 'uri') {
            out =
              action === 'encode'
                ? encodeURIComponent(text)
                : decodeURIComponent(text);
          } else {
            return `# 编解码失败\n\n不支持的编码：${encoding}（支持 base64 / base64url / hex / uri）\n\n> 免责声明：仅供参考。`;
          }

          return [
            '# 编解码结果',
            '',
            `- 操作：${action} (${encoding})`,
            `- 输入长度：${text.length}`,
            `- 输出长度：${out.length}`,
            '',
            '```',
            out.slice(0, 2000),
            '```',
            '',
            '> 免责声明：编解码结果请自行校验完整性，仅供参考。',
          ].join('\n');
        } catch (e) {
          return `# 编解码失败\n\n${String(e)}\n\n> 免责声明：仅供参考。`;
        }
      },
    });
  },
};
