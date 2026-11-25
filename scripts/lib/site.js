/**
 * Generated site files: the published path manifest and the index page.
 * All URLs are relative so the site works on any domain or sub path.
 */

/**
 * Escape text for use in HTML content or a double quoted attribute.
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Render `v1/manifest.json`, listing every published path.
 * @param {string[]} paths Published paths relative to the site root.
 * @returns {string} Pretty printed JSON with a trailing newline.
 */
export function renderPathsManifest(paths) {
  return `${JSON.stringify({ paths }, null, 2)}\n`;
}

/**
 * Render `index.html`, listing each published path with a preview and link.
 * @param {string[]} paths Published paths relative to the site root.
 * @returns {string} A complete HTML document.
 */
export function renderIndexHtml(paths) {
  const items = paths
    .map((p) => {
      const url = escapeHtml(p);
      return `    <li><a href="${url}"><img src="${url}" alt="${url}" width="64" height="64" loading="lazy"><code>${url}</code></a></li>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Out of Orbit brand assets</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 2rem; }
    ul { list-style: none; padding: 0; display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); }
    li a { display: flex; align-items: center; gap: 1rem; text-decoration: none; color: inherit; }
    img { object-fit: contain; background: #8884; }
  </style>
</head>
<body>
  <h1>Out of Orbit brand assets</h1>
  <ul>
${items}
  </ul>
</body>
</html>
`;
}
