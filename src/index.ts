/** Public programmatic API — re-exports the pieces most useful to embed
 * elsewhere (a plugin, a dashboard, a test) without going through the CLI. */
export * from "./types/domain.js";
export * from "./core/config.js";
export * from "./core/paths.js";
export { openDatabase, closeDatabase } from "./db/database.js";
export * from "./db/repositories.js";
export * from "./services/transcript-parser.js";
export * from "./services/ingest.js";
export * from "./services/git-service.js";
export * from "./services/git-ingest.js";
export * from "./analytics/session-stats.js";
export * from "./analytics/tool-usage.js";
export * from "./analytics/streaks.js";
export * from "./analytics/burnout.js";
export * from "./analytics/git-activity.js";
export * from "./analytics/heatmap.js";
export * from "./analytics/cost.js";
export * from "./analytics/forecast.js";
export * from "./analytics/content.js";
export * from "./analytics/context.js";
export * from "./analytics/collaboration.js";
export * from "./analytics/personality.js";
export * from "./analytics/model-usage.js";
export * from "./plugins/types.js";
