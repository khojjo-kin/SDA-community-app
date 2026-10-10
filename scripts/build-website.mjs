#!/usr/bin/env node
/**
 * Builds the Community website from website/ into website/dist/.
 *
 *   node scripts/build-website.mjs                       the real build (legal/ and website/site.json)
 *   node scripts/build-website.mjs --legal /some/dir     legal Markdown and details.json from elsewhere
 *
 * Options (paths are relative to the current directory):
 *   --legal <dir>     the legal Markdown and details.json   (default: legal/)
 *   --details <file>  details.json, if not inside --legal  (default: <legal>/details.json)
 *   --site <file>     site.json                             (default: website/site.json)
 *   --out <dir>       where to write the site               (default: website/dist/)
 *
 * Node 22, no dependencies. It renders the shared header and footer around every page, turns the
 * legal Markdown into pages (filling {{placeholders}} from details.json), copies the images and
 * icons, writes the web manifest, sitemap.xml, robots.txt, _headers and _redirects, and then
 * checks the result: every internal link, #fragment and asset must exist, nothing may load from
 * another site, and there must be no inline scripts or styles (the CSP forbids them). Any problem
 * fails the build with a list of what to fix.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'website');
const SRC = path.join(WEB, 'src');

const LEGAL_KEYS = ['operator_name', 'postal_address', 'contact_email', 'website', 'effective_date', 'app_name', 'governing_law', 'dmca_agent'];
const ANALYTICS_SCRIPT = 'https://static.cloudflareinsights.com';
const ANALYTICS_CONNECT = 'https://cloudflareinsights.com';

const errors = [];
const warnings = [];
const problem = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);
function die(msg) {
  console.error(`\nbuild-website: ${msg}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------------------------------------
// Options and configuration

function options(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const m = arg.match(/^--(legal|details|site|out)(?:=(.*))?$/);
    if (m) {
      const value = m[2] ?? argv[++i];
      if (!value) die(`${arg} needs a value`);
      opts[m[1]] = path.resolve(process.cwd(), value);
    } else if (arg === '-h' || arg === '--help') {
      console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n\/\*\*?|^ \* ?/gm, ''));
      process.exit(0);
    } else {
      die(`unknown option ${arg} (try --help)`);
    }
  }
  opts.legal ??= path.join(ROOT, 'legal');
  opts.details ??= path.join(opts.legal, 'details.json');
  opts.site ??= path.join(WEB, 'site.json');
  opts.out ??= path.join(WEB, 'dist');
  return opts;
}

function readJson(file, what) {
  if (!fs.existsSync(file)) die(`${what} not found: ${path.relative(process.cwd(), file) || file}`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    die(`${what} is not valid JSON (${file}): ${e.message}`);
  }
}

function httpsUrl(value, what) {
  if (!value) return '';
  let url;
  try {
    url = new URL(value);
  } catch {
    problem(`${what} is not a valid URL: ${value}`);
    return '';
  }
  if (url.protocol !== 'https:') problem(`${what} must start with https:// (${value})`);
  return url.href;
}

function siteAddress(website) {
  let value = String(website).trim();
  if (!/^[a-z]+:\/\//i.test(value)) value = `https://${value}`;
  let url;
  try {
    url = new URL(value);
  } catch {
    die(`details.json "website" is not a web address: ${website}`);
  }
  if (url.protocol !== 'https:') problem(`details.json "website" should use https:// (${website})`);
  const basePath = url.pathname.replace(/\/+$/, '');
  return { origin: url.origin, host: url.host, basePath, siteUrl: url.origin + basePath };
}

/** "2026-10-10" becomes "10 October 2026"; a date already written out is kept as written. Both get an ISO date for <time> and the sitemap. */
function formatDate(value) {
  const text = String(value).trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = iso ? new Date(Date.UTC(+iso[1], +iso[2] - 1, +iso[3])) : new Date(`${text} 12:00 UTC`);
  if (Number.isNaN(date.getTime())) return { text, iso: '' };
  return {
    text: iso ? date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : text,
    iso: date.toISOString().slice(0, 10),
  };
}

// ---------------------------------------------------------------------------------------------
// Small HTML helpers

// Every attribute in the templates is double-quoted, so these four are enough (and the CSP's 'self' stays readable).
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const stripTags = (s) => s.replace(/<[^>]*>/g, '').replace(/&(amp|lt|gt|quot|#39);/g, (_, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[e]);
const slugify = (s) => stripTags(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
const hash = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);

/**
 * The template language: {{name}} (escaped), {{{name}}} (raw HTML), and
 * {{#if name}}…{{else}}…{{/if}} / {{^if name}}…{{/if}} (nestable). Unknown names are errors.
 */
function render(template, ctx, where) {
  const IF = /\{\{([#^])if\s+(\w+)\s*\}\}((?:(?!\{\{[#^]if\s)[\s\S])*?)\{\{\/if\}\}/;
  const known = (key) => {
    if (!(key in ctx)) throw new Error(`${where}: unknown template value {{${key}}}`);
    return ctx[key];
  };
  let s = template;
  let m;
  while ((m = s.match(IF))) {
    const [all, kind, key, body] = m;
    const [yes, no = ''] = body.split('{{else}}');
    const value = known(key);
    const truthy = Array.isArray(value) ? value.length > 0 : Boolean(value);
    s = s.slice(0, m.index) + ((kind === '#') === truthy ? yes : no) + s.slice(m.index + all.length);
  }
  s = s.replace(/\{\{\{\s*(\w+)\s*\}\}\}|\{\{\s*(\w+)\s*\}\}/g, (_, raw, plain) => {
    const value = known(raw || plain) ?? '';
    return raw ? String(value) : esc(value);
  });
  return s;
}

// ---------------------------------------------------------------------------------------------
// Markdown (the subset the legal documents use: headings, paragraphs, lists, quotes, rules,
// **bold**, *italic*, `code`, [links](url) and bare web and email addresses)

function makeMarkdown({ linkHref }) {
  function inline(text) {
    const stash = [];
    const keep = (html) => `\u0000${stash.push(html) - 1}\u0000`;
    let s = text;
    s = s.replace(/`([^`\n]+)`/g, (_, code) => keep(`<code>${esc(code)}</code>`));
    s = s.replace(/\[([^\]\n]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g, (_, label, url) => keep(`<a href="${esc(linkHref(url))}">${inline(label)}</a>`));
    s = s.replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/g, (_, url) => keep(`<a href="${esc(linkHref(url))}">${esc(url.replace(/^mailto:/, ''))}</a>`));
    s = s.replace(/\bhttps?:\/\/[^\s<>()]*[^\s<>().,;:!?'"*_]/g, (url) => keep(`<a href="${esc(linkHref(url))}">${esc(url)}</a>`));
    s = s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, (email) => keep(`<a href="mailto:${esc(email)}">${esc(email)}</a>`));
    s = esc(s);
    s = s.replace(/\*\*(?=\S)([\s\S]*?\S)\*\*|__(?=\S)([\s\S]*?\S)__/g, (_, a, b) => `<strong>${a ?? b}</strong>`);
    s = s.replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1<em>$2</em>');
    s = s.replace(/(?: {2,}|\\)\n/g, '<br>\n');
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => stash[+i]);
  }

  const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
  const isBlank = (line) => /^\s*$/.test(line);
  const indentOf = (line) => line.match(/^\s*/)[0].length;

  function list(lines, i, state) {
    const first = lines[i].match(ITEM);
    const indent = first[1].length;
    const ordered = /\d/.test(first[2]);
    const items = [];
    let loose = false;
    while (i < lines.length) {
      const line = lines[i];
      const m = line.match(ITEM);
      if (m && m[1].length === indent && /\d/.test(m[2]) === ordered) {
        items.push([m[3]]);
        i++;
      } else if (isBlank(line)) {
        let j = i + 1;
        while (j < lines.length && isBlank(lines[j])) j++;
        const next = j < lines.length ? lines[j].match(ITEM) : null;
        const sameList = next && next[1].length === indent && /\d/.test(next[2]) === ordered;
        if (j < lines.length && (sameList || indentOf(lines[j]) > indent)) {
          if (!sameList) items.at(-1).push('');
          loose = loose || !sameList;
          i = j;
        } else break;
      } else if (indentOf(line) > indent) {
        items.at(-1).push(line.slice(Math.min(indentOf(line), indent + (ordered ? 3 : 2))));
        i++;
      } else if (!m && !/^#{1,6}\s/.test(line) && !/^\s{0,3}>/.test(line)) {
        items.at(-1).push(line.trim()); // lazy continuation of the item's text
        i++;
      } else break;
    }
    const start = ordered && parseInt(first[2], 10) !== 1 ? ` start="${parseInt(first[2], 10)}"` : '';
    const tag = ordered ? 'ol' : 'ul';
    const lis = items.map((itemLines) => {
      let html = blocks(itemLines, state).trim();
      if (!loose) html = html.replace(/^<p>([\s\S]*?)<\/p>/, '$1');
      return `<li>${html}</li>`;
    });
    return [`<${tag}${start}>\n${lis.join('\n')}\n</${tag}>`, i];
  }

  function blocks(lines, state) {
    const out = [];
    let para = [];
    const flush = () => {
      if (para.length) out.push(`<p>${inline(para.join('\n').trim())}</p>`);
      para = [];
    };
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      let m;
      if (isBlank(line)) {
        flush();
        i++;
      } else if ((m = line.match(/^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/))) {
        flush();
        const html = inline(m[2]);
        if (m[1].length === 1 && state.title == null && !state.content && out.length === 0) {
          state.title = stripTags(html);
        } else {
          const level = Math.min(Math.max(m[1].length, 2), 4);
          let id = slugify(html);
          for (let n = 2; state.ids.has(id); n++) id = `${slugify(html)}-${n}`;
          state.ids.add(id);
          if (level === 2) state.toc.push({ id, html: html.replace(/<a\b[^>]*>|<\/a>/g, '') });
          out.push(`<h${level} id="${id}">${html}</h${level}>`);
        }
        i++;
      } else if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
        flush();
        out.push('<hr>');
        i++;
      } else if (/^\s{0,3}>/.test(line)) {
        flush();
        const quoted = [];
        while (i < lines.length && /^\s{0,3}>/.test(lines[i])) quoted.push(lines[i++].replace(/^\s{0,3}> ?/, ''));
        out.push(`<blockquote>\n${blocks(quoted, state)}\n</blockquote>`);
      } else if (ITEM.test(line)) {
        flush();
        const [html, next] = list(lines, i, state);
        out.push(html);
        i = next;
      } else {
        para.push(line);
        i++;
      }
      if (out.length) state.content = true;
    }
    flush();
    return out.join('\n');
  }

  return (source) => {
    const state = { title: null, toc: [], ids: new Set(['main', 'toc-title', 'callout-title']), content: false };
    const clean = source.replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/<!--[\s\S]*?-->/g, '');
    const html = blocks(clean.split('\n'), state);
    return { html, title: state.title, toc: state.toc };
  };
}

// ---------------------------------------------------------------------------------------------
// Files

function copyDir(from, to) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
}

function prepareOut(out) {
  const rel = path.relative(ROOT, out);
  if (out === ROOT || out === WEB || ROOT.startsWith(out + path.sep) || out === path.parse(out).root) die(`refusing to use ${out} as the output folder`);
  if (fs.existsSync(out)) {
    const entries = fs.readdirSync(out);
    const ours = entries.length === 0 || (entries.includes('index.html') && entries.includes('sitemap.xml')) || rel === path.join('website', 'dist');
    if (!ours) die(`${out} already has files in it that this build did not make; choose an empty folder`);
    fs.rmSync(out, { recursive: true, force: true });
  }
  fs.mkdirSync(out, { recursive: true });
}

const isFile = (f) => {
  try {
    return fs.statSync(f).isFile();
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------------------------------------
// The build

const opts = options(process.argv.slice(2));
const details = readJson(opts.details, 'details.json (the legal details)');
const site = readJson(opts.site, 'site.json');
const pages = readJson(path.join(SRC, 'pages.json'), 'website/src/pages.json');
const images = readJson(path.join(SRC, 'images.json'), 'website/src/images.json');

for (const key of LEGAL_KEYS) {
  if (details[key] == null || String(details[key]).trim() === '') problem(`details.json is missing "${key}"`);
}
if (details.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.contact_email)) problem(`details.json "contact_email" is not an email address: ${details.contact_email}`);
if (errors.length) die(`fix details.json first (${opts.details}):\n  - ${errors.join('\n  - ')}`);

const { host, basePath, siteUrl } = siteAddress(details.website);
const base = basePath; // prefix for every internal link: '' for a domain of its own, '/repo' on project Pages
const effective = formatDate(details.effective_date);
const postalLine = String(details.postal_address).split(/\s*\n\s*/).filter(Boolean).join(', ');

// What a {{placeholder}} in the legal Markdown becomes.
const legalValues = { ...details, effective_date: effective.text, postal_address: postalLine };

// The main call to action.
const appStoreUrl = httpsUrl(site.app_store_url, 'site.json "app_store_url"');
const testflightUrl = httpsUrl(site.testflight_url, 'site.json "testflight_url"');
let ctaUrl;
let availability;
let availabilityLong;
if (appStoreUrl) {
  ctaUrl = appStoreUrl;
  availability = 'Free on the App Store, for iPhone. For ages 13 and up.';
  availabilityLong = 'Community is free on the App Store, for iPhone. Tap Get Community on our home page, or search the App Store for Community.';
} else if (testflightUrl) {
  ctaUrl = testflightUrl;
  availability = 'Free for iPhone, and in testing now through Apple’s TestFlight app. Coming soon to the App Store. For ages 13 and up.';
  availabilityLong = 'Community is free for iPhone. While it is being tested you install it through Apple’s TestFlight app: tap Get Community on our home page, install TestFlight if your phone asks, then install Community from there. It comes to the App Store soon.';
} else {
  ctaUrl = `${base}/support#get-the-app`;
  availability = 'Coming soon to the App Store, for iPhone. For ages 13 and up.';
  availabilityLong = 'Community is coming soon to the App Store, for iPhone. The download link will be on this site as soon as it is available.';
  warn('site.json has no app_store_url or testflight_url, so "Get Community" links to the support page. Add one before launch.');
}
const appStoreId = (appStoreUrl.match(/\/id(\d+)/) || [])[1] || '';

const token = String(site.analytics_token || '').trim();
if (token && !/^[A-Za-z0-9_-]{8,128}$/.test(token)) die('site.json "analytics_token" should be the token from Cloudflare Web Analytics (letters and numbers only)');

// Security headers: website/_headers is the single source; the <meta> CSP is derived from it.
const headersSource = fs.readFileSync(path.join(WEB, '_headers'), 'utf8');
const cspLine = headersSource.match(/^(\s*Content-Security-Policy:\s*)(.+)$/m);
if (!cspLine) die('website/_headers has no Content-Security-Policy line');
const csp = new Map(cspLine[2].split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
  const [name, ...values] = d.split(/\s+/);
  return [name, values];
}));
if (token) {
  csp.get('script-src')?.push(ANALYTICS_SCRIPT);
  csp.get('connect-src')?.push(ANALYTICS_CONNECT);
}
const cspString = (skip = []) => [...csp].filter(([name]) => !skip.includes(name)).map(([name, values]) => [name, ...values].join(' ')).join('; ');
const cspHeader = cspString();
const cspMeta = cspString(['frame-ancestors', 'report-uri', 'report-to', 'sandbox']);

// Output folder and static files.
const out = opts.out;
prepareOut(out);
copyDir(path.join(WEB, 'assets'), path.join(out, 'assets'));
copyDir(path.join(WEB, 'static'), out);
const cssVersion = hash(fs.readFileSync(path.join(out, 'assets/css/site.css')));
const jsVersion = hash(fs.readFileSync(path.join(out, 'assets/js/consent.js')));
if (!token) fs.rmSync(path.join(out, 'assets/js'), { recursive: true, force: true }); // no analytics: no script at all

const tpl = (name) => fs.readFileSync(path.join(SRC, name), 'utf8');
const layout = tpl('layout.html');
const header = tpl('partials/header.html');
const footer = tpl('partials/footer.html');
const pageHead = tpl('partials/page-head.html');
const legalTemplate = tpl('pages/legal.html');

const global = {
  base,
  site_url: siteUrl,
  csp_meta: cspMeta,
  css_version: cssVersion,
  js_version: jsVersion,
  cta_url: ctaUrl,
  availability,
  availability_long: availabilityLong,
  app_store_id: appStoreId,
  analytics: Boolean(token),
  analytics_token: token,
  year: String(new Date().getUTCFullYear()),
  operator_name: details.operator_name,
  postal_address_line: postalLine,
  contact_email: details.contact_email,
  dmca_agent: details.dmca_agent,
  effective_date: '',
  effective_iso: '',
  logo_width: String(images.logo.width),
  logo_height: String(images.logo.height),
};

const legalPaths = new Map(pages.filter((p) => p.legal).map((p) => [p.legal.toLowerCase(), p.path]));

function linkHref(url, file) {
  if (/^(mailto:|tel:)/i.test(url)) return url;
  if (/^https?:\/\//i.test(url)) {
    if (url === siteUrl || url.startsWith(siteUrl + '/') || url.startsWith(siteUrl + '#')) return base + (url.slice(siteUrl.length) || '/');
    return url;
  }
  if (url.startsWith('#')) return url;
  const md = url.match(/^(?:\.\/|\/)?(?:legal\/)?([\w-]+\.md)(#.*)?$/i);
  if (md) {
    const to = legalPaths.get(md[1].toLowerCase());
    if (!to) {
      problem(`${file}: links to ${url}, which is not one of the legal pages`);
      return url;
    }
    return base + to + (md[2] || '');
  }
  if (url.startsWith('/')) return base + url;
  problem(`${file}: relative link "${url}" (use a full https:// address, a /path on this site, or another-document.md)`);
  return url;
}

function picture(attrs, where) {
  const info = images.photos[attrs.name];
  if (!info) {
    problem(`${where}: <x-picture name="${attrs.name}"> is not in website/src/images.json`);
    return '';
  }
  if (!attrs.alt || attrs.alt.trim().length < 10) problem(`${where}: <x-picture name="${attrs.name}"> needs a descriptive alt`);
  const [aw, ah] = info.aspect;
  const mid = info.widths[Math.floor(info.widths.length / 2)];
  const srcset = (ext) => info.widths.map((w) => `${base}/assets/img/${attrs.name}-${w}.${ext} ${w}w`).join(', ');
  const sizes = esc(attrs.sizes || '100vw');
  const types = { avif: 'image/avif', webp: 'image/webp' };
  const sources = info.formats.filter((f) => types[f]).map((f) => `<source type="${types[f]}" srcset="${srcset(f)}" sizes="${sizes}">`);
  const loading = 'eager' in attrs ? 'fetchpriority="high"' : 'loading="lazy"';
  return `<picture>${sources.join('')}<img src="${base}/assets/img/${attrs.name}-${mid}.jpg" srcset="${srcset('jpg')}" sizes="${sizes}" width="${mid}" height="${Math.round((mid * ah) / aw)}" alt="${esc(attrs.alt)}" ${loading} decoding="async"></picture>`;
}

function expandPictures(html, where) {
  return html.replace(/<x-picture\b([^>]*)><\/x-picture>/g, (_, raw) => {
    const attrs = {};
    for (const m of raw.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) attrs[m[1]] = m[2] ?? '';
    return picture(attrs, where);
  });
}

const builtPages = [];
for (const page of pages) {
  const file = page.file || (page.path === '/' ? 'index.html' : `${page.path.slice(1)}.html`);
  const ctx = {
    ...global,
    title: page.title,
    description: page.description,
    social_title: page.path === '/' ? page.title : page.title.replace(/ \| Community$/, ''),
    canonical: page.noindex ? '' : siteUrl + (page.path === '/' ? '/' : page.path),
    noindex: Boolean(page.noindex),
    is_home: page.path === '/',
    is_support: page.slug === 'support',
    h1: page.h1 || '',
    lead: page.lead || '',
  };
  let content;
  let lastmod = '';
  try {
    if (page.legal) {
      const mdFile = path.join(opts.legal, page.legal);
      if (!isFile(mdFile)) {
        problem(`missing legal document ${mdFile} (the ${page.h1} page is built from it)`);
        continue;
      }
      let source = fs.readFileSync(mdFile, 'utf8');
      const mentionsDate = /\{\{\s*effective_date\s*\}\}/.test(source);
      source = source.replace(/\{\{\s*(\w+)\s*\}\}/g, (all, key) => {
        if (legalValues[key] == null || String(legalValues[key]).trim() === '') {
          problem(`${page.legal}: {{${key}}} has no value in details.json`);
          return all;
        }
        return String(legalValues[key]);
      });
      const md = makeMarkdown({ linkHref: (url) => linkHref(url, page.legal) })(source);
      if (md.title) ctx.h1 = md.title;
      if (!mentionsDate) {
        ctx.effective_date = effective.text;
        ctx.effective_iso = effective.iso;
      }
      lastmod = effective.iso;
      const toc = md.toc.length >= 3 ? `<ol role="list">\n${md.toc.map((h) => `      <li><a href="#${h.id}">${h.html}</a></li>`).join('\n')}\n    </ol>` : '';
      content = render(legalTemplate, { ...ctx, toc, body: md.html, callout: page.callout === 'report-copyright' }, `pages/legal.html (${page.legal})`);
    } else {
      content = render(tpl(page.source), ctx, page.source);
    }
    content = expandPictures(content, page.source || page.legal);
    if (page.path !== '/') content = render(pageHead, ctx, 'partials/page-head.html') + content;
    const html = render(layout, {
      ...ctx,
      header: render(header, ctx, 'partials/header.html'),
      footer: render(footer, ctx, 'partials/footer.html'),
      content,
    }, 'layout.html');
    fs.writeFileSync(path.join(out, file), html);
    builtPages.push({ ...page, file, lastmod });
  } catch (e) {
    problem(e.message);
  }
}

// Web manifest, sitemap, robots, headers, redirects.
fs.writeFileSync(path.join(out, 'site.webmanifest'), JSON.stringify({
  name: 'Community',
  short_name: 'Community',
  description: 'The social app for the Seventh-day Adventist church family.',
  start_url: `${base}/`,
  scope: `${base}/`,
  display: 'browser',
  background_color: '#0c2118',
  theme_color: '#0c2118',
  icons: [
    { src: `${base}/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `${base}/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: `${base}/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}, null, 2) + '\n');

const indexed = builtPages.filter((p) => !p.noindex);
fs.writeFileSync(path.join(out, 'sitemap.xml'), [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...indexed.map((p) => `  <url><loc>${esc(siteUrl + (p.path === '/' ? '/' : p.path))}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}</url>`),
  '</urlset>',
  '',
].join('\n'));

fs.writeFileSync(path.join(out, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`);

fs.writeFileSync(path.join(out, '_headers'), headersSource.replace(cspLine[0], cspLine[1] + cspHeader));

const redirectLines = [];
const redirectTargets = [];
for (const line of fs.readFileSync(path.join(WEB, '_redirects'), 'utf8').split('\n')) {
  const fields = line.trim().split(/\s+/);
  if (!line.trim() || line.trim().startsWith('#')) {
    redirectLines.push(line);
    continue;
  }
  if (fields.length < 2 || !fields[0].startsWith('/') || !fields[1].startsWith('/')) {
    problem(`website/_redirects: "${line.trim()}" should be "/from /to 301"`);
    continue;
  }
  redirectTargets.push(fields[1]);
  redirectLines.push(line.replace(fields[0], base + fields[0]).replace(new RegExp(`(\\s)${fields[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`), `$1${base}${fields[1]}$2`));
}
const generated = ['', '# Added by the build: one address per page, without a trailing slash.'];
for (const p of builtPages) if (p.path !== '/' && !p.noindex) generated.push(`${base}${p.path}/  ${base}${p.path}  301`);
if (!base) {
  const bare = host.replace(/^www\./, '');
  const other = host.startsWith('www.') ? bare : `www.${host}`;
  generated.push(
    '',
    '# Added by the build: always https, and one host name. Netlify reads these; Cloudflare Pages',
    '# skips domain rules (it serves https only; turn on "Always Use HTTPS" for the domain).',
    `http://${host}/*  https://${host}/:splat  301!`,
    `http://${other}/*  https://${host}/:splat  301!`,
    `https://${other}/*  https://${host}/:splat  301!`,
  );
}
fs.writeFileSync(path.join(out, '_redirects'), [...redirectLines, ...generated].join('\n').replace(/\n*$/, '\n'));

// ---------------------------------------------------------------------------------------------
// Checks

const htmlFiles = walk(out).filter((f) => f.endsWith('.html'));
const idsCache = new Map();
function idsOf(file) {
  if (!idsCache.has(file)) idsCache.set(file, new Set([...fs.readFileSync(file, 'utf8').matchAll(/\sid="([^"]+)"/g)].map((m) => m[1])));
  return idsCache.get(file);
}

/** Resolves a link on this site to the file it serves, the way Cloudflare Pages and GitHub Pages do. */
function resolve(url, fromFile) {
  const [beforeHash, fragment = ''] = url.split('#');
  const pathPart = beforeHash.split('?')[0];
  if (pathPart === '') return { file: fromFile, fragment };
  if (!pathPart.startsWith('/')) return { error: 'is relative; use a path from the site root so it works from every page (including 404.html)' };
  if (base && pathPart !== base && !pathPart.startsWith(base + '/')) return { error: `is outside the site's base path ${base}` };
  const p = decodeURIComponent(pathPart.slice(base.length) || '/');
  if (p !== '/' && p.endsWith('/')) return { error: 'ends with a slash; page addresses have no trailing slash' };
  if (/\.html$/.test(p)) return { error: 'ends with .html; link to the page address without it' };
  const candidates = p === '/' ? ['index.html'] : [p.slice(1), `${p.slice(1)}.html`];
  for (const c of candidates) if (isFile(path.join(out, c))) return { file: path.join(out, c), fragment };
  return { error: 'does not exist' };
}

const external = new Set();
const titles = new Map();
const descriptions = new Map();
for (const file of htmlFiles) {
  const name = path.relative(out, file);
  const html = fs.readFileSync(file, 'utf8');
  const say = (msg) => problem(`${name}: ${msg}`);

  if (/\{\{|\}\}/.test(html)) say('has an unfilled {{placeholder}}');
  if (/<style[\s>]/i.test(html)) say('has a <style> block (the CSP allows only site.css)');
  if (/<script(?![^>]*\bsrc=)[^>]*>/i.test(html)) say('has an inline <script> (the CSP allows only script files)');

  const title = (html.match(/<title>([^<]*)<\/title>/) || [])[1];
  const desc = (html.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  if (!title) say('has no <title>');
  if (!desc) say('has no meta description');
  if (titles.has(title)) say(`has the same <title> as ${titles.get(title)}`);
  if (descriptions.has(desc)) say(`has the same description as ${descriptions.get(desc)}`);
  titles.set(title, name);
  descriptions.set(desc, name);
  if ((html.match(/<h1[\s>]/g) || []).length !== 1) say('should have exactly one <h1>');

  for (const tag of html.matchAll(/<([a-z][\w-]*)\b([^>]*)>/gi)) {
    const tagName = tag[1].toLowerCase();
    const attrs = {};
    for (const a of tag[2].matchAll(/([\w:-]+)(?:\s*=\s*"([^"]*)")?/g)) attrs[a[1].toLowerCase()] = (a[2] ?? '').replace(/&amp;/g, '&');
    if ('style' in attrs) say(`<${tagName}> has a style attribute (the CSP blocks it)`);
    for (const attr of Object.keys(attrs)) if (/^on[a-z]+$/.test(attr)) say(`<${tagName}> has an inline ${attr} handler`);
    if (tagName === 'img') {
      if (!attrs.alt || attrs.alt.trim().length < 3) say(`<img src="${attrs.src}"> needs descriptive alt text`);
      if (!attrs.width || !attrs.height) say(`<img src="${attrs.src}"> needs width and height`);
    }

    const urls = [];
    if (attrs.href !== undefined) urls.push(['href', attrs.href]);
    if (attrs.src !== undefined) urls.push(['src', attrs.src]);
    for (const key of ['srcset']) if (attrs[key]) for (const part of attrs[key].split(',')) urls.push([key, part.trim().split(/\s+/)[0]]);
    if (tagName === 'meta' && /^(og:image|twitter:image|og:url)$/.test(attrs.property || attrs.name || '')) urls.push(['content', attrs.content]);

    for (const [attr, url] of urls) {
      if (!url) {
        say(`<${tagName}> has an empty ${attr}`);
        continue;
      }
      const isNavigation = tagName === 'a' || (tagName === 'link' && attrs.rel === 'canonical') || (tagName === 'meta' && attr === 'content');
      if (/^(mailto|tel):/i.test(url)) {
        if (tagName !== 'a') say(`<${tagName} ${attr}="${url}"> is not a link`);
        continue;
      }
      if (/^(https?:)?\/\//i.test(url)) {
        if (url === siteUrl || url.startsWith(siteUrl + '/')) {
          const r = resolve(base + (url.slice(siteUrl.length) || '/'), file);
          if (r.error) say(`${attr}="${url}" ${r.error}`);
        } else if (isNavigation) {
          external.add(url);
        } else {
          say(`<${tagName} ${attr}="${url}"> would load something from another site`);
        }
        continue;
      }
      if (/^[a-z][\w+.-]*:/i.test(url)) {
        say(`<${tagName} ${attr}="${url}"> uses an unexpected scheme`);
        continue;
      }
      const r = resolve(url, file);
      if (r.error) {
        say(`${attr}="${url}" ${r.error}`);
        continue;
      }
      if (r.fragment && r.file.endsWith('.html') && !idsOf(r.file).has(decodeURIComponent(r.fragment))) say(`${attr}="${url}": there is no id="${r.fragment}" on ${path.relative(out, r.file)}`);
    }
  }
}

for (const css of walk(out).filter((f) => f.endsWith('.css'))) {
  const text = fs.readFileSync(css, 'utf8');
  if (/@import/i.test(text)) problem(`${path.relative(out, css)}: @import is not allowed`);
  for (const m of text.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)) {
    if (/^data:/.test(m[1])) continue;
    if (/^(https?:)?\/\//.test(m[1])) problem(`${path.relative(out, css)}: url(${m[1]}) would load from another site`);
    else if (!isFile(path.resolve(path.dirname(css), m[1].split(/[?#]/)[0]))) problem(`${path.relative(out, css)}: url(${m[1]}) does not exist`);
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(out, 'site.webmanifest'), 'utf8'));
for (const icon of manifest.icons) if (resolve(icon.src, path.join(out, 'index.html')).error) problem(`site.webmanifest: icon ${icon.src} does not exist`);
for (const target of redirectTargets) {
  const r = resolve(base + target, path.join(out, 'index.html'));
  if (r.error) problem(`website/_redirects: target ${target} ${r.error}`);
  else if (r.fragment && !idsOf(r.file).has(r.fragment)) problem(`website/_redirects: target ${target} has no matching id`);
}
if (!isFile(path.join(out, '404.html'))) problem('404.html was not built');

// ---------------------------------------------------------------------------------------------
// Report

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const size = (f) => (isFile(f) ? fs.statSync(f).size : 0);
console.log(`\nCommunity website -> ${path.relative(process.cwd(), out) || out}`);
console.log(`  site: ${siteUrl}/   legal: ${opts.legal}`);
console.log(`  Get Community: ${ctaUrl}`);
console.log(`  analytics: ${token ? 'Cloudflare Web Analytics after consent' : 'off (no banner, no script)'}`);
console.log('\n  page                        html     + css/js   + images*   total');
const shared = size(path.join(out, 'assets/css/site.css')) + (token ? size(path.join(out, 'assets/js/consent.js')) : 0) + size(path.join(out, 'assets/img/logo-72.png'));
for (const p of builtPages) {
  const html = fs.readFileSync(path.join(out, p.file), 'utf8');
  let img = 0;
  for (const m of html.matchAll(/<source type="image\/avif" srcset="([^"]+)"/g)) {
    const last = m[1].split(',').at(-1).trim().split(/\s+/)[0];
    img += size(path.join(out, last.slice(base.length)));
  }
  const h = size(path.join(out, p.file));
  console.log(`  ${(p.path).padEnd(26)} ${kb(h).padStart(8)}  ${kb(shared).padStart(9)}  ${kb(img).padStart(9)}  ${kb(h + shared + img).padStart(9)}`);
}
console.log('  * largest AVIF of each photo (a 2x screen); smaller screens load less, and only the hero loads before scrolling.');
if (external.size) console.log(`\n  links to other sites (followed only when clicked): ${[...external].join(', ')}`);
for (const w of warnings) console.log(`\n  warning: ${w}`);

if (errors.length) {
  console.error(`\nThe website build failed with ${errors.length} problem${errors.length === 1 ? '' : 's'}:\n  - ${[...new Set(errors)].join('\n  - ')}\n`);
  process.exit(1);
}
console.log(`\n  ${builtPages.length} pages, all links and assets checked.\n`);
