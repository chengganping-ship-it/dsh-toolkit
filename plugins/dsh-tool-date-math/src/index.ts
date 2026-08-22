export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'calc',
      description:
        'Input JSON: {start:"YYYY-MM-DD", end?: "YYYY-MM-DD", addDays?, addWorkdays?} -> diff/workdays/offset.',
      handler: async (inputData: string) => {
        let start = '';
        let end = '';
        let addDays = NaN;
        let addWorkdays = NaN;
        try {
          const j = JSON.parse(inputData.trim());
          start = String(j.start ?? '');
          end = String(j.end ?? '');
          if (j.addDays !== undefined) addDays = Number(j.addDays);
          if (j.addWorkdays !== undefined) addWorkdays = Number(j.addWorkdays);
        } catch {
          return '# 日期计算失败\n\n输入格式：{"start":"2026-01-01","addWorkdays":10}\n\n> 免责声明：仅供参考。';
        }

        const parse = (s: string) => {
          const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
          if (!m) return null;
          const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
          return Number.isNaN(d.getTime()) ? null : d;
        };
        const fmt = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const isWorkday = (d: Date) => d.getDay() !== 0 && d.getDay() !== 6;

        const sd = parse(start);
        if (!sd) {
          return '# 日期计算失败\n\nstart 必须是 YYYY-MM-DD。\n\n> 免责声明：仅供参考。';
        }
        const out: string[] = ['# 日期计算结果', '', `- 起始日期：${fmt(sd)}（星期${'日一二三四五六'[sd.getDay()]}）`];

        if (Number.isFinite(addDays)) {
          const d = new Date(sd);
          d.setDate(d.getDate() + Math.trunc(addDays));
          out.push(`**- 加 ${Math.trunc(addDays)} 天：${fmt(d)}（星期${'日一二三四五六'[d.getDay()]}）**`);
        }
        if (Number.isFinite(addWorkdays)) {
          const d = new Date(sd);
          let n = Math.abs(Math.trunc(addWorkdays));
          const dir = addWorkdays >= 0 ? 1 : -1;
          while (n > 0) {
            d.setDate(d.getDate() + dir);
            if (isWorkday(d)) n--;
          }
          out.push(`**- 加 ${Math.trunc(addWorkdays)} 个工作日：${fmt(d)}（星期${'日一二三四五六'[d.getDay()]}）**`);
        }
        if (end) {
          const ed = parse(end);
          if (!ed) return '# 日期计算失败\n\nend 必须是 YYYY-MM-DD。\n\n> 免责声明：仅供参考。';
          let workdays = 0;
          const cursor = new Date(sd);
          while (cursor < ed) {
            cursor.setDate(cursor.getDate() + 1);
            if (isWorkday(cursor)) workdays++;
          }
          const days = Math.round((ed.getTime() - sd.getTime()) / 86400000);
          out.push(
            `**- 距 ${end}：${days} 自然日，其中约 ${workdays} 个工作日**`,
          );
        }

        out.push(
          '',
          '> 免责声明：工作日按周一至周五计算，未扣除法定节假日与调休，仅供参考。',
        );
        return out.join('\n');
      },
    });
  },
};
