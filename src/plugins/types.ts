import type { Db } from "../db/database.js";
import type { ToolkitConfig } from "../core/config.js";

/** Context handed to every plugin command so it can query the same data
 * the built-in features use, without reaching into internals directly. */
export interface PluginContext {
  db: Db;
  config: ToolkitConfig;
}

/** Plugins are arbitrary code loaded into the user's Node process, so
 * they get a permission model: a plugin that wants to read the
 * filesystem / talk to git / open a network socket / write to the
 * database has to declare it, and the user has to opt in (see
 * `~/.cc-atlas/plugin-approvals.json`). A plugin that doesn't declare
 * any permissions runs with the read-only database handle and the
 * config — nothing else. */
export interface PluginPermissions {
  filesystem: boolean;
  git: boolean;
  network: boolean;
  database: boolean;
  analytics: boolean;
}

/** The full interface a plugin module's default export must satisfy.
 * Plugins are plain ESM modules resolved by package name or absolute path
 * from config.plugins.enabled — see docs/PLUGINS.md. */
export interface ToolkitPlugin {
  /** Unique id, used for config.plugins.enabled entries and menu labels. */
  id: string;
  /** Short label shown in the interactive menu, e.g. "🔍 My Analyzer". */
  menuLabel: string;
  /** Optional: declare which capabilities the plugin needs. Plugins
   * with any permission set to true require an approval record before
   * the loader will execute them. */
  permissions?: PluginPermissions;
  /** Invoked when the user selects this plugin from the menu, or runs
   * `cc-atlas plugin run <id>` non-interactively. */
  run(ctx: PluginContext): Promise<void> | void;
}

export function definePlugin(plugin: ToolkitPlugin): ToolkitPlugin {
  return plugin;
}
