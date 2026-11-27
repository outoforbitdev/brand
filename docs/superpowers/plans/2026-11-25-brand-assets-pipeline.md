# Brand Assets Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a GitHub Pages site that serves versioned brand assets (SVG and PNG) from SVG sources, with immutable static assets and date-driven dynamic aliases.

**Architecture:** A Node build script reads `assets.json`, validates it, simplifies each source SVG with SVGO, renders PNGs with resvg, checks static outputs against committed hashes, and writes `dist/`. A GitHub Actions workflow builds and deploys `dist/` to Pages on push to `main`, daily, and on manual dispatch. Small single-purpose modules in `scripts/lib/` are unit tested with `node:test`.

**Tech Stack:** Node (ESM, pinned in `.nvmrc`), `@resvg/resvg-js`, `svgo`, `eslint`, `node:test`, `just`, GitHub Actions and Pages.

**Spec:** `docs/superpowers/specs/2026-11-24-brand-assets-pipeline-design.md`

## Global Constraints

- URL scheme: `/v1/<static|dynamic>/<asset>[-<W>x<H>].<ext>`. Flat, with no per-asset folder in the URL.
- Names are lowercase with underscores only. A hyphen appears only before the size. Size is omitted for SVG.
- Sizes are pixel dimensions, one integer per size, output is square (`WxW`).
- Sources must be square. The validator rejects non-square viewBoxes.
- Published paths are never renamed or removed. Static bytes never change once published.
- Dynamic windows are inclusive `MM-DD` ranges against the UTC date. Overlaps are an error. Wrap-around ranges are supported. `02-29` is a valid bound.
- Every variant of a dynamic alias, including the default, must have identical formats and sizes.
- Dependencies are exact-pinned and installed with `npm ci`. Node is pinned in `.nvmrc`.
- `just build` writes new hashes to `static-checksums.json`. CI runs `--check` and never writes. `--allow-static-change` is local only.
- PNGs are rendered with `@resvg/resvg-js`, SVGs simplified with `svgo` (keep `viewBox`, drop mm `width` and `height`, strip Inkscape and Sodipodi data).
- Safety check: original and simplified SVG rendered at 512px must match within a small per-channel tolerance.
- Generated output uses relative URLs. `dist/` is gitignored. `dist/.nojekyll` is emitted.
- Workflow permissions: `contents: read`, `pages: write`, `id-token: write`. Environment: `github-pages`.
- Commands run through `just`. Commits use conventional commits.

## Review Focus

- Source SVG with no `viewBox`: validation must report a clear error instead of crashing.
- Asset name with uppercase letters or a hyphen: rejected with the offending name in the message.
- Re-running the build on an unchanged repo: must be a no-op for checksums (idempotent).
- Stale files in `dist/` from a prior run: the build cleans `dist/` first.
- Window edges (`12-01`, `12-31`, `02-29`) and wrap-around (`12-15` to `01-05`): selected correctly.
- `--variant` forcing an unknown or non-static name: fails with a clear message.

---

### Task 1: Project scaffold and source move

**Files:**
- Create: `package.json`, `.nvmrc`, `.gitignore`, `Justfile`, `eslint.config.js`, `assets.json`, `static-checksums.json`
- Move: `src/ood_logo.svg` to `src/ood_logo/ood_logo.svg`

**Interfaces:**
- Produces: `just test` (runs `node --test`), `just lint` (runs eslint), `just build` (runs `node scripts/build.js`), `just build-check` (adds `--check`).

- [ ] **Step 1: Move the source** with `mkdir -p src/ood_logo && mv src/ood_logo.svg src/ood_logo/ood_logo.svg`.
- [ ] **Step 2: Create `package.json`** (`"type": "module"`, scripts `test` and `lint`) and install exact-pinned `@resvg/resvg-js`, `svgo`, `eslint` using `npm install --save-exact`. Pin Node in `.nvmrc` to the current LTS.
- [ ] **Step 3: Create `assets.json`** with one static asset: `name: "ood_logo"`, `source: "src/ood_logo/ood_logo.svg"`, `formats: ["svg","png"]`, `sizes: [16,24,32,64,128,256,512]`, and `"dynamic": []`. Create `static-checksums.json` as `{ "versions": {}, "files": {} }`.
- [ ] **Step 4: Create `.gitignore`** (`dist/`, `node_modules/`), a flat ESLint config, and the `Justfile` recipes listed above.
- [ ] **Step 5: Verify** with `just lint` and `just test`. Expected: lint passes, test reports no tests and exits 0 (add `--passWithNoTests` equivalent by placing a trivial `scripts/lib/smoke.test.js` asserting `true`).
- [ ] **Step 6: Commit** `chore: scaffold brand assets build`.

### Task 2: Naming rules and manifest validation

**Files:**
- Create: `scripts/lib/naming.js`, `scripts/lib/manifest.js`
- Test: `scripts/lib/naming.test.js`, `scripts/lib/manifest.test.js`

**Interfaces:**
- Produces:
  - `isValidAssetName(name: string): boolean` (regex `^[a-z0-9]+(_[a-z0-9]+)*$`).
  - `outputFileName(name: string, ext: 'svg'|'png', size?: number): string` returns `ood_logo-24x24.png` or `ood_logo.svg`.
  - `validateManifest(manifest: object, rootDir: string): string[]` returns a list of error messages, empty when valid.
  - `readViewBox(svg: string): {width: number, height: number} | null`.

- [ ] **Step 1: Write failing naming tests.** `isValidAssetName('ood_logo')` is true. `'Ood_logo'`, `'ood-logo'`, `'ood__logo'` and `''` are false. `outputFileName('ood_logo','png',24) === 'ood_logo-24x24.png'` and `outputFileName('ood_logo','svg') === 'ood_logo.svg'`.
- [ ] **Step 2: Write failing manifest tests** using temp directories for sources. Each case expects an error message containing the stated text: bad name (the name), missing source (the path), duplicate asset names, duplicate output paths, non-square viewBox (`square`), missing viewBox (`viewBox`), size not a positive integer, dynamic default or variant not a static asset, dynamic variants with different formats or sizes than the default (`identical`), overlapping windows (`overlap`). A valid manifest returns `[]`.
- [ ] **Step 3: Run tests, expect FAIL** with `just test`.
- [ ] **Step 4: Implement** both modules. Collect all errors rather than stopping at the first. Window overlap uses the same day-set logic as Task 3, so export the window helper from here only if Task 3 is not done yet, otherwise import it.
- [ ] **Step 5: Run tests, expect PASS.**
- [ ] **Step 6: Commit** `feat: validate manifest and naming rules`.

### Task 3: Seasonal variant selection

**Files:**
- Create: `scripts/lib/schedule.js`
- Test: `scripts/lib/schedule.test.js`

**Interfaces:**
- Produces:
  - `monthDayUtc(date: Date): string` returns `'MM-DD'` in UTC.
  - `inWindow(monthDay: string, from: string, to: string): boolean` inclusive, with wrap-around when `from > to`.
  - `windowsOverlap(a: {from,to}, b: {from,to}): boolean`.
  - `pickVariant(alias: {default: string, schedule: {variant,from,to}[]}, monthDay: string): string`.
- Consumed by: Task 2 (overlap check) and Task 7.

- [ ] **Step 1: Write failing tests.** `inWindow('12-01','12-01','12-31')` and `'12-31'` are true, `'11-30'` and `'01-01'` are false. Wrap-around `('12-20','12-15','01-05')` and `('01-05',...)` are true, `('01-06',...)` false. `inWindow('02-29','02-01','03-01')` is true. `monthDayUtc(new Date('2026-12-31T23:59:59Z')) === '12-31'` and `new Date('2026-12-31T23:59:59-05:00')` yields `'01-01'`. `pickVariant` returns the default outside any window. `windowsOverlap` is true for `12-01..12-31` vs `12-31..01-05` and false for `12-01..12-10` vs `12-11..12-31`.
- [ ] **Step 2: Run tests, expect FAIL.**
- [ ] **Step 3: Implement.** Compare `MM-DD` strings lexically. Overlap is detected by checking whether either window contains the other's `from`.
- [ ] **Step 4: Run tests, expect PASS.**
- [ ] **Step 5: Commit** `feat: select seasonal variant by UTC date`.

### Task 4: SVG simplification and safety check

**Files:**
- Create: `scripts/svgo.config.js`, `scripts/lib/svg.js`
- Test: `scripts/lib/svg.test.js`, fixture `scripts/lib/fixtures/inkscape.svg` (a trimmed Inkscape file with `sodipodi:namedview`, `inkscape:` attributes, a comment, and mm `width`/`height`)

**Interfaces:**
- Produces:
  - `simplifySvg(svg: string): string`.
  - `assertVisuallyEqual(original: string, simplified: string, opts?: {size?: number, tolerance?: number}): void` throws `Error` naming the first differing pixel. Defaults: size 512, tolerance 2 per channel.
- Consumes: `renderPng` from Task 5 is not used. This module decodes via `Resvg#render().pixels` directly.

- [ ] **Step 1: Write failing tests.** Simplified output contains no `inkscape`, `sodipodi` or `<!--`, keeps `viewBox`, has no `width="` on the root element, and is smaller than the input. A plain SVG passes through with its `viewBox` intact. `assertVisuallyEqual(fixture, simplifySvg(fixture))` does not throw. It throws for two SVGs that differ in fill colour.
- [ ] **Step 2: Run tests, expect FAIL.**
- [ ] **Step 3: Implement** `svgo.config.js` using `preset-default` with `removeViewBox` disabled, `removeDimensions` enabled, and `removeEditorsNSData` on. Implement the two functions in `svg.js`.
- [ ] **Step 4: Run tests, expect PASS.**
- [ ] **Step 5: Commit** `feat: simplify svg output with svgo`.

### Task 5: PNG rendering

**Files:**
- Create: `scripts/lib/png.js`
- Test: `scripts/lib/png.test.js`

**Interfaces:**
- Produces: `renderPng(svg: string, size: number): Buffer` renders at an exact pixel width and returns PNG bytes.

- [ ] **Step 1: Write failing tests.** Output starts with the PNG signature `89 50 4E 47`. IHDR width and height both equal `size` for sizes 16 and 512. Two calls with the same input return identical bytes.
- [ ] **Step 2: Run tests, expect FAIL.**
- [ ] **Step 3: Implement** with `Resvg` using `fitTo: { mode: 'width', value: size }`.
- [ ] **Step 4: Run tests, expect PASS.**
- [ ] **Step 5: Commit** `feat: render png sizes with resvg`.

### Task 6: Static checksum check

**Files:**
- Create: `scripts/lib/checksums.js`
- Test: `scripts/lib/checksums.test.js`

**Interfaces:**
- Produces:
  - `sha256(data: Buffer | string): string`.
  - `reconcileChecksums(stored: {versions: object, files: object}, files: Map<string, Buffer>, opts: {versions: object, check: boolean, allowChange: boolean}): {next: object, errors: string[]}`.
- Behaviour: a new path is added to `next.files` unless `check` is true, in which case it is an error (`not in static-checksums.json`). A changed hash is an error unless `allowChange` is true and `check` is false, in which case it is rewritten. If any hash changed and `versions` differ from stored, the error message includes `resvg` or `svgo` upgrade as the likely cause. A stored path missing from `files` is an error (`removed`). Unchanged input returns `next` deeply equal to `stored`.

- [ ] **Step 1: Write failing tests** for each behaviour above, including idempotence (second reconcile with `next` as stored yields no errors and no change).
- [ ] **Step 2: Run tests, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests, expect PASS.**
- [ ] **Step 5: Commit** `feat: enforce static asset immutability`.

### Task 7: Build orchestration and site output

**Files:**
- Create: `scripts/build.js`, `scripts/lib/site.js`
- Test: `scripts/build.test.js` (end to end on a fixture repo in a temp directory)

**Interfaces:**
- Consumes: Tasks 2 to 6.
- Produces:
  - `build(opts: {rootDir: string, outDir?: string, date?: Date, variant?: string, check?: boolean, allowStaticChange?: boolean}): Promise<{paths: string[]}>`.
  - `renderIndexHtml(paths: string[]): string` and `renderPathsManifest(paths: string[]): string` in `site.js`, using relative URLs.
  - CLI: `node scripts/build.js [--check] [--allow-static-change] [--date YYYY-MM-DD] [--variant NAME]`.

- [ ] **Step 1: Write the failing end to end test** with a fixture manifest holding two static assets and one dynamic alias, then assert: `dist/v1/static/` has the expected `.svg` and `-WxW.png` files, `dist/v1/dynamic/` follows the chosen variant (default on a date outside the window, variant inside it, and when `variant` is passed), `dist/v1/manifest.json` lists every published path, `dist/index.html` references each path, `dist/.nojekyll` exists, a stale file placed in `dist/` beforehand is gone, a second build leaves `static-checksums.json` unchanged, `check: true` with a new asset rejects, and an unknown `variant` rejects with its name in the message.
- [ ] **Step 2: Run tests, expect FAIL.**
- [ ] **Step 3: Implement** the sequence from the spec: validate, clean `dist/`, write static outputs (simplify, safety check, render), resolve and copy dynamic outputs, reconcile checksums, write them unless `check`, emit manifest, index and `.nojekyll`. The CLI exits non-zero printing every error.
- [ ] **Step 4: Run tests, expect PASS.**
- [ ] **Step 5: Run the real build** with `just build`. Expected: `dist/v1/static/ood_logo.svg` and seven PNGs exist, and `static-checksums.json` now lists them. Run `just build-check`. Expected: exit 0.
- [ ] **Step 6: Commit** `feat: build static and dynamic assets` including `static-checksums.json`.

### Task 8: Workflows

**Files:**
- Create: `.github/workflows/deploy.yml`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `just build-check`, `just test`, `just lint`.

- [ ] **Step 1: Write `ci.yml`.** Runs on pull requests. Installs with `npm ci`, runs lint, tests and `just build-check`. Permissions `contents: read`.
- [ ] **Step 2: Write `deploy.yml`.** Triggers: push to `main`, daily `schedule`, `workflow_dispatch` with optional `variant` input. Steps: checkout, `actions/setup-node` using `.nvmrc`, `npm ci`, install `just`, lint and test, run the build in check mode (passing `--variant` when provided), `actions/configure-pages`, `actions/upload-pages-artifact` with path `dist`, `actions/deploy-pages`. Permissions and environment per Global Constraints. Add a keepalive step on the schedule trigger that makes the repo count as active.
- [ ] **Step 3: Verify** with `actionlint` if available, otherwise by reading the YAML against the Global Constraints.
- [ ] **Step 4: Commit** `ci: add pull request checks and pages deploy`.

### Task 9: README

**Files:**
- Create or modify: `README.md`

- [ ] **Step 1: Write the README** covering the URL scheme and naming rules, how to add an asset (SVG plus manifest entry, run `just build`, commit `static-checksums.json`), how to add a seasonal variant, how to consume assets (copy or fetch by URL), the immutability rule and the override flag, the `v1` stability note, the 10 minute Pages cache, branch protection with required PR checks, and the manual Pages and DNS steps.
- [ ] **Step 2: Verify** that every command in the README runs as written.
- [ ] **Step 3: Commit** `docs: document url scheme and usage`.

### Task 10: Live verification (needs the owner)

- [ ] **Step 1:** The owner enables Pages with source GitHub Actions and adds the DNS CNAME and custom domain with HTTPS enforced.
- [ ] **Step 2:** After deploy, confirm `/v1/static/ood_logo-24x24.png` returns `image/png`, and `/v1/static/ood_logo.svg` returns `image/svg+xml`.
- [ ] **Step 3:** Once a seasonal variant exists, run the workflow manually with a forced variant and confirm the dynamic URL serves it. Confirm that editing a static file fails the PR check.

---

## Self-review

- **Spec coverage:** URL scheme, naming, manifest rules, SVGO and resvg, safety check, checksum flow, dynamic selection with UTC, manifest/index/`.nojekyll`, workflows, keepalive, README and manual steps are each owned by a task. `.ico` is out of scope (issue #2).
- **Types:** `renderPng`, `simplifySvg`, `reconcileChecksums`, `pickVariant` and `validateManifest` are named identically where consumed.
- **Review Focus:** each line is pinned in Tasks 2, 3 and 7.
