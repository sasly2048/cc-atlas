import os from "node:os";
import path from "node:path";

/** All filesystem locations the toolkit touches, centralized so behavior is
 * consistent across Windows/macOS/Linux (os.homedir() handles the platform
 * differences for us). */
export const HOME_DIR = os.homedir();

/** Overridable via CC_ATLAS_HOME so tests and CI never touch a real ~/.cc-atlas. */
export const TOOLKIT_DIR = process.env.CC_ATLAS_HOME
  ? path.resolve(process.env.CC_ATLAS_HOME)
  : path.join(HOME_DIR, ".cc-atlas");
export const CONFIG_PATH = path.join(TOOLKIT_DIR, "config.json");
export const DB_PATH = path.join(TOOLKIT_DIR, "toolkit.sqlite3");
export const REPORTS_DIR = path.join(TOOLKIT_DIR, "reports");
export const PLUGINS_DIR = path.join(TOOLKIT_DIR, "plugins");

export const CLAUDE_DIR = path.join(HOME_DIR, ".claude");
export const CLAUDE_PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");

export function toolkitPath(...segments: string[]): string {
  return path.join(TOOLKIT_DIR, ...segments);
}
