// Settings pages about what you see and how the app looks: Content preferences, Like and share
// counts, Chat streaks, Appearance (with the app font and chat wallpaper), Archiving, Language and
// Accessibility.
import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { updateProfile } from 'shared/api';
import { LANGUAGES, languageName } from 'shared/i18n';
import { loadPrefs, setPrefs, usePrefs } from 'shared/prefs';
import { setAppearance, useAppearance } from '../lib/appearance';
import { useMe } from '../lib/me';
import { languageCode, t } from '../lib/i18n';
import { Icon, Modal, toastError } from '../ui/kit';
import { FontChooser, WallpaperRow } from './settings-media';
import { Block, Card, LinkRow, Page, RadioRow, ToggleRow, useProfileFlag } from './settings-ui';

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

/**
 * Church topics to start from: the iPhone's list. `label` is the English name, which is what is saved
 * (so a topic stays chosen when the language changes); `name` and `phrase` are the iPhone's keys for
 * showing it: on its chip, and in the middle of a sentence.
 */
const SUGGESTED: { label: string; name: string; phrase: string }[] = [
  { label: 'Worship music', name: 'feed.topic.worshipMusic', phrase: 'feed.topicIn.worshipMusic' },
  { label: 'Hymns', name: 'feed.topic.hymns', phrase: 'feed.topicIn.hymns' },
  { label: 'Sermons', name: 'feed.topic.sermons', phrase: 'feed.topicIn.sermons' },
  { label: 'Bible study', name: 'feed.topic.bibleStudy', phrase: 'feed.topicIn.bibleStudy' },
  { label: 'Prayer', name: 'feed.topic.prayer', phrase: 'feed.topicIn.prayer' },
  { label: 'Youth', name: 'feed.topic.youth', phrase: 'feed.topicIn.youth' },
  { label: 'Pathfinders', name: 'feed.topic.pathfinders', phrase: 'feed.topicIn.pathfinders' },
  { label: 'Health', name: 'feed.topic.health', phrase: 'feed.topicIn.health' },
  { label: 'Cooking', name: 'feed.topic.cooking', phrase: 'feed.topicIn.cooking' },
  { label: 'Family', name: 'feed.topic.family', phrase: 'feed.topicIn.family' },
  { label: 'Mission stories', name: 'feed.topic.missionStories', phrase: 'feed.topicIn.missionStories' },
  { label: 'Choir', name: 'feed.topic.choir', phrase: 'feed.topicIn.choir' },
  { label: 'Testimonies', name: 'feed.topic.testimonies', phrase: 'feed.topicIn.testimonies' },
  { label: 'Creation and nature', name: 'feed.topic.creation', phrase: 'feed.topicIn.creation' },
  { label: 'Sabbath School', name: 'feed.topic.sabbathSchool', phrase: 'feed.topicIn.sabbathSchool' },
  { label: "Children's stories", name: 'feed.topic.childrensStories', phrase: 'feed.topicIn.childrensStories' },
];
const MAX_TOPICS = 20;
const MAX_TOPIC_LENGTH = 30;

const sameTopic = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const suggested = (topic: string) => SUGGESTED.find((s) => sameTopic(s.label, topic));

/** A topic as it shows on its chip: a suggested one in the app's language, the member's own as they typed it. */
const nameOf = (topic: string) => {
  const s = suggested(topic);
  return s ? t(s.name) : topic;
};

/**
 * A topic in the middle of a sentence: "hymns", but "Bible study" and "Sabbath School" keep their
 * capitals. The member's own topics are written small only in English; other languages keep them as typed.
 */
const phrase = (topic: string) => {
  const s = suggested(topic);
  if (s) return t(s.phrase);
  if (languageCode() !== 'en') return topic;
  return /^(Bible|Pathfinders|Sabbath)/.test(topic) ? topic : topic.charAt(0).toLowerCase() + topic.slice(1);
};

/** "hymns", "hymns and youth", "hymns, youth and health", with "and 2 more" past four (the iPhone's words). */
function listOf(items: string[]): string {
  const shown = items.slice(0, 4);
  const extra = items.length - shown.length;
  const comma = t('feed.listComma');
  if (extra > 0) return t('feed.listMore', { items: shown.join(comma), count: extra });
  if (shown.length === 1) return shown[0];
  return t('feed.listAnd', { items: shown.slice(0, -1).join(comma), last: shown[shown.length - 1] });
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
    if (list.some((x) => sameTopic(x, topic))) return;
    if (list.length >= MAX_TOPICS) return toastError(new Error(t('feed.maxTopics', { count: MAX_TOPICS })));
    const other = (which === 'more' ? less : more).filter((x) => !sameTopic(x, topic));
    if (which === 'more') setTopics([...more, topic], other);
    else setTopics(other, [...less, topic]);
  }
  function remove(which: Which, topic: string) {
    if (which === 'more') setTopics(more.filter((x) => x !== topic), less);
    else setTopics(more, less.filter((x) => x !== topic));
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
          {topics.map((topic) => (
            <button key={topic} className="st-chip topic" onClick={() => remove(which, topic)} aria-label={t('d.settings-more.removeTopic', { topic: nameOf(topic) })}>
              {nameOf(topic)} <Icon name="close" size={14} stroke={2.4} />
            </button>
          ))}
          {topics.length < MAX_TOPICS ? (
            <button className="st-chip add" onClick={() => setAdding(which)} aria-label={which === 'more' ? t('feed.addMore') : t('feed.addLess')}>
              <Icon name="plus" size={15} stroke={2.4} /> {t('feed.add')}
            </button>
          ) : null}
        </div>
      </Block>
    );
  };
  const list = adding === 'less' ? less : more;
  return (
    <Page title={t('d.settings-more.contentTitle')}>
      {more.length ? (
        <div className="st-summary">
          <Icon name="sparkle" size={22} />
          <b>{t('feed.summary', { topics: listOf(more.map(phrase)) })}</b>
        </div>
      ) : null}
      {section('more', t('feed.moreTitle'))}
      {section('less', t('feed.lessTitle'))}
      <Block title={t('feed.sensitive')}>
        <Card>
          <RadioRow name="sensitive" title={t('feed.standard')} checked={!restricted && filter === 'standard'} disabled={restricted} onChange={() => chooseFilter('standard')} />
          <RadioRow name="sensitive" title={t('feed.less')} checked={restricted || filter === 'less'} disabled={restricted} onChange={() => chooseFilter('less')} />
        </Card>
      </Block>
      <Block title={t('tabs.clips')}>
        <Card>
          <LinkRow icon="reels" title={t('d.settings-more.shortsSettings')} to="/accounts/shorts" />
        </Card>
      </Block>
      {adding ? (
        <Modal title={adding === 'more' ? t('feed.seeMoreOf') : t('feed.seeLessOf')} onClose={() => { setAdding(null); setCustom(''); }} wide>
          <div className="st-modal-body">
            <div className="st-chips">
              {SUGGESTED.map((s) => {
                const on = list.some((x) => sameTopic(x, s.label));
                return (
                  <button key={s.label} className={'st-chip' + (on ? ' on' : '')} aria-pressed={on} onClick={() => (on ? remove(adding, list.find((x) => sameTopic(x, s.label))!) : add(adding, s.label))}>
                    {on ? <Icon name="check" size={14} stroke={2.6} /> : null} {t(s.name)}
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
              <input className="st-input" value={custom} maxLength={MAX_TOPIC_LENGTH} placeholder={t('d.settings-more.somethingElse')} aria-label={t('feed.ownTopic')} onChange={(e) => setCustom(e.target.value)} />
              <button className="btn" disabled={!custom.trim()}>
                {t('feed.add')}
              </button>
            </form>
            <button className="btn block big quiet" onClick={() => { setAdding(null); setCustom(''); }}>
              {t('feed.done')}
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
    <Page title={t('d.settings-more.likeCounts')}>
      <Card>
        <ToggleRow title={t('d.settings-more.showViewCounts')} on={on} onChange={set} />
      </Card>
    </Page>
  );
}

/* ---------- Chat streaks ---------- */

export function ChatStreaks() {
  const [on, set] = useProfileFlag('streaks_enabled');
  return (
    <Page title={t('settings.chatStreaks')}>
      <Card>
        <ToggleRow icon="flame" title={t('settings.chatStreaks')} on={on} onChange={set} />
      </Card>
    </Page>
  );
}

/* ---------- Appearance ---------- */

export function Appearance() {
  const look = useAppearance();
  return (
    <Page title={t('d.settings-more.appearance')}>
      <Card>
        <RadioRow name="appearance" icon="moon" title={t('theme.dark')} checked={look === 'dark'} onChange={() => setAppearance('dark')} />
        <RadioRow name="appearance" icon="sun" title={t('theme.white')} checked={look === 'white'} onChange={() => setAppearance('white')} />
      </Card>
      <Block title={t('settings.appFont')}>
        <FontChooser />
      </Block>
      <Block title={t('d.settings-more.chats')}>
        <Card>
          <WallpaperRow />
        </Card>
      </Block>
    </Page>
  );
}

/* ---------- Archiving ---------- */

export function Archiving() {
  const { me } = useMe();
  return (
    <Page title={t('d.settings-more.archiving')}>
      <Card>
        <LinkRow icon="archive" title={t('d.settings-more.storiesArchive')} to="/archive" />
        <LinkRow icon="bookmark" title={t('settings.saved')} to={'/u/' + me.username + '/saved'} />
        <LinkRow icon="activity" title={t('settings.yourActivity')} to="/activity" />
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
    <Page title={t('language.title')}>
      <input className="st-input st-search-input" placeholder={t('language.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('language.search')} />
      <Card>
        <RadioRow name="language" title={t('d.settings-more.computerLanguage')} sub={t('d.settings-more.computerLanguageSub', { name: languageName(computerLanguage()) })} checked={language === ''} onChange={() => setPrefs({ language: '' })} />
      </Card>
      {shown.length ? (
        <Card className="st-languages">
          {shown.map((l) => (
            <RadioRow key={l.code} name="language" title={l.native} sub={l.name} checked={language === l.code} onChange={() => setPrefs({ language: l.code })} />
          ))}
        </Card>
      ) : (
        <p className="st-empty-line">{t('language.noneFound')}</p>
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

/** The keys on a Mac, the keys on another computer (or '' when they are the same), and what they do (a key). */
const SHORTCUTS: [string, string, string][] = [
  ['⌘ N', 'Ctrl N', 'create.newPost'],
  ['⌘ K', 'Ctrl K', 'common.search'],
  ['← →', '', 'd.settings-more.shortcutStory'],
  ['Esc', '', 'd.settings-more.shortcutClose'],
  ['Tab', '', 'd.settings-more.shortcutTab'],
  // Making everything larger is the browser's (or the Mac's) zoom.
  ['⌘ +  ⌘ −', 'Ctrl +  Ctrl −', 'd.polish.zoom'],
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
    <Page title={t('d.settings-more.accessibility')}>
      <Card>
        <ToggleRow icon="access" title={t('d.settings-more.reduceMotion')} on={on} onChange={setReduceMotion} />
      </Card>
      <Block title={t('d.settings-more.shortcuts')}>
        <Card>
          {SHORTCUTS.map(([mac, pc, what]) => (
            <div key={what} className="st-row st-fact">
              <span className="st-row-text">
                <b>{t(what)}</b>
              </span>
              <kbd className="st-kbd">{pc ? t('d.settings-more.keysOr', { mac, pc }) : mac}</kbd>
            </div>
          ))}
        </Card>
      </Block>
    </Page>
  );
}
