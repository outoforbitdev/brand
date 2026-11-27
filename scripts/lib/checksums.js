import { createHash } from "node:crypto";

/**
 * Compute the SHA-256 digest of some data.
 * @param {Buffer | string} data Bytes or text to hash.
 * @returns {string} Lowercase hex digest.
 */
export function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

/**
 * Reconcile freshly built static files against the stored checksums.
 *
 * Published static paths must never change or disappear, so:
 * - a new path is added to `next.files`, or is an error when `opts.check`;
 * - a changed hash is an error unless `opts.allowChange` and not `opts.check`,
 *   in which case it is rewritten;
 * - a stored path missing from `files` is always an error (`removed`).
 * When any hash changed and tool versions differ from the stored ones, the
 * error names a resvg or svgo upgrade as the likely cause.
 *
 * Pure: inputs are never mutated, and feeding `next` back as `stored` with the
 * same files and options yields no errors and an equal `next`.
 *
 * @param {{versions: object, files: Object<string, string>}} stored Contents
 *   of static-checksums.json.
 * @param {Map<string, Buffer>} files Built files keyed by path relative to
 *   dist/v1/static.
 * @param {{versions: object, check: boolean, allowChange: boolean}} opts
 *   Current tool versions and run mode (`check` never writes).
 * @returns {{next: {versions: object, files: Object<string, string>},
 *   errors: string[]}} The updated checksum data and any violations.
 */
export function reconcileChecksums(stored, files, opts) {
  const { versions, check, allowChange } = opts;
  const errors = [];
  const nextFiles = { ...stored.files };
  const changed = [];
  const rewrite = allowChange && !check;

  for (const [path, data] of files) {
    const hash = sha256(data);
    const old = stored.files[path];
    if (old === undefined) {
      if (check) {
        errors.push(`${path}: not in static-checksums.json`);
      } else {
        nextFiles[path] = hash;
      }
    } else if (old !== hash) {
      changed.push(path);
      if (rewrite) nextFiles[path] = hash;
    }
  }

  const versionsDiffer =
    JSON.stringify(sortKeys(versions)) !==
    JSON.stringify(sortKeys(stored.versions));
  const hint = versionsDiffer
    ? " (tool versions changed; a resvg or svgo upgrade is the likely cause)"
    : "";
  if (!rewrite) {
    for (const path of changed) {
      errors.push(`${path}: checksum changed${hint}`);
    }
  }

  for (const path of Object.keys(stored.files)) {
    if (!files.has(path)) {
      errors.push(
        `${path}: removed; published static paths must not be removed`,
      );
    }
  }

  return {
    next: {
      versions: check ? { ...stored.versions } : { ...versions },
      files: sortKeys(nextFiles),
    },
    errors,
  };
}

/**
 * Return a shallow copy of an object with keys in sorted order, so versions
 * compare independent of key order.
 * @param {object} obj Object to sort.
 * @returns {object} Copy with sorted keys.
 */
function sortKeys(obj) {
  return Object.fromEntries(Object.entries(obj ?? {}).sort());
}
