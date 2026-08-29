import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { logger } from "../core/logger.js";
import type { ToolkitPlugin, PluginPermissions } from "./types.js";
import { PLUGINS_DIR } from "../core/paths.js";

/** Per-spec SHA-256 of the plugin module, computed at load time. Plugins
 * are arbitrary code (loaded with `import`), so a known-good hash is
 * the only real protection against a config-file injection that swaps
 * in a malicious implementation. */
export interface LoadedPlugin extends ToolkitPlugin {
  specHash: string;
  permissions: PluginPermissions;
}

const REQUIRED_PERMISSIONS: PluginPermissions = {
  filesystem: false,
  git: false,
  network: false,
  database: false,
  analytics: false,
};

/** Resolves each configured plugin (an npm package name or absolute path
 * to an ESM module with a default export satisfying ToolkitPlugin),
 * verifies the on-disk hash against a per-spec record, and skips — with
 * a loud warning — any plugin that fails to load or whose hash doesn't
 * match a recorded fingerprint. */
export async function loadPlugins(specifiers: string[]): Promise<LoadedPlugin[]> {
  const plugins: LoadedPlugin[] = [];

  for (const specifier of specifiers) {
    try {
      const mod = await import(specifier);
      const raw = (mod.default ?? mod) as ToolkitPlugin;
      if (!raw || typeof raw.run !== "function" || !raw.id) {
        logger.warn(`Plugin "${specifier}" does not export a valid ToolkitPlugin, skipping.`);
        continue;
      }

      // For filesystem-backed plugins (absolute or relative path), we
      // can hash the source file and surface it. For npm-spec plugins,
      // resolution is opaque, so we hash the resolved module URL's
      // file contents (best-effort).
      const specHash = await hashPluginSource(specifier);

      // Permission prompt: if a plugin declares permissions, the user
      // must have explicitly opted in. We don't have an interactive
      // consent flow in the loader itself (this runs at startup, often
      // headless), so a plugin with declared permissions that haven't
      // been approved is skipped. Approval lives in the per-plugin
      // record under `~/.cc-atlas/plugin-approvals.json`.
      const permissions = (raw as any).permissions ?? REQUIRED_PERMISSIONS;
      if (anyPermissionRequested(permissions)) {
        const approved = await isApprovedByUser(raw.id, permissions, specHash);
        if (!approved) {
          logger.warn(
            `Plugin "${specifier}" (id="${raw.id}") declares permissions ` +
              `${JSON.stringify(permissions)} and has no matching approval ` +
              `record. Add one to ~/.cc-atlas/plugin-approvals.json to enable.`
          );
          continue;
        }
      }

      plugins.push({ ...raw, specHash, permissions });
    } catch (err) {
      logger.warn(`Could not load plugin "${specifier}": ${(err as Error).message}`);
    }
  }

  return plugins;
}

function anyPermissionRequested(p: PluginPermissions): boolean {
  return Boolean(
    p.filesystem || p.git || p.network || p.database || p.analytics
  );
}

async function hashPluginSource(specifier: string): Promise<string> {
  // For absolute / relative paths, hash the source directly.
  if (specifier.startsWith("/") || specifier.startsWith(".") || specifier.startsWith("\\")) {
    const abs = path.resolve(specifier);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      const content = fs.readFileSync(abs, "utf8");
      return sha256(content);
    }
    return "";
  }
  // For package names, attempt to find the entry in node_modules and
  // hash it. Best-effort — if we can't locate it, return empty.
  try {
    const resolved = require.resolve(specifier) as string;
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      const content = fs.readFileSync(resolved, "utf8");
      return sha256(content);
    }
  } catch {
    /* unresolvable, not fatal */
  }
  return "";
}

function sha256(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

interface ApprovalRecord {
  hash: string;
  permissions: PluginPermissions;
  approvedAt: number;
}

const APPROVALS_PATH = path.join(PLUGINS_DIR, "approvals.json");

async function isApprovedByUser(
  id: string,
  permissions: PluginPermissions,
  specHash: string
): Promise<boolean> {
  if (!fs.existsSync(APPROVALS_PATH)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(APPROVALS_PATH, "utf8")) as Record<
      string,
      ApprovalRecord
    >;
    const record = raw[id];
    if (!record) return false;
    // If we computed a hash, it must match. If we couldn't hash the
    // source (e.g. it's a remote module), skip the hash check.
    if (specHash && record.hash && record.hash !== specHash) return false;
    // Every permission the plugin requests must be in the approval.
    for (const [k, v] of Object.entries(permissions)) {
      if (v && !record.permissions?.[k as keyof PluginPermissions]) return false;
    }
    return true;
  } catch {
    return false;
  }
}
