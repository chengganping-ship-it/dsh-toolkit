/**
 * Ambient plugin contract shared by all dsh-tool-* plugins.
 * Mirrors src/types.ts so plugins stay self-contained for compilation.
 */
declare interface ToolDef {
  name: string;
  description: string;
  handler: (inputData: string) => Promise<string>;
}

declare interface PluginContext {
  defineTool(def: ToolDef): void;
  logger: { info(msg: string): void; warn(msg: string): void };
}
