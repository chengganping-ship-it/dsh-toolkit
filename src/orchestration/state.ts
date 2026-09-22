import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';

/**
 * JEO-inspired orchestration state machine.
 * Phases: plan -> execute -> verify -> cleanup -> done
 * Gates:  plan gate must be terminal-approved before execute.
 * Rules borrowed from JEO:
 *   - do not reopen the plan gate when the current plan hash already has a
 *     terminal result (approved / manual_approved)
 *   - feedback_required is NOT approval: the plan must be revised (new hash)
 *   - record checkpoint on entering each phase; resume from checkpoint
 *   - increment retry_count on failure; escalate to the human at >= 3
 */

export type Phase = 'plan' | 'execute' | 'verify' | 'cleanup' | 'done';
export type GateStatus =
  | 'pending'
  | 'approved'
  | 'feedback_required'
  | 'manual_approved'
  | 'infrastructure_blocked';

export interface PipelineState {
  pipeline: string;
  task: string;
  phase: Phase;
  checkpoint: Phase | null;
  plan_approved: boolean;
  plan_gate_status: GateStatus;
  plan_current_hash: string | null;
  last_reviewed_plan_hash: string | null;
  last_reviewed_plan_at: string | null;
  plan_review_method: 'auto' | 'manual' | null;
  retry_count: number;
  last_error: string | null;
  evidence: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export function statePath(root = process.cwd()): string {
  return path.join(root, '.dsh', 'state', 'rsi-state.json');
}

export function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

export function newState(task: string): PipelineState {
  const now = new Date().toISOString();
  return {
    pipeline: 'rsi',
    task,
    phase: 'plan',
    checkpoint: null,
    plan_approved: false,
    plan_gate_status: 'pending',
    plan_current_hash: null,
    last_reviewed_plan_hash: null,
    last_reviewed_plan_at: null,
    plan_review_method: null,
    retry_count: 0,
    last_error: null,
    evidence: {},
    created_at: now,
    updated_at: now,
  };
}

export function loadState(root = process.cwd()): PipelineState | null {
  const f = statePath(root);
  if (!fs.existsSync(f)) return null;
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8')) as PipelineState;
  } catch {
    return null;
  }
}

export function saveState(state: PipelineState, root = process.cwd()): void {
  const f = statePath(root);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  state.updated_at = new Date().toISOString();
  fs.writeFileSync(f, JSON.stringify(state, null, 2) + '\n');
}

export function enterPhase(state: PipelineState, phase: Phase): PipelineState {
  state.phase = phase;
  state.checkpoint = phase;
  return state;
}

export function recordError(state: PipelineState, message: string): PipelineState {
  state.last_error = message;
  state.retry_count += 1;
  return state;
}

export function needsHumanEscalation(state: PipelineState): boolean {
  return state.retry_count >= 3;
}

export interface PlanGateDecision {
  action: 'skip' | 'review' | 'revise';
  reason: string;
}

/**
 * JEO rule: same hash + terminal gate => skip; same hash + feedback_required
 * => must revise (NOT approve).
 */
export function evaluatePlanGate(
  state: PipelineState,
  planText: string,
): PlanGateDecision {
  const current = hashText(planText);
  state.plan_current_hash = current;

  const terminal = state.plan_gate_status === 'approved' || state.plan_gate_status === 'manual_approved';
  if (state.last_reviewed_plan_hash === current && terminal) {
    return { action: 'skip', reason: 'current plan hash already has a terminal approval' };
  }
  if (state.last_reviewed_plan_hash === current && state.plan_gate_status === 'feedback_required') {
    return { action: 'revise', reason: 'feedback pending for this plan hash - revise before re-review' };
  }
  return { action: 'review', reason: 'plan hash not yet reviewed' };
}

export function approvePlan(
  state: PipelineState,
  method: 'auto' | 'manual',
): PipelineState {
  state.plan_approved = true;
  state.plan_gate_status = method === 'manual' ? 'manual_approved' : 'approved';
  state.plan_review_method = method;
  state.last_reviewed_plan_hash = state.plan_current_hash;
  state.last_reviewed_plan_at = new Date().toISOString();
  return state;
}

export function rejectPlan(state: PipelineState): PipelineState {
  state.plan_approved = false;
  state.plan_gate_status = 'feedback_required';
  state.last_reviewed_plan_hash = state.plan_current_hash;
  state.last_reviewed_plan_at = new Date().toISOString();
  return state;
}

/** Resume target from a persisted state (checkpoint-based). */
export function resumePhase(state: PipelineState | null): Phase {
  if (!state) return 'plan';
  if (state.phase === 'done') return 'done';
  return state.checkpoint ?? state.phase;
}
