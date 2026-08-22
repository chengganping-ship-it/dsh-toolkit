/**
 * Free local inference via Ollama (https://ollama.com).
 * No API key, no billing - runs on localhost:11434.
 */
export interface OllamaOptions {
  model?: string;
  baseUrl?: string;
  system?: string;
  temperature?: number;
}

const DEFAULT_MODEL = process.env['DSH_OLLAMA_MODEL'] ?? 'qwen2.5:7b-instruct';
const DEFAULT_BASE = process.env['DSH_OLLAMA_URL'] ?? 'http://127.0.0.1:11434';

export async function ollamaAvailable(baseUrl = DEFAULT_BASE): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listModels(baseUrl = DEFAULT_BASE): Promise<string[]> {
  const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return [];
  const data = (await res.json()) as { models?: { name: string }[] };
  return (data.models ?? []).map((m) => m.name);
}

export async function ollamaChat(
  prompt: string,
  opts: OllamaOptions = {},
): Promise<string> {
  const body = {
    model: opts.model ?? DEFAULT_MODEL,
    stream: false,
    messages: [
      ...(opts.system ? [{ role: 'system', content: opts.system }] : []),
      { role: 'user', content: prompt },
    ],
    options: opts.temperature !== undefined ? { temperature: opts.temperature } : {},
  };
  const res = await fetch(`${opts.baseUrl ?? DEFAULT_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(300000),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? '';
}
