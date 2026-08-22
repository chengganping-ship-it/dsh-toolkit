
// Published emission factors (kg CO2e per unit), deterministic constants.
const FACTORS: Record<string, { unit: string; factor: number }> = {
  electricity_kwh: { unit: 'kWh', factor: 0.5366 },
  natural_gas_m3: { unit: 'm3', factor: 2.162 },
  gasoline_l: { unit: 'L', factor: 2.3 },
  diesel_l: { unit: 'L', factor: 2.65 },
  flight_km: { unit: 'km', factor: 0.15 },
};

export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'baseline',
      description:
        'Compute tCO2e baseline. Input: JSON or k=v pairs with keys like electricity_kwh, natural_gas_m3.',
      handler: async (inputData: string) => {
        const values = parseInput(inputData);
        if (Object.keys(values).length === 0) {
          return `# 碳基线计算失败\n\n未识别任何活动数据。支持键：${Object.keys(FACTORS).join(', ')}\n\n> 免责声明：仅供估算参考。`;
        }

        const rows: string[] = [];
        let totalKg = 0;
        for (const [k, v] of Object.entries(values)) {
          const f = FACTORS[k];
          if (!f || !Number.isFinite(v)) continue;
          const kg = v * f.factor;
          totalKg += kg;
          rows.push(
            `| ${k} | ${v.toLocaleString('en-US')} ${f.unit} | ${f.factor} | ${kg.toFixed(2)} | ${(kg / 1000).toFixed(4)} |`,
          );
        }
        const tco2e = totalKg / 1000;

        return [
          '# 碳排放基线（tCO2e）',
          '',
          '| 排放源 | 活动数据 | 排放因子 (kgCO2e/单位) | 排放量 (kgCO2e) | 排放量 (tCO2e) |',
          '|---|---|---|---|---|',
          ...rows,
          '',
          `**合计：约 ${tco2e.toFixed(2)} tCO2e**`,
          '',
          '## 建议下一步',
          '1. 按排放源排序识别前三大热点。',
          '2. 对占比超过 20% 的源设定年度减排目标。',
          '3. 建立月度数据采集流程以跟踪基线变化。',
          '',
          '> 免责声明：基于公开排放因子的静态估算，不构成合规核算结论，仅供参考。',
        ].join('\n');
      },
    });
  },
};

function parseInput(raw: string): Record<string, number> {
  const out: Record<string, number> = {};
  try {
    const j = JSON.parse(raw) as Record<string, unknown>;
    for (const [k, v] of Object.entries(j)) {
      const n = Number(v);
      if (Number.isFinite(n)) out[k] = n;
    }
    return out;
  } catch {
    /* fall through to k=v parsing */
  }
  for (const pair of raw.split(/[;\n]/)) {
    const m = pair.match(/^\s*([a-z_]+)\s*[=:]\s*([\d.,]+)\s*$/i);
    if (m) {
      const n = Number(m[2].replace(/,/g, ''));
      if (Number.isFinite(n)) out[m[1]] = n;
    }
  }
  return out;
}
