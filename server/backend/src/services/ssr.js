/**
 * The website's public pages as full HTML (frontend/src/entry-server.jsx, built to frontend/dist-ssr by
 * scripts/build-portal.js). Every page then carries its whole text — features, prices, FAQ, policies, contact
 * details — so visitors see it at once and search engines, link previews and AI assistants that do not run
 * JavaScript can read it. Without that build (or if a page fails to render) the older first-screen shells are used.
 */

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let loaded = null;

/** The renderer module, or null when frontend/dist-ssr is missing. Loaded once. */
export function loadRenderer(portalDist) {
  if (loaded) return loaded;
  const file = path.join(path.dirname(portalDist), 'dist-ssr', 'entry-server.js');
  loaded = fs.existsSync(file) ? import(pathToFileURL(file).href).catch(() => null) : Promise.resolve(null);
  return loaded;
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Put the page's own <title>, description and canonical address into index.html. */
export function withHead(html, { title, description, canonical, noindex }) {
  let out = html;
  if (title) out = out.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`);
  if (description) out = out.replace(/<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${esc(description)}" />`);
  const extra = [
    canonical && `<link rel="canonical" href="${esc(canonical)}" />`,
    noindex && '<meta name="robots" content="noindex, nofollow" />',
    title && `<meta property="og:title" content="${esc(title)}" />`,
    description && `<meta property="og:description" content="${esc(description)}" />`,
    canonical && `<meta property="og:url" content="${esc(canonical)}" />`,
    '<meta property="og:type" content="website" />',
  ].filter(Boolean);
  return out.replace('</head>', `    ${extra.join('\n    ')}\n  </head>`);
}

/** robots.txt: everything public may be read; panels and the API are not for search engines. */
export const robotsTxt = (baseUrl) =>
  ['User-agent: *', 'Allow: /', 'Disallow: /admin', 'Disallow: /account', 'Disallow: /api/', 'Disallow: /app/', 'Disallow: /r/', '', `Sitemap: ${baseUrl}/sitemap.xml`, ''].join('\n');

/** sitemap.xml of the public pages. */
export function sitemapXml(baseUrl, paths, lastmod) {
  const urls = paths
    .map((p) => `  <url><loc>${esc(baseUrl + (p === '/' ? '/' : p))}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>${p === '/' ? 'weekly' : 'monthly'}</changefreq><priority>${p === '/' ? '1.0' : p === '/buy' ? '0.8' : '0.5'}</priority></url>`)
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

/** The public pages when the renderer is not built (sitemap only). */
export const DEFAULT_PATHS = ['/', '/buy', '/mobile', '/partners', '/support', '/contact', '/terms', '/privacy', '/shipping', '/refunds', '/partner-terms'];
