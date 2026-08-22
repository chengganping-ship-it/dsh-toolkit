export interface CritiqueScore {
  completeness: number; // 0..1
  consistency: number; // 0..1
  actionability: number; // 0..1
  overall: number; // weighted mean
  notes: string[];
}

/**
 * Heuristic three-dimensional self-critique.
 * Deterministic: same input always yields the same scores.
 */
export function selfCritique(output: string): CritiqueScore {
  const notes: string[] = [];
  const text = output.trim();

  // Completeness: length + section coverage + no truncation tails
  let completeness = Math.min(text.length / 800, 1);
  const sections = (text.match(/^#{1,4}\s/gm) ?? []).length;
  completeness = Math.min(completeness + sections * 0.1, 1);
  if (/(\.\.\.|待补充|TBD)$/i.test(text)) {
    completeness *= 0.5;
    notes.push('output appears truncated');
  }
  if (completeness < 0.6) notes.push('low completeness: too short or unstructured');

  // Consistency: numbers should not wildly contradict; avoid contradiction cues
  let consistency = 1;
  for (const cue of ['however the opposite', 'ignore previous', 'contradiction', '自相矛盾']) {
    if (text.toLowerCase().includes(cue)) {
      consistency -= 0.4;
      notes.push(`consistency cue found: ${cue}`);
    }
  }

  // Actionability: concrete numbers, steps, deadlines
  const numberHits = (text.match(/\d+(\.\d+)?%?/g) ?? []).length;
  const stepHits = (text.match(/^\s*(\d+[.)]|[-*])\s/gm) ?? []).length;
  let actionability = Math.min(numberHits / 8, 0.5) + Math.min(stepHits / 5, 0.5);
  actionability = Math.min(Math.max(actionability, text.length > 400 ? 0.4 : 0.2), 1);
  if (actionability < 0.4) notes.push('low actionability: few concrete figures or steps');

  const overall = completeness * 0.4 + consistency * 0.3 + actionability * 0.3;
  return { completeness, consistency, actionability, overall, notes };
}
