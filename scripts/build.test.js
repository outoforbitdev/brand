import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from './build.js';
import { renderIndexHtml, renderPathsManifest } from './lib/site.js';

const LOGO = new URL('../src/ood_logo/ood_logo.svg', import.meta.url);

/** Manifest used by the fixture repo. */
const MANIFEST = {
  assets: [
    { name: 'ood_logo', source: 'src/a.svg', formats: ['svg', 'png'], sizes: [16, 24] },
    { name: 'ood_logo_christmas', source: 'src/b.svg', formats: ['svg', 'png'], sizes: [16, 24] },
    { name: 'ood_logo_small', source: 'src/a.svg', formats: ['svg', 'png'], sizes: [16] },
  ],
  dynamic: [
    {
      name: 'ood_logo_seasonal',
      default: 'ood_logo',
      schedule: [{ variant: 'ood_logo_christmas', from: '12-01', to: '12-31' }],
    },
  ],
};

/**
 * Create a fixture repo in a temp directory.
 * @param {object} [manifest] Manifest to write.
 * @returns {string} Root directory.
 */
function fixture(manifest = MANIFEST) {
  const root = mkdtempSync(join(tmpdir(), 'brand-build-'));
  mkdirSync(join(root, 'src'));
  cpSync(LOGO, join(root, 'src/a.svg'));
  cpSync(LOGO, join(root, 'src/b.svg'));
  writeFileSync(join(root, 'assets.json'), JSON.stringify(manifest));
  writeFileSync(join(root, 'static-checksums.json'), '{ "versions": {}, "files": {} }');
  return root;
}

const read = (root, p) => readFileSync(join(root, 'dist', p));
const list = (root, p) => readdirSync(join(root, 'dist', p)).sort();
const summer = new Date('2026-06-15T12:00:00Z');
const winter = new Date('2026-12-15T12:00:00Z');

test('site: index and manifest use relative paths', () => {
  const paths = ['v1/static/a.svg', 'v1/static/a-16x16.png'];
  const html = renderIndexHtml(paths);
  for (const p of paths) assert.ok(html.includes(`"${p}"`));
  assert.ok(!html.includes('href="/') && !html.includes('src="/'));
  assert.deepEqual(JSON.parse(renderPathsManifest(paths)), { paths });
});

test('build writes static outputs, manifest, index and .nojekyll', async () => {
  const root = fixture();
  mkdirSync(join(root, 'dist'));
  writeFileSync(join(root, 'dist/stale.txt'), 'old');
  const { paths } = await build({ rootDir: root, date: summer });
  assert.ok(!existsSync(join(root, 'dist/stale.txt')));
  assert.deepEqual(
    list(root, 'v1/static').filter((f) => f.startsWith('ood_logo-') || f === 'ood_logo.svg'),
    ['ood_logo-16x16.png', 'ood_logo-24x24.png', 'ood_logo.svg'],
  );
  assert.ok(existsSync(join(root, 'dist/v1/static/ood_logo_christmas-24x24.png')));
  assert.ok(existsSync(join(root, 'dist/v1/static/ood_logo_small-16x16.png')));
  assert.ok(!existsSync(join(root, 'dist/v1/static/ood_logo_small-24x24.png')));
  assert.ok(existsSync(join(root, 'dist/.nojekyll')));
  const listed = JSON.parse(read(root, 'v1/manifest.json')).paths;
  assert.deepEqual(listed, [...listed].sort());
  assert.deepEqual(listed, paths);
  assert.ok(paths.includes('v1/static/ood_logo.svg'));
  assert.ok(paths.includes('v1/dynamic/ood_logo_seasonal-24x24.png'));
  const html = read(root, 'index.html').toString();
  for (const p of paths) assert.ok(html.includes(p), p);
  const sums = JSON.parse(readFileSync(join(root, 'static-checksums.json'), 'utf8'));
  assert.ok(sums.files['ood_logo.svg']);
  assert.ok(sums.versions.resvg && sums.versions.svgo);
});

test('dynamic follows date window and variant option', async () => {
  const root = fixture();
  const same = (alias, name) =>
    assert.deepEqual(
      read(root, `v1/dynamic/${alias}`),
      read(root, `v1/static/${name}`),
    );
  await build({ rootDir: root, date: summer });
  assert.deepEqual(list(root, 'v1/dynamic'), [
    'ood_logo_seasonal-16x16.png',
    'ood_logo_seasonal-24x24.png',
    'ood_logo_seasonal.svg',
  ]);
  same('ood_logo_seasonal.svg', 'ood_logo.svg');
  same('ood_logo_seasonal-24x24.png', 'ood_logo-24x24.png');
  await build({ rootDir: root, date: winter });
  same('ood_logo_seasonal.svg', 'ood_logo_christmas.svg');
  same('ood_logo_seasonal-16x16.png', 'ood_logo_christmas-16x16.png');
  await build({ rootDir: root, date: summer, variant: 'ood_logo_christmas' });
  same('ood_logo_seasonal.svg', 'ood_logo_christmas.svg');
});

test('unknown variant rejects naming it', async () => {
  const root = fixture();
  await assert.rejects(
    build({ rootDir: root, variant: 'nope_variant' }),
    /nope_variant/,
  );
  await assert.rejects(
    build({ rootDir: root, variant: 'ood_logo_small' }),
    /ood_logo_small/,
  );
});

test('second build leaves checksums unchanged; check rejects new asset', async () => {
  const root = fixture();
  await build({ rootDir: root, date: summer });
  const first = readFileSync(join(root, 'static-checksums.json'), 'utf8');
  assert.ok(first.endsWith('}\n'));
  await build({ rootDir: root, date: summer });
  assert.equal(readFileSync(join(root, 'static-checksums.json'), 'utf8'), first);
  await build({ rootDir: root, date: summer, check: true });
  const added = structuredClone(MANIFEST);
  added.assets.push({ name: 'brand_new', source: 'src/a.svg', formats: ['svg'], sizes: [] });
  writeFileSync(join(root, 'assets.json'), JSON.stringify(added));
  await assert.rejects(
    build({ rootDir: root, date: summer, check: true }),
    /brand_new\.svg/,
  );
  assert.equal(readFileSync(join(root, 'static-checksums.json'), 'utf8'), first);
});

test('invalid manifest rejects with every error', async () => {
  const root = fixture({ assets: [{ name: 'Bad', source: 'src/none.svg', formats: ['svg'], sizes: [] }], dynamic: [] });
  await assert.rejects(build({ rootDir: root }), (e) => /Bad/.test(e.message) && /missing source/.test(e.message));
});
