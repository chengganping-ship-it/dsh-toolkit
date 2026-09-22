#!/usr/bin/env node
import { startMcpBridge } from './bridge/server.js';
import { generateA2ACards } from './a2a/generator.js';
import { discoverPlugins, flattenTools } from './bridge/loader.js';
import { runCarbonDemo } from './demo/carbon-strategy.js';
import { scaffoldPlugin } from './scaffold.js';
import { packKoishi } from './pack.js';
import { startA2AServer } from './a2a/server.js';
import { startGateway } from './gateway/server.js';
import {
  createKey,
  revokeKey,
  loadKeys,
  readUsage,
} from './gateway/keys.js';
import { generateRegistry } from './registry.js';
import { writeRelationGraph, explainTool } from './graph/relations.js';
import { runRsi } from './rsi/engine.js';
import { runHarvest } from './rsi/harvest.js';
import { loadState, statePath } from './orchestration/state.js';
import {
  ollamaAvailable,
  listModels,
  ollamaChat,
} from './llm/ollama.js';
import { runWithLoop } from './loop/runner.js';
import * as fs from 'node:fs';

const HELP = `dsh - DSH Plugin Toolkit CLI

Usage:
  dsh list                 List discovered plugins and tools (3-level discovery)
  dsh bridge               Start MCP stdio bridge server (official SDK, all plugins as tools)
  dsh a2a gen [dir]        Generate Google A2A v1.0 AgentCards (default ./a2a-cards)
  dsh a2a serve [port]     Start real A2A v1.0 server (@a2a-js/sdk, default :41241)
  dsh demo carbon [--llm]  Run L5 multi-agent demo (--llm = local Ollama synthesis)
  dsh serve [port]         REST gateway: POST /invoke with API-key billing (:8787)
  dsh keys create <name> [quotaTokens]  Create API key (empty file = open mode)
  dsh keys list            List API keys and usage aggregates
  dsh keys revoke <name|key>            Revoke an API key
  dsh registry gen         Generate marketplace catalog (registry.json + index.html)
  dsh graph build [dir]    Open-vocabulary tool relation graph (RAM-inspired)
  dsh graph explain <tool> Show one tool's inferred relations
  dsh rsi run [--gens N] [--keep K] [--manual]   Gated self-improvement pipeline (internal)
  dsh rsi harvest [--queries a,b] [--keep K]   Harvest external resources into new plugins
  dsh rsi status           Show the RSI state machine (phase/gate/retry/checkpoint)
  dsh scaffold <name>      Scaffold a new dsh-tool-<name> plugin (loop-dev entry)
  dsh pack <dir-name>      Build publish-ready Koishi marketplace package
  dsh llm models           List local Ollama models (free inference)
  dsh llm ask <prompt>     Ask local LLM, wrapped by loop engineering (L3)
`;

async function main(): Promise<void> {
  const [, , cmd, ...args] = process.argv;

  switch (cmd) {
    case 'list': {
      const { plugins } = await discoverPlugins();
      let total = 0;
      for (const p of plugins) {
        console.log(`${p.dirName}  [${p.sourceLevel}]  ${p.tools.length} tool(s)`);
        for (const t of p.tools) {
          console.log(`    ${t.fqName}${t.handler ? '' : ' (no handler)'}`);
        }
        total += p.tools.length;
      }
      console.log(`\n${plugins.length} plugin(s), ${total} tool(s)`);
      break;
    }
    case 'bridge':
      await startMcpBridge();
      break;
    case 'a2a':
      if (args[0] === 'gen') {
        const files = await generateA2ACards(args[1]);
        console.log(`Generated ${files.length} AgentCard(s):`);
        for (const f of files) console.log('  ' + f);
      } else if (args[0] === 'serve') {
        await startA2AServer(Number(args[1]) || 41241);
        // keep process alive
        setInterval(() => {}, 1 << 30);
      } else {
        console.error(HELP);
        process.exitCode = 1;
      }
      break;
    case 'demo':
      if (args[0] === 'carbon') {
        const useLlm = args.includes('--llm');
        const out = await runCarbonDemo(undefined, { useLlm });
        const file = useLlm ? 'carbon-strategy-report-llm.md' : 'carbon-strategy-report.md';
        fs.writeFileSync(file, out);
        console.log(out);
        console.error(`\nReport written to ${file}${useLlm ? ' (LLM synthesis)' : ''}`);
      } else {
        console.error(HELP);
        process.exitCode = 1;
      }
      break;
    case 'serve': {
      const port = Number(args[0]) || 8787;
      await startGateway(port);
      setInterval(() => {}, 1 << 30);
      break;
    }
    case 'keys': {
      const sub = args[0];
      if (sub === 'create') {
        if (!args[1]) {
          console.error('Usage: dsh keys create <name> [quotaTokens]');
          process.exitCode = 1;
          break;
        }
        const quota = args[2] ? Number(args[2]) : null;
        const rec = createKey(args[1], Number.isFinite(quota as number) ? (quota as number) : null);
        console.log(`API key created for "${rec.name}":`);
        console.log(`  ${rec.key}`);
        console.log(`  quota: ${rec.quotaTokens ?? 'unlimited'} tokens`);
      } else if (sub === 'list') {
        const all = loadKeys();
        const usage = readUsage();
        if (all.length === 0) console.log('(no keys - gateway is in open mode)');
        for (const r of all) {
          const u = usage.byKey[r.name];
          console.log(
            `${r.revoked ? '[REVOKED]' : '[ACTIVE ]'} ${r.name.padEnd(16)} key=${r.key.slice(0, 12)}... quota=${r.quotaTokens ?? '-'} calls=${u?.calls ?? 0} tokens=${u?.tokens ?? 0}`,
          );
        }
      } else if (sub === 'revoke') {
        if (!args[1]) {
          console.error('Usage: dsh keys revoke <name|key>');
          process.exitCode = 1;
          break;
        }
        console.log(revokeKey(args[1]) ? 'revoked' : 'not found');
      } else {
        console.error(HELP);
      }
      break;
    }
    case 'graph': {
      if (args[0] === 'build') {
        const files = await writeRelationGraph(args[1]);
        console.log('Relation graph written:');
        for (const f of files) console.log('  ' + f);
      } else if (args[0] === 'explain') {
        if (!args[1]) {
          console.error('Usage: dsh graph explain <plugin.tool>');
          process.exitCode = 1;
          break;
        }
        console.log(await explainTool(args[1]));
      } else {
        console.error(HELP);
        process.exitCode = 1;
      }
      break;
    }
    case 'rsi': {
      if (args[0] === 'run') {
        const gensIdx = args.indexOf('--gens');
        const keepIdx = args.indexOf('--keep');
        const generations = gensIdx >= 0 ? Number(args[gensIdx + 1]) || 1 : 1;
        const keep = keepIdx >= 0 ? Number(args[keepIdx + 1]) || 2 : 2;
        const gate = args.includes('--manual') ? 'manual' : 'auto';
        console.log(`RSI: ${generations} generation(s), keep top ${keep}, gate=${gate}`);
        const result = await runRsi({ generations, keep, gate });
        for (const h of result.lineage) {
          console.log(
            `  gen ${h.generation}: candidates=${h.candidates} gate=${h.gate} kept=[${h.kept.join(', ')}] rejected=${h.rejected.length}`,
          );
          for (const e of h.evaluations) {
            console.log(
              `    ${e.id} score=${e.score} compiled=${e.compiled} executed=${e.executed} failures=${e.validatorFailures.join('/') || '-'}`,
            );
          }
          for (const v of h.verify) {
            console.log(
              `    verify ${v.plugin}: http=${v.httpStatus} output=${v.outputLength} ok=${v.ok}`,
            );
          }
        }
        console.log(`Lineage: rsi/lineage.json | state: ${statePath()}`);
      } else if (args[0] === 'harvest') {
        const qIdx = args.indexOf('--queries');
        const keepIdx = args.indexOf('--keep');
        const queries =
          qIdx >= 0 && args[qIdx + 1]
            ? String(args[qIdx + 1])
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined;
        const keep = keepIdx >= 0 ? Number(args[keepIdx + 1]) || 2 : 2;
        const gate = args.includes('--manual') ? 'manual' : 'auto';
        console.log(
          `RSI harvest: queries=${queries?.join(' | ') ?? '(defaults)'} keep=${keep} gate=${gate}`,
        );
        const result = await runHarvest({ queries, keep, gate });
        for (const h of result.lineage) {
          console.log(`  gate=${h.gate} selected=${h.selected.join(', ') || '(none)'}`);
          for (const i of h.integrations) {
            console.log(
              `    ${i.pluginName}: installed=${i.installed} compiled=${i.compiled} executed=${i.executed} score=${i.score} http=${i.verify.httpStatus} ok=${i.verify.ok} (${i.license})`,
            );
          }
          if (h.rejected.length) {
            console.log(`    rejected ${h.rejected.length}: ${h.rejected.slice(0, 5).map((r) => r.name).join(', ')}...`);
          }
        }
        console.log('Lineage: rsi/harvest-lineage.json');
      } else if (args[0] === 'status') {
        const s = loadState();
        if (!s) {
          console.log('(no rsi state yet - run: dsh rsi run)');
        } else {
          console.log(JSON.stringify(s, null, 2));
        }
      } else {
        console.error(HELP);
        process.exitCode = 1;
      }
      break;
    }
    case 'registry':
      if (args[0] === 'gen') {
        const files = await generateRegistry(args[1]);
        console.log('Registry generated:');
        for (const f of files) console.log('  ' + f);
      } else {
        console.error(HELP);
        process.exitCode = 1;
      }
      break;
    case 'scaffold':
      if (!args[0]) {
        console.error('Usage: dsh scaffold <name>   (creates plugins/dsh-tool-<name>)');
        process.exitCode = 1;
      } else {
        scaffoldPlugin(args[0]);
      }
      break;
    case 'llm': {
      if (args[0] === 'models') {
        if (!(await ollamaAvailable())) {
          console.error('Ollama not reachable at 127.0.0.1:11434');
          process.exitCode = 1;
          break;
        }
        for (const m of await listModels()) console.log('  ' + m);
      } else if (args[0] === 'ask') {
        const prompt = args.slice(1).join(' ');
        if (!prompt) {
          console.error('Usage: dsh llm ask <prompt>');
          process.exitCode = 1;
          break;
        }
        const r = await runWithLoop(
          () => ollamaChat(prompt, { system: '你是 DSH 工具包的助手。输出结构化 Markdown，包含具体数字与步骤，结尾附免责声明。' }),
          { maxRetries: 2 },
        );
        console.log(r.output);
        console.error(`\n[loop] attempts=${r.attempts} accepted=${r.accepted} score=${r.critique.overall.toFixed(2)}`);
      } else {
        console.error(HELP);
      }
      break;
    }
    case 'pack': {
      if (!args[0]) {
        console.error('Usage: dsh pack <plugin-dir-name>');
        process.exitCode = 1;
        break;
      }
      const outDir = packKoishi(args[0]);
      console.log(`Koishi package ready: ${outDir}`);
      console.log(`Publish with: cd ${outDir} && npm publish`);
      break;
    }
    default:
      console.log(HELP);
  }
}

main().catch((e) => {
  console.error(String(e));
  process.exit(1);
});

// keep flattenTools referenced for programmatic consumers
void flattenTools;
