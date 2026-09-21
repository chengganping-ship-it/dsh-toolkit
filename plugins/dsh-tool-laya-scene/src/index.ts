/**
 * LayaAir-inspired scene generator.
 * Emits a declarative scene graph (LayaAir 3.x style: Sprite/Box/Text nodes with
 * transform + render props) that can be adapted into a LayaAir IDE scene JSON.
 */
interface NodeSpec {
  type?: 'Sprite' | 'Box' | 'Text' | 'Image';
  name?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  text?: string;
  children?: NodeSpec[];
}

const DEFAULTS = { x: 0, y: 0, width: 100, height: 100, color: '#FFFFFF' };

export default {
  async apply(ctx: PluginContext) {
    ctx.defineTool({
      name: 'scene',
      description:
        'Generate a LayaAir-style scene JSON. Input JSON: {name, width, height, nodes:[{type,name,x,y,width,height,color,text,children}]}',
      handler: async (inputData: string) => {
        let spec: NodeSpec & { name?: string; width?: number; height?: number; nodes?: NodeSpec[] } = {};
        try {
          spec = JSON.parse(inputData.trim());
        } catch {
          return '# 场景生成失败\n\n输入必须是合法 JSON。\n\n> 免责声明：仅供参考。';
        }
        const sceneName = String(spec.name ?? 'Scene');
        const sceneW = Number(spec.width ?? 750);
        const sceneH = Number(spec.height ?? 1334);
        const nodes = Array.isArray(spec.nodes) ? spec.nodes : [];

        if (nodes.length === 0) {
          return '# 场景生成失败\n\nnodes 为空。\n\n> 免责声明：仅供参考。';
        }

        let counter = 0;
        const build = (n: NodeSpec, depth: number): Record<string, unknown> => {
          counter++;
          const type = n.type ?? 'Sprite';
          const node: Record<string, unknown> = {
            _$id: counter,
            _$type: type,
            name: n.name ?? `${type}_${counter}`,
            props: {
              x: Number(n.x ?? DEFAULTS.x),
              y: Number(n.y ?? DEFAULTS.y),
              width: Number(n.width ?? DEFAULTS.width),
              height: Number(n.height ?? DEFAULTS.height),
            },
          };
          if (type === 'Box' || type === 'Sprite') {
            (node['props'] as Record<string, unknown>)['bgColor'] = n.color ?? DEFAULTS.color;
          }
          if (type === 'Text') {
            (node['props'] as Record<string, unknown>)['text'] = n.text ?? '';
            (node['props'] as Record<string, unknown>)['color'] = n.color ?? '#000000';
            (node['props'] as Record<string, unknown>)['fontSize'] = 24;
          }
          if (Array.isArray(n.children) && n.children.length > 0) {
            node['child'] = n.children.map((c) => build(c, depth + 1));
          }
          return node;
        };

        const tree = nodes.map((n) => build(n, 0));
        const scene = {
          _$type: 'Scene2D',
          name: sceneName,
          props: { width: sceneW, height: sceneH, bgColor: '#000000' },
          child: tree,
          meta: {
            generator: 'dsh-tool-laya-scene',
            compatible: 'LayaAir 3.x (Sprite/Box/Text)',
            nodeCount: counter,
          },
        };

        return [
          '# LayaAir 场景 JSON',
          '',
          `- 场景：${sceneName}（${sceneW} × ${sceneH}）`,
          `- 节点数：${counter}（顶层 ${tree.length}）`,
          '',
          '```json',
          JSON.stringify(scene, null, 2),
          '```',
          '',
          '## 使用方式',
          '1. 在 LayaAir IDE 中新建 2D 场景。',
          '2. 将上述 JSON 的 `child` 数组映射为对应节点（Sprite/Box/Text）。',
          '3. 需要 3D 时把 `_$type` 换为 MeshSprite3D 并补充 material 字段。',
          '',
          '> 免责声明：本场景为 LayaAir 风格的可移植描述，字段需按目标 IDE 版本核对，仅供参考。',
        ].join('\n');
      },
    });
  },
};
