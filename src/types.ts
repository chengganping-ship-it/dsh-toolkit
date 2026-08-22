export interface ToolDef {
  name: string;
  description: string;
  handler: (inputData: string) => Promise<string>;
}

export interface PluginContext {
  defineTool(def: ToolDef): void;
  logger: { info(msg: string): void; warn(msg: string): void };
}

export interface PluginModule {
  apply(ctx: PluginContext): void | Promise<void>;
}

export interface CordisMeta {
  name: string;
  version: string;
  description: string;
  public?: boolean;
  tools?: string[];
}

export interface PluginRecord {
  dirName: string;
  meta: CordisMeta | null;
  sourceLevel: 'full' | 'count-only' | 'regex';
  tools: DiscoveredTool[];
}

export interface DiscoveredTool {
  plugin: string;
  tool: string;
  fqName: string;
  description: string;
  handler: ((inputData: string) => Promise<string>) | null;
}
