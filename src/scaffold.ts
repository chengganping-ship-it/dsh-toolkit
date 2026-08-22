import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Loop-development entry: scaffold a new dsh-tool-* plugin with the
 * unified input_data contract so it is immediately bridge-discoverable.
 */
export function scaffoldPlugin(rawName: string): string {
  const name = rawName.startsWith('dsh-tool-') ? rawName : `dsh-tool-${rawName}`;
  const dir = path.resolve(process.cwd(), 'plugins', name);
  if (fs.existsSync(dir)) {
    throw new Error(`Plugin already exists: ${dir}`);
  }
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });

  const kebab = name.replace(/^dsh-tool-/, '');
  const camel = kebab.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

  fs.writeFileSync(
    path.join(dir, 'cordis.yml'),
    [
      `name: ${name}`,
      'version: 0.1.0',
      `description: ${camel} tool - TODO describe capability.`,
      'public: true',
      'tools:',
      `  - ${camel}`,
      '',
    ].join('\n'),
  );

  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify({ name, version: '0.1.0', type: 'module' }, null, 2) + '\n',
  );

  const src = `export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: '${camel}',
      description: '${camel}: deterministic transformation of input_data.',
      handler: async (inputData: string) => {
        const result = inputData.trim().toUpperCase();
        return [
          '# ${camel} 结果',
          '',
          String(result),
          '',
          '> 免责声明：本输出由确定性工具生成，仅供参考。',
        ].join('\\n');
      },
    });
  },
};
`;
  fs.writeFileSync(path.join(dir, 'src', 'index.ts'), src);
  console.log(`Scaffolded ${dir}`);
  console.log('Next: npm run build && npx dsh list');
  return dir;
}
