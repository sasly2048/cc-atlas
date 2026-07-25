import { logger } from "../core/logger.js";
import type { ToolkitPlugin } from "./types.js";

/** Resolves each configured plugin (an npm package name or absolute path
 * to an ESM module with a default export satisfying ToolkitPlugin) and
 * skips — without crashing the whole CLI — any that fail to load. */
export async function loadPlugins(specifiers: string[]): Promise<ToolkitPlugin[]> {
  const plugins: ToolkitPlugin[] = [];

  for (const specifier of specifiers) {
    try {
      const mod = await import(specifier);
      const plugin = (mod.default ?? mod) as ToolkitPlugin;
      if (!plugin || typeof plugin.run !== "function" || !plugin.id) {
        logger.warn(`Plugin "${specifier}" does not export a valid ToolkitPlugin, skipping.`);
        continue;
      }
      plugins.push(plugin);
    } catch (err) {
      logger.warn(`Could not load plugin "${specifier}": ${(err as Error).message}`);
    }
  }

  return plugins;
}
