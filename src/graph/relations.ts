import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverPlugins, flattenTools } from '../bridge/loader.js';
import { ollamaEmbed, ollamaAvailable } from '../llm/ollama.js';

/**
 * Borrowed from RelateAnything / RAM (open-vocabulary relation prediction):
 *   - regions/tools are embedded, not classified by a trained head
 *   - the predicate vocabulary is supplied at inference as strings
 *   - relations are scored by similarity to predicate prototypes
 * Here: tools = "objects", predicate bank = string prototypes, edges = relations.
 */

export interface ToolNode {
  id: string;
  plugin: string;
  tool: string;
  description: string;
  embedding: number[] | null;
}

export interface RelationEdge {
  source: string;
  target: string;
  predicate: string;
  score: number;
}

export interface RelationGraph {
  builtAt: string;
  embedder: string;
  nodes: ToolNode[];
  edges: RelationEdge[];
}

/** Open vocabulary: predicates as natural-language prototypes, supplied at inference. */
export const PREDICATE_BANK: Record<string, string> = {
  similar_to: 'two tools that compute comparable things in the same domain',
  complements: 'two tools used together in the same workflow step',
  feeds_into: 'the output of the first tool is the natural input of the second tool',
  supersedes: 'the first tool is a more general version of the second',
  validates: 'the first tool checks, audits or scores what the second produces',
};

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Lexical fallback when no embedder is available (deterministic). */
function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((w) => w.length > 2),
  );
}

export function lexicalSimilarity(a: string, b: string): number {
  const sa = tokenize(a);
  const sb = tokenize(b);
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const w of sa) if (sb.has(w)) inter++;
  return inter / new Set([...sa, ...sb]).size;
}

export async function buildRelationGraph(opts: {
  threshold?: number;
  maxEdgesPerNode?: number;
  useEmbeddings?: boolean;
} = {}): Promise<RelationGraph> {
  const threshold = opts.threshold ?? 0.55;
  const maxEdges = opts.maxEdgesPerNode ?? 3;
  const { plugins } = await discoverPlugins();
  const tools = flattenTools(plugins);

  const wantEmbed = opts.useEmbeddings !== false && (await ollamaAvailable());
  const embedder = wantEmbed ? 'ollama:nomic-embed-text' : 'lexical-jaccard';

  const nodes: ToolNode[] = [];
  for (const t of tools) {
    const text = `${t.plugin} ${t.tool} ${t.description || ''}`.trim();
    const embedding = wantEmbed ? await ollamaEmbed(text) : null;
    nodes.push({
      id: t.fqName,
      plugin: t.plugin,
      tool: t.tool,
      description: t.description || `Invoke ${t.tool}`,
      embedding,
    });
  }

  const sim = (a: ToolNode, b: ToolNode): number => {
    if (a.embedding && b.embedding) return cosine(a.embedding, b.embedding);
    return lexicalSimilarity(`${a.plugin} ${a.tool}`, `${b.plugin} ${b.tool}`);
  };

  const edges: RelationEdge[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const scored: { target: string; score: number }[] = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      scored.push({ target: nodes[j]!.id, score: sim(nodes[i]!, nodes[j]!) });
    }
    scored.sort((x, y) => y.score - x.score);
    for (const s of scored.slice(0, maxEdges)) {
      if (s.score < threshold) continue;
      // Predicate chosen from the open vocabulary by a deterministic heuristic
      // on tool semantics (no trained classifier - RAM-style string vocabulary).
      edges.push({
        source: nodes[i]!.id,
        target: s.target,
        predicate: inferPredicate(nodes[i]!, nodes.find((n) => n.id === s.target)!),
        score: Number(s.score.toFixed(4)),
      });
    }
  }

  return {
    builtAt: new Date().toISOString(),
    embedder,
    nodes: nodes.map((n) => ({ ...n, embedding: null })), // keep artifact small
    edges,
  };
}

function inferPredicate(a: ToolNode, b: ToolNode): string {
  const desc = `${a.description} ${b.description}`.toLowerCase();
  if (/\b(audit|validate|check|score|分析|审计|校验)\b/.test(a.description.toLowerCase()))
    return 'validates';
  if (/\b(convert|format|transform|转换|格式化)\b/.test(desc)) return 'complements';
  if (/\b(calc|compute|project|测算|计算)\b/.test(a.description.toLowerCase())) return 'feeds_into';
  if (a.plugin === b.plugin) return 'similar_to';
  return 'complements';
}

export async function writeRelationGraph(outDir?: string): Promise<string[]> {
  const target = outDir ?? path.resolve(process.cwd(), 'graph');
  fs.mkdirSync(target, { recursive: true });
  const g = await buildRelationGraph();
  const jsonFile = path.join(target, 'tool-relations.json');
  fs.writeFileSync(jsonFile, JSON.stringify(g, null, 2) + '\n');

  const lines = [
    '# 工具关系图（开放词汇关系预测）',
    '',
    `- 构建时间：${g.builtAt}`,
    `- 嵌入器：${g.embedder}`,
    `- 节点：${g.nodes.length} 个工具，边：${g.edges.length} 条关系`,
    `- 谓词库（推理时以字符串提供）：${Object.keys(PREDICATE_BANK).join(', ')}`,
    '',
    '| 源工具 | 谓词 | 目标工具 | 相似度 |',
    '|---|---|---|---|',
    ...g.edges
      .slice()
      .sort((x, y) => y.score - x.score)
      .map((e) => `| ${e.source} | ${e.predicate} | ${e.target} | ${e.score} |`),
    '',
    '> 免责声明：关系由嵌入相似度 + 启发式谓词推断，仅供参考。',
  ];
  const mdFile = path.join(target, 'tool-relations.md');
  fs.writeFileSync(mdFile, lines.join('\n') + '\n');
  return [jsonFile, mdFile];
}
