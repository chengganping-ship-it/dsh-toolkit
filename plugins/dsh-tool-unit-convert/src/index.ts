const LENGTH: Record<string, number> = {
  mm: 0.001, cm: 0.01, m: 1, km: 1000, inch: 0.0254, ft: 0.3048, mile: 1609.344,
};
const WEIGHT: Record<string, number> = {
  g: 0.001, kg: 1, t: 1000, lb: 0.45359237, oz: 0.028349523,
};
const DATA: Record<string, number> = {
  B: 1, KB: 1024, MB: 1048576, GB: 1073741824, TB: 1099511627776,
};

function convert(value: number, from: string, to: string, table: Record<string, number>): number {
  return (value * table[from]) / table[to];
}

export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'convert',
      description:
        'Unit conversion. Input JSON or k=v: {value, from, to}. Supports length(mm/cm/m/km/inch/ft/mile), weight(g/kg/t/lb/oz), temp(C/F/K), data(B/KB/MB/GB/TB).',
      handler: async (inputData: string) => {
        let value = NaN;
        let from = '';
        let to = '';
        try {
          const j = JSON.parse(inputData.trim());
          value = Number(j.value);
          from = String(j.from ?? '');
          to = String(j.to ?? '');
        } catch {
          const m = inputData.match(/([\d.]+)\s*([A-Za-z°]+)\s*(?:to|->|→|转)\s*([A-Za-z°]+)/i);
          if (m) {
            value = Number(m[1]);
            from = m[2];
            to = m[3];
          }
        }
        if (!Number.isFinite(value) || !from || !to) {
          return '# 单位换算失败\n\n输入格式：{"value": 1, "from": "km", "to": "mile"}\n\n> 免责声明：仅供参考。';
        }

        let result: number | null = null;
        const f = from.toLowerCase();
        const t = to.toLowerCase();
        if (LENGTH[f] && LENGTH[t]) result = convert(value, f, t, LENGTH);
        else if (WEIGHT[f] && WEIGHT[t]) result = convert(value, f, t, WEIGHT);
        else if (DATA[f.toUpperCase()] && DATA[t.toUpperCase()])
          result = convert(value, f.toUpperCase(), t.toUpperCase(), DATA);
        else if ((f === 'c' || f === '°c') && (t === 'f' || t === '°f')) result = value * 1.8 + 32;
        else if ((f === 'f' || f === '°f') && (t === 'c' || t === '°c')) result = (value - 32) / 1.8;
        else if ((f === 'c' || f === '°c') && t === 'k') result = value + 273.15;
        else if (f === 'k' && (t === 'c' || t === '°c')) result = value - 273.15;

        if (result === null) {
          return `# 单位换算失败\n\n不支持的单位对：${from} -> ${to}\n\n> 免责声明：仅供参考。`;
        }

        return [
          '# 单位换算结果',
          '',
          `**${value} ${from} = ${result.toFixed(6)} ${to}**`,
          '',
          '> 免责声明：基于标准换算系数，仅供参考。',
        ].join('\n');
      },
    });
  },
};
