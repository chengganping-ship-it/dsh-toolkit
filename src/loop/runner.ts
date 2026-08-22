import { defaultValidators } from './validators.js';
import { selfCritique } from './critic.js';
import type { ValidationResult, CritiqueScore } from './validators-types.js';

export interface LoopOptions {
  maxRetries?: number;
  threshold?: number;
  keywords?: string[];
  requireDisclaimer?: boolean;
}

export interface LoopResult {
  output: string;
  attempts: number;
  validations: ValidationResult[];
  critique: CritiqueScore;
  accepted: boolean;
  fallbackUsed: boolean;
}

export type Executor = (attempt: number) => Promise<string>;

/**
 * L3: execute -> validate -> self-critique -> linear fallback retry.
 * Attempt 0 is the primary strategy; each retry degrades linearly
 * (attempt N uses fallback strategy N).
 */
export async function runWithLoop(
  exec: Executor,
  opts: LoopOptions = {},
): Promise<LoopResult> {
  const maxRetries = opts.maxRetries ?? 2;
  const threshold = opts.threshold ?? 0.55;
  const validators = defaultValidators(opts.keywords ?? []);

  let best: { output: string; score: number; validations: ValidationResult[] } | null = null;
  let attempt = 0;

  while (attempt <= maxRetries) {
    const output = (await exec(attempt)).trim();
    const validations = validators.map((v) => v(output));
    const failed = validations.filter((v) => !v.passed);
    const score =
      selfCritique(output).overall - failed.length * 0.15;

    if (!best || score > best.score) {
      best = { output, score, validations };
    }
    if (failed.length === 0 && selfCritique(output).overall >= threshold) {
      return {
        output,
        attempts: attempt + 1,
        validations,
        critique: selfCritique(output),
        accepted: true,
        fallbackUsed: attempt > 0,
      };
    }
    attempt++;
  }

  return {
    output: best!.output,
    attempts: maxRetries + 1,
    validations: best!.validations,
    critique: selfCritique(best!.output),
    accepted: false,
    fallbackUsed: true,
  };
}
