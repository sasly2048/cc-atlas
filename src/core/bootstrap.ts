import { ensureToolkitDir, loadConfig, type ToolkitConfig } from "./config.js";
import { openDatabase, type Db } from "../db/database.js";
import { setTheme } from "../ui/theme.js";

export interface AppContext {
  db: Db;
  config: ToolkitConfig;
}

export function bootstrap(): AppContext {
  ensureToolkitDir();
  const config = loadConfig();
  setTheme({ gradientEnabled: config.theme === "gradient" });
  const db = openDatabase();
  return { db, config };
}
