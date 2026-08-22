import express from 'express';
import { discoverPlugins, flattenTools } from '../bridge/loader.js';
import { runWithLoop } from '../loop/runner.js';
import { CostGovernor, CostExceededError } from '../cost/governor.js';

export interface RateBucket {
  count: number;
  resetAt: number;
}

const RATE_LIMIT = Number(process.env['DSH_RATE_LIMIT'] ?? 60); // req/min per key
const WINDOW_MS = 60_000;

/**
 * REST gateway: every DSH tool becomes a billable HTTP endpoint.
 *   GET  /health
 *   GET  /tools
 *   POST /invoke   { tool: "plugin.tool", input_data: "...", userKey? }
 * Auth: X-API-Key header (defaults to "anonymous").
 */
export async function createGatewayApp(): Promise<express.Express> {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  const governor = new CostGovernor();
  const buckets = new Map<string, RateBucket>();

  let registry: Map<
    string,
    { handler: ((i: string) => Promise<string>) | null; plugin: string }
  > = new Map();
  const { plugins } = await discoverPlugins();
  for (const t of flattenTools(plugins)) {
    registry.set(t.fqName, { handler: t.handler, plugin: t.plugin });
  }

  const rateLimited = (key: string): boolean => {
    const now = Date.now();
    const b = buckets.get(key);
    if (!b || now > b.resetAt) {
      buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
      return false;
    }
    b.count++;
    return b.count > RATE_LIMIT;
  };

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      tools: registry.size,
      cost: governor.snapshot(),
    });
  });

  app.get('/tools', (_req, res) => {
    res.json({
      tools: [...registry.entries()].map(([name, t]) => ({
        name,
        plugin: t.plugin,
        executable: !!t.handler,
        contract: { input_data: 'string' },
      })),
    });
  });

  app.post('/invoke', async (req, res) => {
    const apiKey = String(req.header('X-API-Key') ?? 'anonymous');
    if (rateLimited(apiKey)) {
      res.status(429).json({ error: 'rate limit exceeded', limit: `${RATE_LIMIT}/min` });
      return;
    }
    const tool = String(req.body?.['tool'] ?? '');
    const inputData =
      typeof req.body?.['input_data'] === 'string' ? req.body['input_data'] : '';
    const userKey = String(req.body?.['userKey'] ?? apiKey);
    const entry = registry.get(tool);

    if (!entry) {
      res.status(404).json({ error: `unknown tool: ${tool}` });
      return;
    }
    if (!entry.handler) {
      res.status(409).json({ error: `tool ${tool} has no executable handler` });
      return;
    }

    try {
      governor.charge({ userKey, pluginKey: entry.plugin, texts: [inputData] });
      const r = await runWithLoop(
        () => entry.handler!(inputData),
        { maxRetries: 2 },
      );
      res.json({
        tool,
        output: r.output,
        attempts: r.attempts,
        accepted: r.accepted,
        score: Number(r.critique.overall.toFixed(3)),
      });
    } catch (e) {
      if (e instanceof CostExceededError) {
        res.status(402).json({ error: e.message });
        return;
      }
      res.status(500).json({ error: String(e) });
    }
  });

  return app;
}

export async function startGateway(port = 8787): Promise<void> {
  const app = await createGatewayApp();
  app.listen(port, () => {
    console.error(`[dsh] gateway on http://localhost:${port}`);
    console.error('[dsh] POST /invoke {"tool":"plugin.tool","input_data":"..."}');
  });
}
