// Privacy policy, terms, community guidelines, child safety and copyright: the same documents as the
// iPhone app and the website, written once in legal/*.md (copied in by scripts/legal.mjs), and About.
// The Markdown is drawn by a small renderer below that only makes React elements, never HTML, so
// nothing in a document can run as code.
import React, { useState } from 'react';
import { nav } from '../lib/router';
import { Empty, Icon, type IconName, Link, Modal } from '../ui/kit';
import { Wordmark } from '../ui/sidebar';
import { LEGAL_DETAILS, LEGAL_MARKDOWN, LEGAL_PATHS } from './legal-docs.gen';
import '../styles/settings.css';

declare const __VERSION__: string;

/** The documents in the order they are listed, with the About page last. */
export const LEGAL_DOCS: { id: string; label: string; icon: IconName }[] = [
  { id: 'privacy', label: 'Privacy policy', icon: 'lock' },
  { id: 'terms', label: 'Terms of use', icon: 'book' },
  { id: 'guidelines', label: 'Community guidelines', icon: 'users' },
  { id: 'child-safety', label: 'Child safety', icon: 'shield' },
  { id: 'copyright', label: 'Copyright policy', icon: 'gavel' },
  { id: 'about', label: 'About Community', icon: 'info' },
];

const UPDATED = LEGAL_DETAILS.effective_date ?? '';

/* ---------- reading the Markdown ---------- */

type Block = { type: 'h1' | 'h2' | 'h3' | 'p'; text: string } | { type: 'ul'; items: string[] };

/** True for one of the owner's details still waiting to be filled in ("[CONTACT EMAIL]", "https://[WEBSITE]"). */
export function isPlaceholder(value: string): boolean {
  let text = value;
  try {
    text = decodeURIComponent(value);
  } catch {
    // not encoded
  }
  return /\[[^\]]*\]/.test(text);
}

/** Fills {{key}} gaps from details.json; inside a link's address the value is encoded. */
function fill(text: string): string {
  const one = (encode: boolean) => (gap: string, key: string) => (key in LEGAL_DETAILS ? (encode ? encodeURI(LEGAL_DETAILS[key]) : LEGAL_DETAILS[key]) : gap);
  return text.replace(/\]\(([^)]*)\)/g, (_m, url: string) => `](${url.replace(/\{\{\s*(\w+)\s*\}\}/g, one(true))})`).replace(/\{\{\s*(\w+)\s*\}\}/g, one(false));
}

/** Headings (#, ##, ###), paragraphs and "- " lists; a line indented under a bullet carries it on. */
export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] | null = null;
  let list: string[] | null = null;
  const endPara = () => {
    if (para) blocks.push({ type: 'p', text: para.join(' ') });
    para = null;
  };
  const endList = () => {
    if (list) blocks.push({ type: 'ul', items: list });
    list = null;
  };
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = fill(raw);
    const trimmed = line.trim();
    if (!trimmed) {
      endPara();
      endList();
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)$/.exec(trimmed);
    if (heading) {
      endPara();
      endList();
      blocks.push({ type: (['h1', 'h2', 'h3'] as const)[Math.min(3, heading[1].length) - 1], text: heading[2].trim() });
      continue;
    }
    const item = /^[-*+]\s+(.+)$/.exec(trimmed);
    if (item && !/^\s{2,}/.test(line)) {
      endPara();
      (list ??= []).push(item[1].trim());
      continue;
    }
    if (list && /^\s+\S/.test(line) && !para) {
      list[list.length - 1] += ' ' + trimmed;
      continue;
    }
    endList();
    (para ??= []).push(trimmed);
  }
  endPara();
  endList();
  return blocks;
}

/* ---------- drawing a line: **bold**, *italic* and [links](address) ---------- */

const INLINE = /\*\*(.+?)\*\*|(?<![\w*])[*_]([^*_\s](?:[^*_]*[^*_\s])?)[*_](?![\w*])|\[((?:[^[\]]|\[[^[\]]*\])+)\]\(([^()\s]+)\)/g;

/** Where a link goes: another document here, a page of the website, an outside address, or nowhere yet. */
function target(href: string): { doc: string } | { url: string } | null {
  if (href.startsWith('/')) {
    const path = href.split(/[?#]/)[0];
    if (LEGAL_PATHS[path]) return { doc: LEGAL_PATHS[path] };
    const site = (LEGAL_DETAILS.website ?? '').replace(/\/+$/, '');
    return isPlaceholder(site) ? null : { url: site + href };
  }
  if (!/^(https?:|mailto:|tel:)/i.test(href) || isPlaceholder(href)) return null;
  return { url: href };
}

function inline(text: string, openDoc: (id: string) => void, key = ''): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let last = 0;
  let n = 0;
  for (const m of text.matchAll(INLINE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const k = key + '.' + n++;
    if (m[1] !== undefined) out.push(<strong key={k}>{inline(m[1], openDoc, k)}</strong>);
    else if (m[2] !== undefined) out.push(<em key={k}>{inline(m[2], openDoc, k)}</em>);
    else {
      const label = m[3];
      const to = isPlaceholder(label) ? null : target(m[4]);
      if (!to) out.push(label);
      else if ('doc' in to) {
        out.push(
          <a
            key={k}
            href={'#/legal/' + to.doc}
            onClick={(e) => {
              e.preventDefault();
              openDoc(to.doc);
            }}
          >
            {label}
          </a>,
        );
      } else {
        out.push(
          <a key={k} href={to.url} target="_blank" rel="noreferrer noopener">
            {label}
          </a>,
        );
      }
    }
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** One document: its title, when it last changed, then every block. */
export function LegalArticle({ id, openDoc }: { id: string; openDoc: (id: string) => void }) {
  if (id === 'about') return <AboutCommunity openDoc={openDoc} />;
  const md = LEGAL_MARKDOWN[id];
  if (!md) return <Empty icon="info" title="This document isn't available." body="It may have moved. Choose one of the documents on the left." />;
  const blocks = parseMarkdown(md).filter((b) => !(b.type === 'p' && /^Last updated:/i.test(b.text)));
  const [first, ...rest] = blocks[0]?.type === 'h1' ? blocks : [{ type: 'h1' as const, text: LEGAL_DOCS.find((d) => d.id === id)?.label ?? '' }, ...blocks];
  return (
    <article className="st-legal-doc">
      <h1>{first.type === 'ul' ? '' : first.text}</h1>
      {UPDATED ? <p className="st-legal-updated">Last updated {UPDATED}</p> : null}
      {rest.map((b, i) =>
        b.type === 'ul' ? (
          <ul key={i}>
            {b.items.map((item, j) => (
              <li key={j}>{inline(item, openDoc, i + '-' + j)}</li>
            ))}
          </ul>
        ) : b.type === 'p' ? (
          <p key={i}>{inline(b.text, openDoc, String(i))}</p>
        ) : (
          React.createElement(b.type, { key: i }, inline(b.text, openDoc, String(i)))
        ),
      )}
    </article>
  );
}

/* ---------- About ---------- */

const FACTS: [string, string][] = [
  ['What Community keeps', 'Your profile, the photos and videos you post, your stories and memories, comments, likes, who you follow, and your messages. It also counts how many people have seen your posts and stories.'],
  ['Who can see it', 'Posts, Shorts and your profile are visible to everyone on Community, unless your account is private. Stories are visible to everyone, or only to your close friends when you choose that. Messages can only be opened by the people in the chat. Saved posts and your archive are only visible to you.'],
  ['What stays on this computer', 'Your appearance, language and accessibility choices. A photo or video only leaves your computer when you share it.'],
  ['Removing your data', 'You can delete any post, story, comment or memory from the place you see it. Deactivating your account, in Settings → Accounts Centre, hides everything at once and deletes it for good after 30 days.'],
];

/** What Community is, its version and the documents. Also shown in Settings → About. */
export function AboutCommunity({ openDoc }: { openDoc: (id: string) => void }) {
  return (
    <article className="st-legal-doc st-about">
      <div className="st-about-head">
        <Wordmark />
        <p>Version {__VERSION__}</p>
      </div>
      <p>
        Community is the app for a Seventh-day Adventist church family: share photos, videos, stories and Shorts, message and call each other, and read the Bible, the Hymnal and the Sabbath School lesson together. The same
        account works in the Community app on iPhone and here on the computer.
      </p>
      <h2>Policies</h2>
      <ul className="st-about-links">
        {LEGAL_DOCS.filter((d) => d.id !== 'about').map((d) => (
          <li key={d.id}>
            <a
              href={'#/legal/' + d.id}
              onClick={(e) => {
                e.preventDefault();
                openDoc(d.id);
              }}
            >
              <Icon name={d.icon} size={18} /> {d.label}
            </a>
          </li>
        ))}
      </ul>
      {FACTS.map(([title, body]) => (
        <React.Fragment key={title}>
          <h3>{title}</h3>
          <p>{body}</p>
        </React.Fragment>
      ))}
    </article>
  );
}

/* ---------- the page and the dialog ---------- */

/** /legal/:doc: the list of documents on the left, the chosen one on the right. */
export function Legal({ doc }: { doc: string }) {
  const id = doc === 'community-guidelines' ? 'guidelines' : doc;
  const open = (next: string) => nav('/legal/' + next);
  return (
    <div className="st-shell st-legal">
      <nav className="st-nav" aria-label="Legal">
        <h2 className="st-nav-title">Legal</h2>
        <div className="st-nav-list">
          {LEGAL_DOCS.map((d) => (
            <Link key={d.id} to={'/legal/' + d.id} className={'st-nav-item' + (d.id === id ? ' on' : '')}>
              <Icon name={d.icon} size={22} />
              <span className="st-nav-text">
                <span>{d.label}</span>
                {d.id !== 'about' && UPDATED ? <small>Last updated {UPDATED}</small> : null}
              </span>
            </Link>
          ))}
        </div>
      </nav>
      <div className="st-body">
        <div className="st-page wide">
          <LegalArticle id={id} openDoc={open} />
        </div>
      </div>
    </div>
  );
}

/** A document in a dialog over the current screen (sign-up, onboarding); its links open the others in place. */
export function LegalDialog({ doc, onClose }: { doc: string; onClose: () => void }) {
  const [id, setId] = useState(doc);
  return (
    <Modal onClose={onClose} wide className="st-legal-modal" title={LEGAL_DOCS.find((d) => d.id === id)?.label ?? 'Legal'}>
      <div className="st-legal-scroll">
        <LegalArticle id={id} openDoc={setId} />
      </div>
    </Modal>
  );
}
