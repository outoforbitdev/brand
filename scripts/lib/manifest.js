/**
 * Manifest validation. Collects every problem rather than stopping at the
 * first so authors can fix them in one pass.
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { isValidAssetName } from './naming.js';
import { windowsOverlap } from './schedule.js';

const FORMATS = ['svg', 'png'];
const SQUARE_TOLERANCE = 0.01;
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * Read the viewBox dimensions of an SVG document.
 * @param {string} svg SVG source text.
 * @returns {{width: number, height: number} | null} Null when absent or malformed.
 */
export function readViewBox(svg) {
  const match = /<svg\b[^>]*?\sviewBox\s*=\s*["']([^"']*)["']/i.exec(svg);
  if (!match) return null;
  const parts = match[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  return { width: parts[2], height: parts[3] };
}

/**
 * Whether a string is a real 'MM-DD' date (02-29 allowed).
 * @param {unknown} value
 * @returns {boolean}
 */
function isMonthDay(value) {
  if (typeof value !== 'string' || !/^\d{2}-\d{2}$/.test(value)) return false;
  const month = Number(value.slice(0, 2));
  const day = Number(value.slice(3));
  return month >= 1 && month <= 12 && day >= 1 && day <= DAYS_IN_MONTH[month - 1];
}

/**
 * Validate an asset's `formats` and `sizes` shape.
 * @param {object} asset
 * @param {string} label Error message prefix naming the asset.
 * @param {string[]} errors Collected errors, appended to.
 */
function checkFormatsAndSizes(asset, label, errors) {
  const { formats, sizes } = asset;
  if (!Array.isArray(formats) || formats.length === 0) {
    errors.push(`${label}: formats ${JSON.stringify(formats)} must be a non-empty array`);
  } else {
    for (const format of formats) {
      if (!FORMATS.includes(format)) {
        errors.push(
          `${label}: format ${JSON.stringify(format)} must be exactly "svg" or "png"`,
        );
      }
    }
    if (new Set(formats).size !== formats.length) {
      errors.push(`${label}: duplicate format in ${JSON.stringify(formats)}`);
    }
  }
  const wantsPng = Array.isArray(formats) && formats.includes('png');
  if (sizes !== undefined && !Array.isArray(sizes)) {
    errors.push(`${label}: sizes ${JSON.stringify(sizes)} must be an array`);
    return;
  }
  if (wantsPng && (sizes ?? []).length === 0) {
    errors.push(`${label}: sizes must be a non-empty array when png is listed`);
  }
  for (const size of sizes ?? []) {
    if (!Number.isInteger(size) || size <= 0) {
      errors.push(`${label}: size ${JSON.stringify(size)} must be a positive integer`);
    }
  }
}

/**
 * Validate one static asset, appending problems to `errors`.
 * @param {object} asset
 * @param {string} rootDir
 * @param {string[]} errors
 */
function checkAsset(asset, rootDir, errors) {
  const label = `asset "${asset.name}"`;
  if (!isValidAssetName(asset.name)) {
    errors.push(`${label}: invalid name "${asset.name}", use lowercase snake_case`);
  }
  checkFormatsAndSizes(asset, label, errors);
  const source = asset.source;
  if (typeof source !== 'string' || !source.endsWith('.svg')) {
    errors.push(`${label}: source ${JSON.stringify(source)} must be a string ending in .svg`);
    return;
  }
  const path = resolve(rootDir, source);
  if (!path.startsWith(resolve(rootDir, 'src') + sep)) {
    errors.push(`${label}: source ${source} must resolve inside src/`);
    return;
  }
  if (!existsSync(path)) {
    errors.push(`${label}: missing source ${source}`);
    return;
  }
  if (!statSync(path).isFile()) {
    errors.push(`${label}: source ${source} is not a file`);
    return;
  }
  const box = readViewBox(readFileSync(path, 'utf8'));
  if (!box) {
    errors.push(`${label}: source ${asset.source} has no valid viewBox`);
  } else if (!(box.width > 0 && box.height > 0)) {
    errors.push(`${label}: viewBox ${box.width}x${box.height} must have positive width and height`);
  } else if (Math.abs(box.width - box.height) > SQUARE_TOLERANCE) {
    errors.push(
      `${label}: viewBox ${box.width}x${box.height} is not square (${asset.source})`,
    );
  }
}

/**
 * Whether two lists hold the same values regardless of order.
 * @param {unknown[]} a
 * @param {unknown[]} b
 * @returns {boolean}
 */
function sameSet(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  return a.length === b.length && [...a].sort().join() === [...b].sort().join();
}

/**
 * Validate one dynamic alias, appending problems to `errors`.
 * @param {object} alias
 * @param {Map<string, object>} statics Static assets by name.
 * @param {string[]} errors
 */
function checkDynamic(alias, statics, errors) {
  const label = `dynamic "${alias.name}"`;
  if (!isValidAssetName(alias.name)) {
    errors.push(`${label}: invalid name "${alias.name}", use lowercase snake_case`);
  }
  const base = statics.get(alias.default);
  if (!base) errors.push(`${label}: default "${alias.default}" is not a static asset`);
  const schedule = alias.schedule ?? [];
  for (const w of schedule) {
    const variant = statics.get(w.variant);
    if (!variant) {
      errors.push(`${label}: variant "${w.variant}" is not a static asset`);
    } else if (
      base &&
      !(sameSet(variant.formats, base.formats) && sameSet(variant.sizes ?? [], base.sizes ?? []))
    ) {
      errors.push(
        `${label}: variant "${w.variant}" must have formats and sizes identical to default "${alias.default}"`,
      );
    }
    for (const key of ['from', 'to']) {
      if (!isMonthDay(w[key])) {
        errors.push(`${label}: window ${key} "${w[key]}" is not a valid MM-DD date`);
      }
    }
  }
  const valid = schedule.filter((w) => isMonthDay(w.from) && isMonthDay(w.to));
  for (let i = 0; i < valid.length; i++) {
    for (let j = i + 1; j < valid.length; j++) {
      if (windowsOverlap(valid[i], valid[j])) {
        errors.push(
          `${label}: windows ${valid[i].from}..${valid[i].to} and ${valid[j].from}..${valid[j].to} overlap`,
        );
      }
    }
  }
}

/**
 * Validate a brand manifest.
 * @param {{assets?: object[], dynamic?: object[]}} manifest
 * @param {string} rootDir Directory that asset sources resolve against.
 * @returns {string[]} Error messages; empty when the manifest is valid.
 */
export function validateManifest(manifest, rootDir) {
  const errors = [];
  const assets = manifest.assets ?? [];
  const dynamic = manifest.dynamic ?? [];
  const statics = new Map();
  // Duplicate names are the only way to produce duplicate output paths:
  // valid names contain no hyphen, so outputFileName is injective over
  // distinct valid names. Statics (v1/static) and dynamics (v1/dynamic) are
  // separate namespaces, so each is checked on its own and a separate
  // output-path check would be unreachable.
  const staticCounts = new Map();
  for (const asset of assets) {
    staticCounts.set(asset.name, (staticCounts.get(asset.name) ?? 0) + 1);
    if (staticCounts.get(asset.name) === 2) {
      errors.push(`duplicate asset name "${asset.name}"`);
    }
    statics.set(asset.name, asset);
    checkAsset(asset, rootDir, errors);
  }
  const dynamicCounts = new Map();
  for (const alias of dynamic) {
    dynamicCounts.set(alias.name, (dynamicCounts.get(alias.name) ?? 0) + 1);
    if (dynamicCounts.get(alias.name) === 2) {
      errors.push(`duplicate dynamic name "${alias.name}"`);
    }
    checkDynamic(alias, statics, errors);
  }
  return errors;
}
