/**
 * Manifest validation. Collects every problem rather than stopping at the
 * first so authors can fix them in one pass.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isValidAssetName, outputFileName } from './naming.js';
import { windowsOverlap } from './schedule.js';

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
  for (const size of asset.sizes ?? []) {
    if (!Number.isInteger(size) || size <= 0) {
      errors.push(`${label}: size ${JSON.stringify(size)} must be a positive integer`);
    }
  }
  const path = join(rootDir, asset.source ?? '');
  if (!asset.source || !existsSync(path)) {
    errors.push(`${label}: missing source ${asset.source}`);
    return;
  }
  const box = readViewBox(readFileSync(path, 'utf8'));
  if (!box) {
    errors.push(`${label}: source ${asset.source} has no valid viewBox`);
  } else if (Math.abs(box.width - box.height) > SQUARE_TOLERANCE) {
    errors.push(
      `${label}: viewBox ${box.width}x${box.height} is not square (${asset.source})`,
    );
  }
}

/**
 * Output file names an entry produces.
 * @param {string} name
 * @param {{formats?: string[], sizes?: number[]}} spec
 * @returns {string[]}
 */
function outputsOf(name, spec) {
  const out = [];
  for (const fmt of spec.formats ?? []) {
    if (fmt === 'svg') out.push(outputFileName(name, 'svg'));
    else for (const s of spec.sizes ?? []) out.push(outputFileName(name, fmt, s));
  }
  return out;
}

/**
 * Whether two lists hold the same values regardless of order.
 * @param {unknown[]} a
 * @param {unknown[]} b
 * @returns {boolean}
 */
function sameSet(a = [], b = []) {
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
      !(sameSet(variant.formats, base.formats) && sameSet(variant.sizes, base.sizes))
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
  const seenNames = new Set();
  for (const asset of assets) {
    if (seenNames.has(asset.name)) {
      errors.push(`duplicate asset name "${asset.name}"`);
    }
    seenNames.add(asset.name);
    statics.set(asset.name, asset);
    checkAsset(asset, rootDir, errors);
  }
  for (const alias of dynamic) checkDynamic(alias, statics, errors);

  const seenOutputs = new Set();
  const entries = [
    ...assets.map((a) => [a.name, a]),
    ...dynamic.map((d) => [d.name, statics.get(d.default) ?? {}]),
  ];
  for (const [name, spec] of entries) {
    for (const file of outputsOf(name, spec)) {
      if (seenOutputs.has(file)) errors.push(`duplicate output path ${file}`);
      seenOutputs.add(file);
    }
  }
  return errors;
}
