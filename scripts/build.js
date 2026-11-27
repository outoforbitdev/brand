/**
 * Brand asset build: validates the manifest, writes static and dynamic
 * outputs to `dist/`, enforces static immutability and emits the site files.
 */
import { copyFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { reconcileChecksums } from './lib/checksums.js';
import { validateManifest } from './lib/manifest.js';
import { outputFileName } from './lib/naming.js';
import { pngDimensions, renderPng } from './lib/png.js';
import { monthDayUtc, pickVariant } from './lib/schedule.js';
import { renderIndexHtml, renderPathsManifest } from './lib/site.js';
import { assertVisuallyEqual, simplifySvg } from './lib/svg.js';

const STATIC_DIR = 'v1/static';
const DYNAMIC_DIR = 'v1/dynamic';
const require = createRequire(import.meta.url);

/**
 * Read an installed package's version from its package.json.
 * @param {string} name Package name.
 * @returns {string}
 */
function installedVersion(name) {
  let dir = dirname(require.resolve(name));
  for (;;) {
    try {
      const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
      if (pkg.name === name) return pkg.version;
    } catch {
      // No package.json at this level, keep walking up.
    }
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`cannot find package.json for ${name}`);
    dir = parent;
  }
}

/**
 * Read a JSON file, or return a fallback when it does not exist.
 * @param {string} path
 * @param {unknown} [fallback]
 * @returns {any}
 */
function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw error;
  }
}

/**
 * Stable JSON text: 2-space indent and a trailing newline.
 * @param {unknown} value
 * @returns {string}
 */
const stableJson = (value) => `${JSON.stringify(value, null, 2)}\n`;

/**
 * Write a file, creating its directory.
 * @param {string} path
 * @param {Buffer | string} data
 */
function writeOut(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
}

/**
 * Resolve which static variant each dynamic alias publishes.
 * @param {object[]} dynamic Manifest dynamic aliases.
 * @param {Set<string>} staticNames Names of static assets.
 * @param {string} monthDay Today as MM-DD (UTC).
 * @param {string} [variant] Forced variant name.
 * @returns {Map<object, string>} Alias to chosen static asset name.
 * @throws {Error} When `variant` is unknown or applies to no alias.
 */
function chooseVariants(dynamic, staticNames, monthDay, variant) {
  if (variant !== undefined && !staticNames.has(variant)) {
    throw new Error(`variant "${variant}" is not a static asset in the manifest`);
  }
  const chosen = new Map();
  let applied = false;
  for (const alias of dynamic) {
    const listed =
      alias.default === variant ||
      (alias.schedule ?? []).some((w) => w.variant === variant);
    if (variant !== undefined && listed) {
      chosen.set(alias, variant);
      applied = true;
    } else {
      chosen.set(alias, pickVariant(alias, monthDay));
    }
  }
  if (variant !== undefined && !applied) {
    throw new Error(`variant "${variant}" is not used by any dynamic alias`);
  }
  return chosen;
}

/**
 * Check that every variant of each alias publishes the same file names as its
 * default, so alias URLs never change with the date. Sizes are widths, so
 * variants with different aspect ratios would produce different heights.
 * @param {object[]} dynamic Manifest dynamic aliases.
 * @param {Map<string, {name: string}[]>} outputs Outputs per static asset.
 * @returns {string[]} Error messages; empty when every alias is consistent.
 */
function checkAliasFileNames(dynamic, outputs) {
  /** File names with the asset name removed, e.g. `-24x12.png`. */
  const suffixes = (asset) =>
    outputs.get(asset).map((o) => o.name.slice(asset.length)).sort().join(', ');
  const errors = [];
  for (const alias of dynamic) {
    const expected = suffixes(alias.default);
    for (const { variant } of alias.schedule ?? []) {
      if (suffixes(variant) !== expected) {
        errors.push(
          `dynamic "${alias.name}": variant "${variant}" publishes ${suffixes(variant)} but default "${alias.default}" publishes ${expected}; variants need the same aspect ratio`,
        );
      }
    }
  }
  return errors;
}

/**
 * Build all brand assets.
 *
 * @param {object} opts
 * @param {string} opts.rootDir Repo root holding assets.json and sources.
 * @param {string} [opts.outDir] Output directory (default `<rootDir>/dist`).
 * @param {Date} [opts.date] Date used for scheduling (default now, UTC).
 * @param {string} [opts.variant] Force dynamic aliases to this static variant.
 * @param {boolean} [opts.check] Never write static-checksums.json.
 * @param {boolean} [opts.allowStaticChange] Permit changed static hashes.
 * @returns {Promise<{paths: string[]}>} Published paths, sorted, relative to
 *   the output directory.
 * @throws {Error} Whose message holds every problem, one per line.
 */
export async function build(opts) {
  const { rootDir, date, variant, check = false, allowStaticChange = false } = opts;
  const outDir = opts.outDir ?? join(rootDir, 'dist');
  const manifest = readJson(join(rootDir, 'assets.json'));

  const problems = validateManifest(manifest, rootDir);
  if (problems.length) throw new Error(problems.join('\n'));
  const assets = manifest.assets ?? [];
  const dynamic = manifest.dynamic ?? [];
  const chosen = chooseVariants(
    dynamic,
    new Set(assets.map((a) => a.name)),
    monthDayUtc(date ?? new Date()),
    variant,
  );

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  /** @type {Map<string, Buffer>} Static files keyed relative to v1/static. */
  const files = new Map();
  /** @type {Map<string, {name: string, ext: string, dimensions?: object}[]>} */
  const outputs = new Map();
  for (const asset of assets) {
    const source = readFileSync(join(rootDir, asset.source), 'utf8');
    const simple = simplifySvg(source);
    assertVisuallyEqual(source, simple);
    const produced = [];
    const add = (ext, data, dimensions) => {
      const name = outputFileName(asset.name, ext, dimensions);
      files.set(name, data);
      produced.push({ name, ext, dimensions });
    };
    for (const ext of asset.formats) {
      if (ext === 'svg') {
        add(ext, Buffer.from(simple));
      } else {
        for (const width of asset.sizes) {
          const png = renderPng(simple, width);
          add(ext, png, pngDimensions(png));
        }
      }
    }
    outputs.set(asset.name, produced);
  }
  const aliasErrors = checkAliasFileNames(dynamic, outputs);
  if (aliasErrors.length) throw new Error(aliasErrors.join('\n'));
  for (const [name, data] of files) writeOut(join(outDir, STATIC_DIR, name), data);

  const paths = [...files.keys()].map((n) => `${STATIC_DIR}/${n}`);
  for (const alias of dynamic) {
    for (const { name, ext, dimensions } of outputs.get(chosen.get(alias))) {
      const to = outputFileName(alias.name, ext, dimensions);
      mkdirSync(join(outDir, DYNAMIC_DIR), { recursive: true });
      copyFileSync(join(outDir, STATIC_DIR, name), join(outDir, DYNAMIC_DIR, to));
      paths.push(`${DYNAMIC_DIR}/${to}`);
    }
  }

  const checksumPath = join(rootDir, 'static-checksums.json');
  const stored = readJson(checksumPath, { versions: {}, files: {} });
  const { next, errors } = reconcileChecksums(stored, files, {
    versions: { resvg: installedVersion('@resvg/resvg-js'), svgo: installedVersion('svgo') },
    check,
    allowChange: allowStaticChange,
  });
  if (errors.length) throw new Error(errors.join('\n'));
  if (!check && stableJson(next) !== stableJson(stored)) {
    writeFileSync(checksumPath, stableJson(next));
  }

  paths.sort();
  writeOut(join(outDir, 'v1/manifest.json'), renderPathsManifest(paths));
  writeOut(join(outDir, 'index.html'), renderIndexHtml(paths));
  writeOut(join(outDir, '.nojekyll'), '');
  return { paths };
}

/**
 * Whether a YYYY-MM-DD string is a real calendar date (rejects 2026-02-30).
 * @param {string} value
 * @returns {boolean}
 */
function isRealDate(value) {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Parse CLI arguments.
 * @param {string[]} argv Arguments after the script name.
 * @returns {object} Options for {@link build}, minus rootDir.
 * @throws {Error} On unknown or malformed arguments.
 */
export function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--check') opts.check = true;
    else if (arg === '--allow-static-change') opts.allowStaticChange = true;
    else if (arg === '--date' || arg === '--variant') {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} requires a value`);
      if (arg === '--variant') opts.variant = value;
      else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !isRealDate(value)) {
          throw new Error(`--date must be YYYY-MM-DD, got "${value}"`);
        }
        opts.date = new Date(`${value}T00:00:00Z`);
      }
    } else throw new Error(`unknown argument "${arg}"`);
  }
  return opts;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const rootDir = fileURLToPath(new URL('..', import.meta.url));
    const { paths } = await build({ rootDir, ...parseArgs(process.argv.slice(2)) });
    console.log(`Built ${paths.length} files into dist/.`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
