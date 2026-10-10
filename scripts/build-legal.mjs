#!/usr/bin/env node
/*
 * Builds the in-app copy of the legal documents.
 *
 *   node scripts/build-legal.mjs
 *
 * The documents are written once, in legal/*.md, and the owner's details (name, address, contact
 * email…) live in legal/details.json. This reads both, fills every {{placeholder}} from
 * details.json, and writes src/legal/documents.ts, which the app's legal screen renders. Run it
 * after changing either, and commit the generated file with them. The website reads the same
 * Markdown, so the app and the site always say the same thing.
 *
 * The Markdown is kept deliberately simple, because the app draws it without a Markdown library:
 * "#", "##" and "###" headings, paragraphs, "- " bullet lists, **bold** and [links](address).
 * Links to another document use its path on the website ("/privacy"), which the app opens in place.
 * Anything else stops the build with the file and line, so a mistake can't reach the app.
 *
 * No dependencies: plain Node (18 or later).
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const legalDir = join(root, 'legal');
const outFile = join(root, 'src', 'legal', 'documents.ts');

/** The order the app lists them in. A new .md file not named here is added after these. */
const ORDER = ['terms', 'privacy', 'copyright', 'child-safety', 'community-guidelines'];

const problems = [];
const warnings = [];
const fail = (file, line, message) => problems.push(`${file}${line ? `:${line}` : ''}: ${message}`);

/* ---------- the owner's details ---------- */

let details;
try {
  details = JSON.parse(readFileSync(join(legalDir, 'details.json'), 'utf8'));
} catch (e) {
  console.error(`legal/details.json could not be read: ${e.message}`);
  process.exit(1);
}
for (const [key, value] of Object.entries(details)) {
  if (typeof value !== 'string') fail('details.json', 0, `"${key}" must be text`);
  // "[CONTACT EMAIL]" and the like: still waiting for the owner. Built anyway, but said out loud.
  else if (/^\[.*\]$|\/\/\[.*\]$/.test(value.trim())) warnings.push(`legal/details.json: "${key}" is still a placeholder (${value})`);
}

/**
 * Fills {{key}} gaps. Inside a link's address the value is URL-encoded, so a placeholder value with
 * spaces or brackets ("[CONTACT EMAIL]") can't break the link while it waits to be filled in.
 */
function fill(text, file, line) {
  const one = (encode) => (gap, key) => {
    if (!Object.prototype.hasOwnProperty.call(details, key)) {
      fail(file, line, `unknown placeholder {{${key}}} (add it to legal/details.json)`);
      return gap;
    }
    return encode ? encodeURI(details[key]) : details[key];
  };
  return text
    .replace(/\]\(([^)]*)\)/g, (m, url) => `](${url.replace(/\{\{\s*(\w+)\s*\}\}/g, one(true))})`)
    .replace(/\{\{\s*(\w+)\s*\}\}/g, one(false));
}

/* ---------- checking the inline Markdown ---------- */

// The same patterns the app uses to draw links (src/components/LegalDocument.tsx): link text may
// hold one level of [brackets], as a placeholder value does; an address has no spaces or brackets.
const LINK = /\[((?:[^[\]]|\[[^[\]]*\])+)\]\(([^()\s]+)\)/g;

function checkInline(text, file, line, docIds) {
  const withoutLinks = text.replace(LINK, (m, label, url) => {
    if (url.startsWith('/')) {
      const id = url.slice(1);
      if (!docIds.has(id)) warnings.push(`${file}:${line}: "${url}" is not one of the documents, so the app opens it on the website`);
    } else if (!/^(https?:|mailto:|tel:)/.test(url)) {
      fail(file, line, `link address "${url}" must start with https:, mailto:, tel: or / (another document)`);
    }
    return label;
  });
  if (/\]\(|\[[^\]]*\]\(/.test(withoutLinks)) fail(file, line, 'a link is not written as [text](address)');
  if ((withoutLinks.match(/\*\*/g) ?? []).length % 2) fail(file, line, 'a **bold** part is not closed');
  if (/(^|[^*])\*(?!\*)[^*\s][^*]*\*(?!\*)/.test(withoutLinks.replace(/\*\*/g, ''))) fail(file, line, 'single *italics* are not supported; use **bold**');
  if (/`/.test(text)) fail(file, line, '`code` is not supported');
  if (/<[a-z/][^>]*>/i.test(text)) fail(file, line, 'HTML is not supported');
}

/* ---------- reading one document ---------- */

function parse(file, source, docIds) {
  const blocks = [];
  let para = null;
  let list = null;
  const endPara = () => {
    if (para) blocks.push({ type: 'p', text: para.join(' ') });
    para = null;
  };
  const endList = () => {
    if (list) blocks.push({ type: 'ul', items: list });
    list = null;
  };
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((rawLine, i) => {
    const n = i + 1;
    const line = fill(rawLine, file, n);
    const trimmed = line.trim();
    if (!trimmed) {
      endPara();
      endList();
      return;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      endPara();
      endList();
      if (heading[1].length > 3) fail(file, n, 'only #, ## and ### headings are supported');
      const text = heading[2].trim();
      checkInline(text, file, n, docIds);
      blocks.push({ type: `h${Math.min(3, heading[1].length)}`, text });
      return;
    }
    const item = /^[-*+]\s+(.+)$/.exec(trimmed);
    if (item && /^\s{0,1}[-*+]\s/.test(line)) {
      endPara();
      if (!/^-\s/.test(trimmed)) fail(file, n, 'write bullets with "- "');
      checkInline(item[1], file, n, docIds);
      (list ??= []).push(item[1].trim());
      return;
    }
    if (/^\s{2,}[-*+]\s/.test(line)) fail(file, n, 'lists inside lists are not supported');
    if (/^\d+[.)]\s/.test(trimmed)) fail(file, n, 'numbered lists are not supported; use "- " bullets');
    if (/^>/.test(trimmed)) fail(file, n, 'quotes (>) are not supported');
    if (/^(```|~~~|\|)/.test(trimmed)) fail(file, n, 'code blocks and tables are not supported');
    if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) fail(file, n, 'horizontal rules are not supported');
    checkInline(trimmed, file, n, docIds);
    // A line straight after a bullet, indented, carries on that bullet.
    if (list && /^\s+\S/.test(line) && !para) {
      list[list.length - 1] += ` ${trimmed}`;
      return;
    }
    endList();
    (para ??= []).push(trimmed);
  });
  endPara();
  endList();
  return blocks;
}

/* ---------- all of them ---------- */

const files = readdirSync(legalDir).filter((f) => f.endsWith('.md'));
const ids = files.map((f) => basename(f, '.md'));
const docIds = new Set(ids);
for (const id of ids) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) fail(`${id}.md`, 0, 'file names must be lower case words joined by "-"');
}
ids.sort((a, b) => {
  const ia = ORDER.indexOf(a);
  const ib = ORDER.indexOf(b);
  if (ia >= 0 || ib >= 0) return (ia < 0 ? Infinity : ia) - (ib < 0 ? Infinity : ib);
  return a.localeCompare(b);
});
for (const id of ORDER) if (!docIds.has(id)) warnings.push(`legal/${id}.md is missing`);

const updated = details.effective_date ?? '';
const documents = ids.map((id) => {
  const file = `${id}.md`;
  let blocks = parse(file, readFileSync(join(legalDir, file), 'utf8'), docIds);
  const first = blocks[0];
  if (!first || first.type !== 'h1') fail(file, 1, 'the first line must be the title, as "# Title"');
  if (blocks.filter((b) => b.type === 'h1').length > 1) fail(file, 0, 'only the title may use a single "#"');
  // The date is shown by the app from `updated`, in the app's language, so the line is left out here.
  blocks = blocks.filter((b) => !(b.type === 'p' && /^last updated:?\s/i.test(b.text)));
  return { id, title: first?.type === 'h1' ? first.text : id, updated, blocks };
});

if (problems.length) {
  console.error(`The legal documents were not built:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}

/* ---------- writing src/legal/documents.ts ---------- */

/** A single-quoted TypeScript string, as the rest of the code base writes them. */
const q = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

function block(b) {
  if (b.type === 'ul') return `      { type: 'ul', items: [\n${b.items.map((it) => `        ${q(it)},`).join('\n')}\n      ] },`;
  return `      { type: ${q(b.type)}, text: ${q(b.text)} },`;
}

const out = `// GENERATED FILE: do not edit by hand.
// Made by scripts/build-legal.mjs from legal/*.md and legal/details.json. To change a document or
// the owner's details, edit those files and run \`node scripts/build-legal.mjs\`, then commit this file.

/** One piece of a document. Text may hold **bold** and [links](address), drawn by the legal screen. */
export type LegalBlock = { type: 'h1' | 'h2' | 'h3' | 'p'; text: string } | { type: 'ul'; items: string[] };

export type LegalDocId = ${ids.map(q).join(' | ')};

export type LegalDocument = {
  id: LegalDocId;
  /** The document's title (its "#" heading, also the first block). */
  title: string;
  /** When it last changed, as written in legal/details.json. */
  updated: string;
  blocks: LegalBlock[];
};

/** The owner's details from legal/details.json, for screens that need the contact email or website. */
export const LEGAL_DETAILS = {
${Object.entries(details).map(([k, v]) => `  ${k}: ${q(v)},`).join('\n')}
} as const;

/** Every document, in the order the app lists them. */
export const LEGAL_ORDER: LegalDocId[] = [${ids.map(q).join(', ')}];

export const LEGAL_DOCUMENTS: Record<LegalDocId, LegalDocument> = {
${documents
  .map((d) => `  ${q(d.id)}: {\n    id: ${q(d.id)},\n    title: ${q(d.title)},\n    updated: ${q(d.updated)},\n    blocks: [\n${d.blocks.map(block).join('\n')}\n    ],\n  },`)
  .join('\n')}
};

/** True for the id of one of the documents. */
export function isLegalDocId(id: string): id is LegalDocId {
  return Object.prototype.hasOwnProperty.call(LEGAL_DOCUMENTS, id);
}
`;

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, out);
for (const w of warnings) console.warn(`warning: ${w}`);
console.log(`Wrote ${documents.length} documents to src/legal/documents.ts (${documents.map((d) => `${d.id}: ${d.blocks.length} blocks`).join(', ')}).`);
