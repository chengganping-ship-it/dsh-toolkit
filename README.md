# DSH Plugin Toolkit

5 层突破基础设施 + 插件循环开发流水线。核心零运行时依赖；Bridge 层基于官方
[@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk)。

## 五层架构（v2）

| 层 | 目录 | 说明 |
|---|---|---|
| L1 MCP Bridge | `src/bridge/` | 官方 MCP SDK `McpServer.registerTool` + `StdioServerTransport`，原生兼容 Claude/Cursor 等所有 MCP 客户端；`server-lite.ts` 保留无依赖手写版 |
| L2 A2A Cards | `src/a2a/` | 对齐 Google A2A Protocol **v1.0 规范**；`dsh a2a serve` 基于 [@a2a-js/sdk](https://github.com/a2aproject/a2a-js) 起真实 A2A Server（JSON-RPC + REST，技能级路由） |
| L3 Loop Engineering | `src/loop/` | 6 验证器 + 三维启发式自批判 + 线性回退重试（有单元测试覆盖） |
| L4 Cost Governance | `src/cost/` | 三层预算状态机 OK→WARNING→CRITICAL→EXCEEDED，超限抛 `CostExceededError` 阻断 |
| L5 Multi-Agent Demo | `src/demo/`、`src/agents/` | 种子 PRNG 确定性编排，4 阶段并行调度 |

插件发现三级降级：完整 cordis.yml → 仅运行时数量(count-only) → 源码正则提取(regex)。
所有工具共享统一契约：MCP 入参 `{ input_data: string }`。

## 快速开始

```bash
npm install
npm run build          # 编译核心 + 全部插件

npx dsh list           # 列出发现的插件与工具
npm test               # 单元测试 (node:test, 9 cases)
npx dsh bridge         # 启动官方 SDK MCP stdio 服务器
npx dsh a2a gen        # 生成 a2a-cards/*.agent-card.json (A2A v1.0)
npx dsh a2a serve      # 启动真实 A2A v1.0 服务器 (:41241)
npx dsh llm models     # 列出本地 Ollama 模型（免费推理）
npx dsh llm ask "..."  # 本地 LLM 生成 + L3 验证循环
npx dsh demo carbon [--llm]  # L5 多Agent Demo（--llm 用本地 Ollama 真实合成）
npx dsh serve [port]   # REST 网关: POST /invoke，API-Key 计费 + 限流 (:8787)
npx dsh registry gen   # 市场目录: registry.json + index.html
npx dsh graph build     # 工具关系图（开放词汇关系预测，RAM 思路）
npx dsh rsi run --gens 1 --keep 2   # RSI 内部进化：组合新插件并保留优胜
npx dsh rsi harvest --queries "markdown to html,csv parser" --keep 4   # RSI 外部收割：搜索并集成第三方库
npx dsh rsi status      # 查看状态机（phase/gate/retry/checkpoint）
```

## 内置插件（20 个）

财务：invoice-calc / loan-calc / invest-growth / salary-tax / fx-rates
数据与开发：csv-stats / json-format / regex-lab / codec-kit / text-diff / date-math
内容与营销：seo-audit / text-summary / readability / markdown-report
生活工具：health-metrics / unit-convert / color-kit / pass-forge
垂直行业：carbon-baseline

## 循环开发新插件

```bash
npx dsh scaffold my-tool   # 生成 plugins/dsh-tool-my-tool/
npm run build              # 编译后即刻被 Bridge/A2A/Demo 发现
npx dsh list               # 验证
```

在生成的 `src/index.ts` 中实现 handler：入参 `input_data: string`，
返回字符串。输出末尾包含免责声明即可通过全部验证器。

## 预算配置

项目根目录放置 `dsh.budget.json`：

```json
{ "monthly": 5000000, "user": 200000, "plugin": 50000 }
```

不配置则不限制（仅追踪用量）。

## 发布路径

- **MCP 市场**：`npm pack` 后以 stdio 方式接入 Claude Desktop / Cursor 等 MCP 客户端（入口 `dist/bridge/server.js`，官方 SDK 实现）；可用 `npx @modelcontextprotocol/inspector node dist/bridge/server.js` 调试
- **Koishi 插件市场**：`npx dsh pack <plugin>` 生成符合市场准入规范的发布包（`koishi-plugin-*` 命名、`peerDependencies.koishi`、`koishi` 元数据字段），`cd publish/<name> && npm publish` 即上架
- **A2A 注册中心**：`a2a-cards/` 直接兼容 Google A2A v1.0 规范，可用官方 [@a2a-js/sdk](https://github.com/a2aproject/a2a-js) ClientFactory 消费

## 借鉴的开源项目

- **RelateAnything / RAM** (Apache-2.0)：开放词汇关系预测思想 → dsh graph build 用本地 nomic-embed-text 嵌入 21+ 工具，谓词在推理时以字符串提供（similar_to / complements / feeds_into / supersedes / validates）
- **LayaAir** (MIT)：全平台 3D/2D 引擎，其 IDE 资源商店是插件变现渠道之一 → dsh-tool-laya-scene 生成 LayaAir 风格场景 JSON
- **MCP / A2A 官方 SDK**：协议层实现

## RSI（递归自我改进 + 外部资源收割）

外部收割（`dsh rsi harvest`）：搜索 npm 生态 → 许可证/新鲜度/相关性门禁 → 安装 → 自动生成适配器插件（专用配方或通用探针）→ 编译 → 网关实测 → 只保留通过者，并在 `rsi/harvest-lineage.json` 记录来源与许可证。

状态机借鉴 JEO：`plan → execute → verify → cleanup → done`，计划哈希门禁（已批准的同哈希计划不重复评审、feedback 必须改计划）、checkpoint 续跑、retry_count 达到 3 提示人工介入。

```bash
npx dsh rsi run --gens 1 --keep 2
`

流程：观察工具目录 → 用关系图提出管道候选 → 生成插件源码 → 编译 → 执行采样输入 → L3 验证器打分 → 保留前 K 名（其余删除）→ 写入 si/lineage.json。生成的管道插件自给自足（动态加载成员插件），无需额外桥接。

## CI

`.github/workflows/ci.yml`：build → 单元测试 → 发现/A2A/pack 冒烟 → MCP 协议冒烟 → 确定性校验。
