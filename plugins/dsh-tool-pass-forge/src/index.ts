import * as crypto from 'node:crypto';

// Local deterministic PRNG (mulberry32) - plugins stay self-contained.
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'generate',
      description:
        'Input JSON: {length?, count?, seed?} -> passwords with entropy report. Same seed = same passwords.',
      handler: async (inputData: string) => {
        let length = 16;
        let count = 5;
        let seed: number | null = null;
        try {
          const j = JSON.parse(inputData.trim() || '{}');
          if (Number.isFinite(Number(j.length))) length = Math.max(8, Math.min(128, Number(j.length)));
          if (Number.isFinite(Number(j.count))) count = Math.max(1, Math.min(50, Number(j.count)));
          if (Number.isFinite(Number(j.seed))) seed = Number(j.seed);
        } catch {
          /* defaults */
        }

        const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
        const lower = 'abcdefghijkmnpqrstuvwxyz';
        const digits = '23456789';
        const symbols = '!@#$%^&*-_+=?';
        const all = upper + lower + digits + symbols;

        const rand = seed !== null ? seededRandom(seed) : () => crypto.randomInt(1 << 30) / (1 << 30);
        const pick = (chars: string) => chars[Math.floor(rand() * chars.length)];

        const passwords: string[] = [];
        for (let i = 0; i < count; i++) {
          let pw = [pick(upper), pick(lower), pick(digits), pick(symbols)];
          for (let k = pw.length; k < length; k++) pw.push(pick(all));
          // deterministic Fisher-Yates shuffle
          for (let k = pw.length - 1; k > 0; k--) {
            const j = Math.floor(rand() * (k + 1));
            [pw[k], pw[j]] = [pw[j], pw[k]];
          }
          passwords.push(pw.join(''));
        }

        const poolSize = all.length;
        const entropyBits = Math.round(length * Math.log2(poolSize));
        const strength =
          entropyBits >= 100 ? '极强' : entropyBits >= 80 ? '强' : entropyBits >= 60 ? '中等' : '弱';

        return [
          '# 密码生成结果',
          '',
          `- 数量：${count}，长度：${length}`,
          `**- 熵：约 ${entropyBits} bits（${strength}）**`,
          ...(seed !== null ? [`- 种子模式：seed=${seed}（相同种子可复现，勿用于生产密码！）`] : ['- 随机模式：crypto 安全随机数。']),
          '',
          '```',
          ...passwords,
          '```',
          '',
          '## 建议',
          '1. 重要账户启用双因素认证（2FA），密码仅是第一道防线。',
          '2. 不同站点使用不同密码，推荐配合密码管理器使用。',
          '',
          '> 免责声明：请勿在不受信任的渠道粘贴真实生产密码需求，仅供参考。',
        ].join('\n');
      },
    });
  },
};
