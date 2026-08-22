function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.replace('#', '').match(/^([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!m) return null;
  let s = m[1];
  if (s.length === 3) s = [...s].map((c) => c + c).join('');
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, Math.round(l * 100)];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)];
}

function luminance(r: number, g: number, b: number): number {
  const a = [r, g, b].map((v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * a[0]! + 0.7152 * a[1]! + 0.0722 * a[2]!;
}

export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'analyze',
      description: 'Input JSON: {color:"#RRGGBB", against?:"#RRGGBB"} -> conversions + WCAG contrast.',
      handler: async (inputData: string) => {
        let color = '';
        let against = '';
        try {
          const j = JSON.parse(inputData.trim());
          color = String(j.color ?? '');
          against = String(j.against ?? '#FFFFFF');
        } catch {
          color = inputData.trim();
          against = '#FFFFFF';
        }
        const rgb = hexToRgb(color);
        const rgb2 = hexToRgb(against);
        if (!rgb || !rgb2) {
          return '# 颜色分析失败\n\n颜色格式需为 #RGB 或 #RRGGBB。\n\n> 免责声明：仅供参考。';
        }
        const hsl = rgbToHsl(...rgb);
        const L1 = luminance(...rgb);
        const L2 = luminance(...rgb2);
        const contrast =
          (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);

        const wcag = (ratio: number, large: boolean) =>
          ratio >= (large ? 3 : 4.5) ? 'PASS' : 'FAIL';

        return [
          '# 颜色分析报告',
          '',
          `- HEX：${color.toUpperCase()}`,
          `- RGB：rgb(${rgb.join(', ')})`,
          `- HSL：hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`,
          `- 相对亮度：${L1.toFixed(4)}`,
          '',
          `## 与 ${against.toUpperCase()} 的对比度：${contrast.toFixed(2)}:1`,
          '',
          '| 标准 | 正常文本 | 大号文本 |',
          '|---|---|---|',
          `| WCAG AA | ${wcag(contrast, false)} | ${wcag(contrast, true)} |`,
          `| WCAG AAA | ${contrast >= 7 ? 'PASS' : 'FAIL'} | ${wcag(contrast, false)} |`,
          '',
          '## 建议',
          contrast < 4.5
            ? '1. 对比度不足 4.5:1，正文可读性差；建议加深/提亮前景色或更换背景。'
            : '1. 对比度达标，可放心用于正文文本。',
          '',
          '> 免责声明：基于 WCAG 2.x 相对亮度公式的静态计算，仅供参考。',
        ].join('\n');
      },
    });
  },
};
