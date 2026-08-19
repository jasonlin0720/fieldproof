/**
 * fieldproof 的 programmatic API。
 *
 * 目前只導出建置入口與資料契約型別；渲染函式暫不對外，避免過早凍結介面。
 */

export { build, loadPages } from './build.js';
export type { BuildOutput, BuildResult } from './build.js';

export { CONFIG_FILENAME, configSchema, findConfig, loadConfig } from './config.js';
export type { FieldproofConfig, OutputKind, RenderContext, ResolvedConfig } from './config.js';

export { fieldMapPageSchema } from './schema.js';
export type {
  Field,
  FieldMapPage,
  Flag,
  Note,
  Origin,
  Query,
  Section,
  SectionKind,
  SourceKind,
} from './schema.js';

export { computeStats } from './stats.js';
export type { FieldMapStats } from './stats.js';
