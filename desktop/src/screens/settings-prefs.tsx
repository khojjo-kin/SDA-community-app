// Settings pages about what you see and how the app looks: Content preferences, Like and share
// counts, Chat streaks, Appearance, Archiving, Language and Accessibility.
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { updateProfile } from 'shared/api';
import { LANGUAGES, languageName } from 'shared/i18n';
import { loadPrefs, setPrefs, usePrefs } from 'shared/prefs';
import { setAppearance, useAppearance } from '../lib/appearance';
import { useMe } from '../lib/me';
import { Icon, Modal, toastError } from '../ui/kit';
import { Block, Card, LinkRow, Notice, Page, RadioRow, ToggleRow, useProfileFlag } from './settings-ui';

// The small choices kept on this computer, read once when the app starts (as the iPhone does).
loadPrefs();

/** This computer's language if Community has it, otherwise English (i18n.ts's phoneLanguage, without loading every translation). */
function computerLanguage(): string {
  const aliases: Record<string, string> = { ak: 'tw', twi: 'tw', fil: 'tl', in: 'id' };
  const base = (navigator.language || 'en').toLowerCase().split(/[-_]/)[0];
  const code = aliases[base] ?? base;
  return LANGUAGES.some((l) => l.code === code) ? code : 'en';
}

/* ---------- Content preferences ---------- */

/** Church topics to start from: the iPhone's list. What is saved is the English name. */
const SUGGESTED = ['Worship music', 'Hymns', 'Sermons', 'Bible study', 'Prayer', 'Youth', 'Pathfinders', 'Health', 'Cooking', 'Family', 'Mission stories', 'Choir', 'Testimonies', 'Creation and nature', 'Sabbath School', "Children's stories"];
const MAX_TOPICS = 20;
const MAX_TOPIC_LENGTH = 30;

const sameTopic = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
/** A topic in the middle of a sentence: "hymns", but "Bible study" and "Sabbath School" keep their capitals. */
const phrase = (t: string) => (/^(Bible|Pathfinders|Sabbath)/.test(t) ? t : t.charAt(0).toLowerCase() + t.slice(1));

/** "hymns", "hymns and youth", "hymns, youth and health", with "and 2 more" past four. */
function listOf(items: string[]): string {
  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;
  if (extra > 0) return `${shown.join(', ')} and ${extra} more`;
  if (shown.length === 1) return shown[0];
  return `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

type Which = 'more' | 'less';

export function ContentPrefs() {
  const { me } = useMe();
  const [more, setMore] = useState<string[]>(me.interests_more ?? []);
  const [less, setLess] = useState<string[]>(me.interests_less ?? []);
  const [filter, setFilter] = useState<'less' | 'standard'>(me.sensitive_filter ?? 'standard');
  const [adding, setAdding] = useState<Which | null>(null);
  const [custom, setCustom] = useState('');
  // Saves go one after another, so quick clicks reach the database in the order they were made.
  const queue = useRef<Promise<void>>(Promise.resolve());
  const restricted = me.restricted === true;

  function save(patch: { interests_more?: string[]; interests_less?: string[]; sensitive_filter?: 'less' | 'standard' }, undo: () => void) {
    queue.current = queue.current.then(() =>
      updateProfile(me.id, patch).catch((e) => {
        undo();
        toastError(e);
      }),
    );
  }
  function setTopics(nextMore: string[], nextLess: string[]) {
    const was = { more, less };
    setMore(nextMore);
    setLess(nextLess);
    save({ interests_more: nextMore, interests_less: nextLess }, () => {
      setMore(was.more);
      setLess(was.less);
    });
  }
  /** A topic can't be wanted and unwanted at once, so adding it to one list takes it off the other. */
  function add(which: Which, raw: string) {
    const topic = raw.trim().replace(/\s+/g, ' ').slice(0, MAX_TOPIC_LENGTH);
    if (!topic) return;
    const list = which === 'more' ? more : less;
    if (list.some((t) => sameTopic(t, topic))) return;
    if (list.length >= MAX_TOPICS) return toastError(new Error(`You can choose up to ${MAX_TOPICS} topics.`));
    const other = (which === 'more' ? less : more).filter((t) => !sameTopic(t, topic));
    if (which === 'more') setTopics([...more, topic], other);
    else setTopics(other, [...less, topic]);
  }
  function remove(which: Which, topic: string) {
    if (which === 'more') setTopics(more.filter((t) => t !== topic), less);
    else setTopics(more, less.filter((t) => t !== topic));
  }
  function chooseFilter(next: 'less' | 'standard') {
    if (next === filter) return;
    const was = filter;
    setFilter(next);
    save({ sensitive_filter: next }, () => setFilter(was));
  }

  const section = (which: Which, title: string) => {
    const topics = which === 'more' ? more : less;
    return (
      <Block title={title}>
        <div className="st-chips" data-list={which}>
          {topics.map((t) => (
            <button key={t} className="st-chip topic" onClick={() => remove(which, t)} aria-label={`Remove ${t}`}>
              {t} <Icon name="close" size={14} stroke={2.4} />
            </button>
          ))}
          {topics.length < MAX_TOPICS ? (
            <button className="st-chip add" onClick={() => setAdding(which)} aria-label={which === 'more' ? 'Add a topic to see more of' : 'Add a topic to see less of'}>
              <Icon name="plus" size={15} stroke={2.4} /> Add
            </button>
          ) : null}
        </div>
      </Block>
    );
  };
  const list = adding === 'less' ? less : more;
  return (
    <Page title="Content preferences" intro="What you see more and less of in For you, Explore and Shorts. Your own posts and the people you follow always show.">
      <div className="st-summary">
        <Icon name="sparkle" size={22} />
        <b>{more.length ? `Lately you're into ${listOf(more.map(phrase))}.` : "Tell us what you'd like to see."}</b>
      </div>
      {section('more', 'What you want to see more of')}
      {section('less', 'What you want to see less of')}
      <Block title="Sensitive content" note={restricted ? 'Members under 14 never see posts marked as sensitive.' : 'Less hides posts marked as sensitive from For you, Explore and Shorts.'}>
        <Card>
          <RadioRow name="sensitive" title="Standard" checked={!restricted && filter === 'standard'} disabled={restricted} onChange={() => chooseFilter('standard')} />
          <RadioRow name="sensitive" title="Less" checked={restricted || filter === 'less'} disabled={restricted} onChange={() => chooseFilter('less')} />
        </Card>
      </Block>
      {adding ? (
        <Modal title={adding === 'more' ? 'See more of' : 'See less of'} onClose={() => { setAdding(null); setCustom(''); }} wide>
          <div className="st-modal-body">
            <div className="st-chips">
              {SUGGESTED.map((s) => {
                const on = list.some((t) => sameTopic(t, s));
                return (
                  <button key={s} className={'st-chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => (on ? remove(adding, list.find((t) => sameTopic(t, s))!) : add(adding, s))}>
                    {on ? <Icon name="check" size={14} stroke={2.6} /> : null} {s}
                  </button>
                );
              })}
            </div>
            <form
              className="st-inline-form"
              onSubmit={(e) => {
                e.preventDefault();
                add(adding, custom);
                setCustom('');
              }}
            >
              <input className="st-input" value={custom} maxLength={MAX_TOPIC_LENGTH} placeholder="Something else? Type a topic" aria-label="Your own topic" onChange={(e) => setCustom(e.target.value)} />
              <button className="btn" disabled={!custom.trim()}>
                Add
              </button>
            </form>
            <button className="btn block big quiet" onClick={() => { setAdding(null); setCustom(''); }}>
              Done
            </button>
          </div>
        </Modal>
      ) : null}
    </Page>
  );
}

/* ---------- Like and share counts ---------- */

export function LikeCounts() {
  const [on, set] = useProfileFlag('show_view_counts');
  return (
    <Page title="Like and share counts">
      <Card>
        <ToggleRow title="Show view counts" sub="Others see how many people viewed your posts and Shorts on your profile. Turn this off to keep the numbers to yourself." on={on} onChange={set} />
      </Card>
      <p className="st-text st-gap-top">You can also hide the like count on any post when you share it. You always see your own numbers in your dashboard.</p>
    </Page>
  );
}

/* ---------- Chat streaks ---------- */

export function ChatStreaks() {
  const [on, set] = useProfileFlag('streaks_enabled');
  return (
    <Page title="Chat streaks">
      <Card>
        <ToggleRow icon="flame" title="Chat streaks" sub="Show how many days in a row you and a friend have chatted. If either of you turns this off, neither sees the streak." on={on} onChange={set} />
      </Card>
    </Page>
  );
}

/* ---------- Appearance ---------- */

export function Appearance() {
  const look = useAppearance();
  return (
    <Page title="Appearance" intro="Kept on this computer. Photos, videos, stories, Shorts, calls and live stay dark in both.">
      <Card>
        <RadioRow name="appearance" icon="moon" title="Dark" checked={look === 'dark'} onChange={() => setAppearance('dark')} />
        <RadioRow name="appearance" icon="sun" title="White" checked={look === 'white'} onChange={() => setAppearance('white')} />
      </Card>
    </Page>
  );
}

/* ---------- Archiving ---------- */

export function Archiving() {
  const { me } = useMe();
  return (
    <Page title="Archiving" intro="Your stories, saved posts and what you've done on Community, all in one place. Only you can see them.">
      <Card>
        <LinkRow icon="archive" title="Stories archive" sub="Every story you've shared is kept here after 24 hours. Make highlights from it." to="/archive" />
        <LinkRow icon="bookmark" title="Saved" sub="Posts and Shorts you've saved." to={'/u/' + me.username + '/saved'} />
        <LinkRow icon="activity" title="Your activity" sub="Your likes, comments and account history." to="/activity" />
      </Card>
    </Page>
  );
}

/* ---------- Language ---------- */

export function Language() {
  const { language } = usePrefs();
  const [q, setQ] = useState('');
  const n = q.trim().toLowerCase();
  // A language is found by its own name, its English name or its code ("fr").
  const shown = n ? LANGUAGES.filter((l) => `${l.native} ${l.name} ${l.code}`.toLowerCase().includes(n)) : LANGUAGES;
  return (
    <Page title="Language" intro="The Community app's language. Community for desktop is in English for now: your choice is kept on this computer for when more of it is translated. The iPhone app has its own Language setting.">
      <input className="st-input st-search-input" placeholder="Search languages" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search languages" />
      <Card>
        <RadioRow name="language" title="Use this computer's language" sub={'Community in ' + languageName(computerLanguage())} checked={language === ''} onChange={() => setPrefs({ language: '' })} />
      </Card>
      {shown.length ? (
        <Card className="st-languages">
          {shown.map((l) => (
            <RadioRow key={l.code} name="language" title={l.native} sub={l.name} checked={language === l.code} onChange={() => setPrefs({ language: l.code })} />
          ))}
        </Card>
      ) : (
        <p className="st-empty-line">No languages found. Try a different name.</p>
      )}
    </Page>
  );
}

/* ---------- Accessibility ---------- */

const MOTION = 'community.reduceMotion';
const motionListeners = new Set<() => void>();
const readMotion = () => {
  try {
    return localStorage.getItem(MOTION) === '1';
  } catch {
    return false;
  }
};
let reduceMotion = readMotion();
const applyMotion = () => {
  if (reduceMotion) document.documentElement.dataset.motion = 'reduce';
  else delete document.documentElement.dataset.motion;
};
applyMotion();

function setReduceMotion(on: boolean) {
  reduceMotion = on;
  try {
    localStorage.setItem(MOTION, on ? '1' : '0');
  } catch {
    // lasts until the app closes
  }
  applyMotion();
  motionListeners.forEach((l) => l());
}

const SHORTCUTS: [string, string][] = [
  ['⌘ N  or  Ctrl N', 'New post'],
  ['⌘ K  or  Ctrl K', 'Search'],
  ['← →', 'Previous and next story'],
  ['Esc', 'Close a dialog, menu or story'],
  ['Tab', 'Move between buttons and fields'],
];

export function Accessibility() {
  const on = useSyncExternalStore(
    (l) => {
      motionListeners.add(l);
      return () => motionListeners.delete(l);
    },
    () => reduceMotion,
  );
  useEffect(() => applyMotion(), []);
  return (
    <Page title="Accessibility">
      <Card>
        <ToggleRow icon="access" title="Reduce motion" sub="Turns off animations such as zooming dialogs, sliding panels and fading pictures. Your computer's own reduce motion setting is followed too." on={on} onChange={setReduceMotion} />
      </Card>
      <Block title="Keyboard shortcuts">
        <Card>
          {SHORTCUTS.map(([keys, what]) => (
            <div key={what} className="st-row st-fact">
              <span className="st-row-text">
                <b>{what}</b>
              </span>
              <kbd className="st-kbd">{keys}</kbd>
            </div>
          ))}
        </Card>
      </Block>
      <Notice icon="text">To make everything larger, use your browser's or the Mac's zoom: ⌘ and + to zoom in, ⌘ and − to zoom out.</Notice>
    </Page>
  );
}
