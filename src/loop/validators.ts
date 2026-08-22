export interface ValidationResult {
  validator: string;
  passed: boolean;
  detail: string;
}

export type Validator = (output: string) => ValidationResult;

/** 1. Markdown structure: headings/bullets present when long. */
const markdownStructure: Validator = (o) => {
  if (o.length < 300) return { validator: 'markdown-structure', passed: true, detail: 'short output, structure optional' };
  const ok = /^#{1,4}\s/m.test(o) || /^\s*[-*]\s/m.test(o);
  return {
    validator: 'markdown-structure',
    passed: ok,
    detail: ok ? 'has headings or bullets' : 'long output lacks headings/bullets',
  };
};

/** 2. Hallucination markers: known fake-content cues. */
const hallucinationMarkers: Validator = (o) => {
  const bad = [/lorem ipsum/i, /as an ai language model/i, /\bxxx placeholder\b/i, /TODO:\s*\[?\d{4}/];
  const hit = bad.find((r) => r.test(o));
  return {
    validator: 'hallucination-markers',
    passed: !hit,
    detail: hit ? `marker matched: ${hit}` : 'clean',
  };
};

/** 3. JSON validity: if fenced json exists it must parse. */
const jsonValid: Validator = (o) => {
  const fence = o.match(/```json\s*([\s\S]*?)```/);
  if (!fence) return { validator: 'json-valid', passed: true, detail: 'no json block' };
  try {
    JSON.parse(fence[1]);
    return { validator: 'json-valid', passed: true, detail: 'fenced json parses' };
  } catch (e) {
    return { validator: 'json-valid', passed: false, detail: String(e) };
  }
};

/** 4. Length bounds. */
const lengthBounds: Validator = (o) => {
  const min = Number(process.env['DSH_MIN_LEN'] ?? 40);
  const max = Number(process.env['DSH_MAX_LEN'] ?? 20000);
  const ok = o.length >= min && o.length <= max;
  return {
    validator: 'length-bounds',
    passed: ok,
    detail: `len=${o.length} bounds=[${min},${max}]`,
  };
};

/** 5. Keyword coverage: at least one required keyword per call. */
export function keywordValidator(keywords: string[]): Validator | null {
  if (keywords.length === 0) return null;
  return (o) => {
    const missing = keywords.filter((k) => !o.includes(k));
    return {
      validator: 'keyword-coverage',
      passed: missing.length < keywords.length,
      detail: missing.length ? `missing all of: ${missing.join(', ')}` : 'keywords present',
    };
  };
}

/** 6. Disclaimer presence for advisory outputs. */
const disclaimer: Validator = (o) => {
  const ok = /免责声明|disclaimer|仅供参考|not financial advice|不构成投资建议/i.test(o);
  return {
    validator: 'disclaimer',
    passed: ok,
    detail: ok ? 'disclaimer present' : 'missing disclaimer',
  };
};

export function defaultValidators(keywords: string[] = []): Validator[] {
  return [
    markdownStructure,
    hallucinationMarkers,
    jsonValid,
    lengthBounds,
    keywordValidator(keywords),
    disclaimer,
  ].filter((v): v is Validator => v !== null);
}
