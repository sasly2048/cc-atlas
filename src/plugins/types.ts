import type { Db } from "../db/database.js";
import type { ToolkitConfig } from "../core/config.js";

/** Context handed to every plugin command so it can query the same data
 * the built-in features use, without reaching into internals directly. */
export interface PluginContext {
  db: Db;
  config: ToolkitConfig;
}

/** The full interface a plugin module's default export must satisfy.
 * Plugins are plain ESM modules resolved by package name or absolute path
 * from config.plugins.enabled — see docs/PLUGINS.md. */
export interface ToolkitPlugin {
  /** Unique id, used for config.plugins.enabled entries and menu labels. */
  id: string;
  /** Short label shown in the interactive menu, e.g. "🔍 My Analyzer". */
  menuLabel: string;
  /** Invoked when the user selects this plugin from the menu, or runs
   * `cc-atlas plugin run <id>` non-interactively. */
  run(ctx: PluginContext): Promise<void> | void;
}

export function definePlugin(plugin: ToolkitPlugin): ToolkitPlugin {
  return plugin;
}
