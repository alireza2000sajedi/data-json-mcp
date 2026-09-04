import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface Config {
  /** Directory holding the Source of Truth files (schemas, README, prompt). */
  datasetDir: string;
  /** Directory where output/{provinceId} datasets are written. */
  outputDir: string;
  /** Directory holding the administrative checklist input/1.json … input/31.json. */
  inputDir: string;
  taxonomyDir: string;
}

function resolveFromEnv(): Config {
  // Compiled output is dist/*.js, so the package root is one level up.
  const repoRoot = path.resolve(__dirname, "..");
  return {
    datasetDir: path.resolve(process.env.PLANRO_DATASET_DIR ?? path.join(repoRoot, "dataset")),
    outputDir: path.resolve(process.env.PLANRO_OUTPUT_DIR ?? path.join(repoRoot, "output")),
    inputDir: path.resolve(process.env.PLANRO_INPUT_DIR ?? path.join(repoRoot, "input")),
    taxonomyDir: path.resolve(process.env.PLANRO_TAXONOMY_DIR ?? path.join(repoRoot, "taxonomy")),
  };
}

export const config: Config = resolveFromEnv();

/**
 * Resolve `segments` under `base` and assert the result stays inside `base`.
 * Blocks `..`, absolute escapes and symlink tricks (lexically).
 */
export function safeJoin(base: string, segments: string[]): string {
  const resolved = path.resolve(base, ...segments);
  const baseResolved = path.resolve(base);
  if (resolved !== baseResolved && !resolved.startsWith(baseResolved + path.sep)) {
    throw new Error(`Path traversal blocked: ${segments.join("/")}`);
  }
  return resolved;
}

/**
 * Validate a single path segment (an id, slug, or file name) so that no tool
 * can smuggle `/`, `\`, `..`, or NUL into a filesystem path.
 */
export function assertSafeSegment(segment: string, label = "segment"): string {
  if (typeof segment !== "string" || segment.length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  if (segment.includes("/") || segment.includes("\\") || segment.includes("\0")) {
    throw new Error(`${label} contains invalid path characters`);
  }
  if (segment === "." || segment === "..") {
    throw new Error(`${label} must not be "." or ".."`);
  }
  return segment;
}

/** A province id looks like `province-30`; allow it (and reject obvious junk). */
export function assertProvinceId(provinceId: string): string {
  const raw = assertSafeSegment(provinceId, "provinceId").trim();
  const numeric = /^\d{1,2}$/.test(raw) ? Number(raw) : null;
  const canonical = numeric !== null ? `province-${numeric}` : raw;
  const m = /^province-(\d+)$/.exec(canonical);
  if (!m) throw new Error(`Invalid provinceId '${raw}'. Use a numeric province id (1..31) or province-{n}.`);
  const n = Number(m[1]);
  if (n < 1 || n > 31) throw new Error(`provinceId '${raw}' is out of range (1..31).`);
  return canonical;
}

export function assertNodeId(nodeId: string): string {
  return assertSafeSegment(nodeId, "nodeId");
}

export function assertEntityId(entityId: string): string {
  return assertSafeSegment(entityId, "entityId");
}
