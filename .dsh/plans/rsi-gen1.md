# RSI Plan

- Embedder: ollama:nomic-embed-text
- Candidates: 3 (keep top 2)
- Completion criteria: every kept plugin compiles, executes, passes all L3 validators, and answers HTTP 200 through the REST gateway

## Candidates
1. dsh-tool-rsi-5d00c650
   - members: dsh-tool-ext-csv-parser.probe + dsh-tool-ext-fast-csv.probe
   - RSI pipeline [5d00c650]: dsh-tool-ext-csv-parser.probe -> dsh-tool-ext-fast-csv.probe (complements)
2. dsh-tool-rsi-abd12b0f
   - members: dsh-tool-date-math.calc + dsh-tool-loan-calc.calc
   - RSI pipeline [abd12b0f]: dsh-tool-date-math.calc -> dsh-tool-loan-calc.calc (feeds_into)
3. dsh-tool-rsi-a01c94a5
   - members: dsh-tool-color-kit.analyze + dsh-tool-ext-color.probe
   - RSI pipeline [a01c94a5]: dsh-tool-color-kit.analyze -> dsh-tool-ext-color.probe (complements)

## Risks
- composed pipelines may not be semantically meaningful (relation heuristic)
- rejected candidates are deleted, so selection is destructive by design
