# RSI Plan

- Embedder: ollama:nomic-embed-text
- Candidates: 3 (keep top 2)
- Completion criteria: every kept plugin compiles, executes, passes all L3 validators, and answers HTTP 200 through the REST gateway

## Candidates
1. dsh-tool-rsi-rsi-date-math-calc-x-dsh-tool-loan-calc-calc-pip
   - members: dsh-tool-rsi-date-math-calc-x-dsh-tool-loan-calc-calc.pipeline + dsh-tool-rsi-rsi-date-math-calc-x-dsh-tool-loan-calc-calc-pip.pipeline
   - RSI-composed pipeline (complements): dsh-tool-rsi-date-math-calc-x-dsh-tool-loan-calc-calc.pipeline -> dsh-tool-rsi-rsi-date-math-calc-x-dsh-tool-loan-calc-calc-pip.pipeline
2. dsh-tool-rsi-rsi-date-math-calc-x-dsh-tool-loan-calc-calc-pip
   - members: dsh-tool-rsi-date-math-calc-x-dsh-tool-loan-calc-calc.pipeline + dsh-tool-rsi-invoice-calc-calc-x-dsh-tool-loan-calc-calc.pipeline
   - RSI-composed pipeline (complements): dsh-tool-rsi-date-math-calc-x-dsh-tool-loan-calc-calc.pipeline -> dsh-tool-rsi-invoice-calc-calc-x-dsh-tool-loan-calc-calc.pipeline
3. dsh-tool-rsi-ext-csv-parser-probe-x-dsh-tool-ext-fast-csv-pro
   - members: dsh-tool-ext-csv-parser.probe + dsh-tool-ext-fast-csv.probe
   - RSI-composed pipeline (complements): dsh-tool-ext-csv-parser.probe -> dsh-tool-ext-fast-csv.probe

## Risks
- composed pipelines may not be semantically meaningful (relation heuristic)
- rejected candidates are deleted, so selection is destructive by design
