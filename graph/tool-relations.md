# 工具关系图（开放词汇关系预测）

- 构建时间：2026-09-21T07:56:23.121Z
- 嵌入器：ollama:nomic-embed-text
- 节点：21 个工具，边：63 条关系
- 谓词库（推理时以字符串提供）：similar_to, complements, feeds_into, supersedes, validates

| 源工具 | 谓词 | 目标工具 | 相似度 |
|---|---|---|---|
| dsh-tool-date-math.calc | feeds_into | dsh-tool-loan-calc.calc | 0.8646 |
| dsh-tool-loan-calc.calc | feeds_into | dsh-tool-date-math.calc | 0.8646 |
| dsh-tool-invoice-calc.calc | feeds_into | dsh-tool-loan-calc.calc | 0.863 |
| dsh-tool-loan-calc.calc | feeds_into | dsh-tool-invoice-calc.calc | 0.863 |
| dsh-tool-fx-rates.convert | complements | dsh-tool-unit-convert.convert | 0.8472 |
| dsh-tool-unit-convert.convert | complements | dsh-tool-fx-rates.convert | 0.8472 |
| dsh-tool-loan-calc.calc | feeds_into | dsh-tool-salary-tax.calc | 0.8409 |
| dsh-tool-salary-tax.calc | feeds_into | dsh-tool-loan-calc.calc | 0.8409 |
| dsh-tool-invoice-calc.calc | feeds_into | dsh-tool-salary-tax.calc | 0.8304 |
| dsh-tool-salary-tax.calc | feeds_into | dsh-tool-invoice-calc.calc | 0.8304 |
| dsh-tool-date-math.calc | feeds_into | dsh-tool-invoice-calc.calc | 0.8208 |
| dsh-tool-invoice-calc.calc | feeds_into | dsh-tool-date-math.calc | 0.8208 |
| dsh-tool-date-math.calc | feeds_into | dsh-tool-salary-tax.calc | 0.8141 |
| dsh-tool-salary-tax.calc | feeds_into | dsh-tool-date-math.calc | 0.8141 |
| dsh-tool-color-kit.analyze | complements | dsh-tool-readability.analyze | 0.7843 |
| dsh-tool-readability.analyze | complements | dsh-tool-color-kit.analyze | 0.7843 |
| dsh-tool-codec-kit.codec | complements | dsh-tool-color-kit.analyze | 0.7779 |
| dsh-tool-color-kit.analyze | complements | dsh-tool-codec-kit.codec | 0.7779 |
| dsh-tool-unit-convert.convert | complements | dsh-tool-invoice-calc.calc | 0.7676 |
| dsh-tool-csv-stats.stats | complements | dsh-tool-health-metrics.metrics | 0.7582 |
| dsh-tool-health-metrics.metrics | complements | dsh-tool-csv-stats.stats | 0.7582 |
| dsh-tool-text-diff.diff | complements | dsh-tool-text-summary.summarize | 0.7521 |
| dsh-tool-text-summary.summarize | complements | dsh-tool-text-diff.diff | 0.7521 |
| dsh-tool-codec-kit.codec | complements | dsh-tool-unit-convert.convert | 0.7503 |
| dsh-tool-unit-convert.convert | complements | dsh-tool-codec-kit.codec | 0.7503 |
| dsh-tool-readability.analyze | complements | dsh-tool-unit-convert.convert | 0.748 |
| dsh-tool-text-diff.diff | complements | dsh-tool-unit-convert.convert | 0.7475 |
| dsh-tool-json-format.format | complements | dsh-tool-unit-convert.convert | 0.7459 |
| dsh-tool-regex-lab.test | complements | dsh-tool-unit-convert.convert | 0.7409 |
| dsh-tool-pass-forge.generate | complements | dsh-tool-unit-convert.convert | 0.7388 |
| dsh-tool-fx-rates.convert | complements | dsh-tool-invoice-calc.calc | 0.7374 |
| dsh-tool-health-metrics.metrics | complements | dsh-tool-seo-audit.audit | 0.737 |
| dsh-tool-seo-audit.audit | validates | dsh-tool-health-metrics.metrics | 0.737 |
| dsh-tool-codec-kit.codec | complements | dsh-tool-json-format.format | 0.7341 |
| dsh-tool-json-format.format | complements | dsh-tool-codec-kit.codec | 0.7341 |
| dsh-tool-csv-stats.stats | complements | dsh-tool-invoice-calc.calc | 0.734 |
| dsh-tool-csv-stats.stats | complements | dsh-tool-salary-tax.calc | 0.7322 |
| dsh-tool-health-metrics.metrics | complements | dsh-tool-readability.analyze | 0.7294 |
| dsh-tool-readability.analyze | complements | dsh-tool-health-metrics.metrics | 0.7294 |
| dsh-tool-fx-rates.convert | complements | dsh-tool-loan-calc.calc | 0.7274 |
| dsh-tool-json-format.format | complements | dsh-tool-text-diff.diff | 0.7273 |
| dsh-tool-text-diff.diff | complements | dsh-tool-json-format.format | 0.7273 |
| dsh-tool-laya-scene.scene | complements | dsh-tool-codec-kit.codec | 0.7268 |
| dsh-tool-text-summary.summarize | complements | dsh-tool-readability.analyze | 0.726 |
| dsh-tool-color-kit.analyze | complements | dsh-tool-unit-convert.convert | 0.725 |
| dsh-tool-regex-lab.test | complements | dsh-tool-csv-stats.stats | 0.7246 |
| dsh-tool-regex-lab.test | complements | dsh-tool-readability.analyze | 0.7225 |
| dsh-tool-laya-scene.scene | complements | dsh-tool-color-kit.analyze | 0.7156 |
| dsh-tool-laya-scene.scene | complements | dsh-tool-unit-convert.convert | 0.7149 |
| dsh-tool-markdown-report.report | complements | dsh-tool-text-summary.summarize | 0.7126 |
| dsh-tool-text-summary.summarize | complements | dsh-tool-markdown-report.report | 0.7126 |
| dsh-tool-seo-audit.audit | validates | dsh-tool-regex-lab.test | 0.7077 |
| dsh-tool-seo-audit.audit | validates | dsh-tool-csv-stats.stats | 0.7067 |
| dsh-tool-invest-growth.project | feeds_into | dsh-tool-loan-calc.calc | 0.7043 |
| dsh-tool-pass-forge.generate | complements | dsh-tool-text-diff.diff | 0.7038 |
| dsh-tool-carbon-baseline.baseline | complements | dsh-tool-health-metrics.metrics | 0.6992 |
| dsh-tool-pass-forge.generate | complements | dsh-tool-laya-scene.scene | 0.6921 |
| dsh-tool-markdown-report.report | complements | dsh-tool-json-format.format | 0.6911 |
| dsh-tool-carbon-baseline.baseline | complements | dsh-tool-csv-stats.stats | 0.6906 |
| dsh-tool-carbon-baseline.baseline | complements | dsh-tool-color-kit.analyze | 0.6897 |
| dsh-tool-invest-growth.project | feeds_into | dsh-tool-pass-forge.generate | 0.6892 |
| dsh-tool-markdown-report.report | complements | dsh-tool-unit-convert.convert | 0.6891 |
| dsh-tool-invest-growth.project | complements | dsh-tool-unit-convert.convert | 0.6847 |

> 免责声明：关系由嵌入相似度 + 启发式谓词推断，仅供参考。
