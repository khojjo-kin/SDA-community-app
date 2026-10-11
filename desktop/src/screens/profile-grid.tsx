// The tabs under a profile (icons only, the open one underlined, as on Instagram's 2026 desktop
// profile) and what each shows: Posts as a grid of portrait 3:4 tiles, Shorts as tall tiles with view
// counts, Saved (your own only), Reposts and Tagged. A post opens the post dialog, which steps through
// the tab's posts; a Short opens the Shorts player at it, with the tab's other Shorts round it. Your
// own empty Posts and Shorts tabs write their invitation out letter by letter in a handwriting script
// and open Create.
import React, { useEffect, useState } from 'react';
import { fetchReposts, fetchSaved, fetchUserPosts } from 'shared/api';
import { listen, putPosts } from 'shared/store';
import { supabase } from 'shared/supabase';
import { fmt } from 'shared/theme';
import type { Post, Profile } from 'shared/types';
import { t, tn } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Empty, Failed, Icon, type IconName, useLoad } from '../ui/kit';
import { Tile } from '../ui/post';
import { type GridSource, LIST_SOURCE, gridIds, openShortsFrom } from '../ui/post-data';
import { GridSkeleton } from '../ui/skeleton';
import '../styles/profile.css';
import '../styles/posts.css';
import '../styles/polish.css';

export type ProfileTab = 'posts' | 'reels' | 'saved' | 'reposts' | 'tagged';

/**
 * Posts that tag someone, newest first. The shared data code has no call for this (the iPhone app has
 * no Tagged tab), so it reads the same view every other post list reads, filtered on its tagged_ids
 * column (version 20). The database's own rules decide which of them this viewer may see. The list is
 * checked again here, which changes nothing against the real database and keeps the demo honest.
 */
async function fetchTaggedPosts(userId: string): Promise<Post[]> {
  const { data, error } = await supabase.from('community_post_cards').select('*').or(`tagged_ids.cs.{${userId}}`).order('created_at', { ascending: false }).limit(90);
  if (error) throw error;
  const rows = ((data as Post[]) ?? []).filter((p) => (p.tagged_ids ?? []).includes(userId) && p.user_id !== userId);
  putPosts(rows);
  return rows;
}

/** The address of a profile tab. Shorts live at /u/name/shorts. */
export function tabPath(username: string, tab: ProfileTab): string {
  return '/u/' + username + (tab === 'posts' ? '' : '/' + (tab === 'reels' ? 'shorts' : tab));
}

export function ProfileTabs({ person, tab, mine }: { person: Profile; tab: ProfileTab; mine: boolean }) {
  const tabs: { id: ProfileTab; label: string; icon: IconName }[] = [
    { id: 'posts', label: t('profile.tab.posts'), icon: 'grid' },
    { id: 'reels', label: t('profile.tab.clips'), icon: 'reels' },
    ...(mine ? [{ id: 'saved' as ProfileTab, label: t('settings.saved'), icon: 'bookmark' as IconName }] : []),
    { id: 'reposts', label: t('profile.tab.reposts'), icon: 'repost' },
    { id: 'tagged', label: t('d.profile.tagged'), icon: 'tagged' },
  ];
  return (
    <nav className="profile-tabs prof-tabs" role="tablist" aria-label={t('tabs.profile')}>
      {tabs.map((it) => {
        const on = tab === it.id;
        const to = tabPath(person.username, it.id);
        return (
          <a
            key={it.id}
            href={'#' + to}
            role="tab"
            aria-selected={on}
            aria-label={it.label}
            title={it.label}
            className={'prof-tab' + (on ? ' on' : '')}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              nav(to, true);
            }}
          >
            <Icon name={it.icon} size={24} stroke={on ? 2 : 1.7} />
          </a>
        );
      })}
    </nav>
  );
}

/** A Short in its tab: tall, with how many times it has been watched. Opens the Shorts player at it. */
function ShortTile({ post, onOpen }: { post: Post; onOpen: (post: Post) => void }) {
  const m = post.media[0];
  const cover = m?.type === 'video' ? m.poster || '' : m?.url;
  useEffect(() => putPosts([post]), [post.id]);
  return (
    <button className="tile prof-short" data-post={post.id} onClick={() => onOpen(post)} aria-label={post.view_count != null ? t('d.profile.shortByViews', { username: post.username, count: fmt(post.view_count) }) : t('d.profile.shortBy', { username: post.username })}>
      {cover ? <img src={cover} alt="" loading="lazy" /> : m?.type === 'video' ? <video src={m.url} muted preload="metadata" /> : null}
      {post.view_count != null ? (
        <span className="prof-short-views">
          <Icon name="play" size={16} color="#fff" fill="#fff" stroke={0} /> {fmt(post.view_count)}
        </span>
      ) : null}
      <span className="tile-hover">
        <span>
          <Icon name="heart" size={20} color="#fff" fill="#fff" stroke={0} /> {fmt(post.like_count)}
        </span>
        <span>
          <Icon name="comment" size={20} color="#fff" fill="#fff" stroke={0} /> {fmt(post.comment_count)}
        </span>
      </span>
    </button>
  );
}

/**
 * Subscriber-only posts this viewer can't see yet, under the grid: centred words, the way a private
 * account says so, with no card around them (as on the iPhone). Only shown while subscriptions are on.
 */
function SubscriberCard({ person, onSubscribe }: { person: Profile; onSubscribe: () => void }) {
  const n = person.subscriber_posts ?? 0;
  return (
    <button className="prof-subcard po-subwords" onClick={onSubscribe}>
      <Icon name="lock" size={26} />
      <b>{tn('profile.subOnly', n, { count: fmt(n) })}</b>
      <span className="po-subwords-go">{t('profile.subscribeToSee')}</span>
    </button>
  );
}

/* ---------- words that write themselves ---------- */

/*
 * As the iPhone's WritingText (src/components/WritingText.tsx): letter by letter, with a soft cursor
 * blinking just after the last letter, then they rest; after a pause they write once more, then stay.
 * The whole line is laid out from the start (the letters still to come are clear), so nothing moves as
 * they appear. With "reduce motion" on, the words are simply there. On the empty profile they are
 * signed in a handwriting script, in the page's text colour (white in Dark), as the iPhone now signs
 * them, with a fine stroke drawn under them once written.
 */
const LETTER_MS = 52;
const SPACE_MS = 95;
const STOP_MS = 240;
const START_MS = 380;
const BLINK_FOR_MS = 2600;
const AGAIN_AFTER_MS = 7000;
const BLINK_STEPS = [1, 0.75, 0.4, 0.12, 0, 0, 0.12, 0.4, 0.75, 1, 1, 1];
const BLINK_STEP_MS = 85;

function delayAfter(ch: string): number {
  if (ch === ' ') return SPACE_MS;
  if (/[.,!?;:…]/.test(ch)) return STOP_MS;
  // A little unevenness reads as writing rather than a machine.
  return LETTER_MS + Math.round((Math.random() - 0.5) * 24);
}

/** True while the computer asks for less motion (System Settings → Accessibility → Display → Reduce motion). */
function useReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduce, setReduce] = useState(() => {
    try {
      return matchMedia(query).matches;
    } catch {
      return false;
    }
  });
  useEffect(() => {
    let m: MediaQueryList;
    try {
      m = matchMedia(query);
    } catch {
      return;
    }
    const on = () => setReduce(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduce;
}

export function WritingText({ text, again = true }: { text: string; again?: boolean }) {
  const reduce = useReducedMotion();
  // Letters as people see them (Array.from), so an accented letter or an emoji is one step.
  const letters = Array.from(text);
  const [shown, setShown] = useState(reduce ? letters.length : 0);
  // The cursor's opacity; 0 hides it, and it keeps its place in the line either way.
  const [cursor, setCursor] = useState(0);
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => void timers.push(setTimeout(fn, ms));
    if (reduce) {
      setShown(letters.length);
      setCursor(0);
      return;
    }
    let round = 0;
    const blink = (until: number, then: () => void) => {
      let step = 0;
      const tick = () => {
        const v = BLINK_STEPS[step % BLINK_STEPS.length];
        // Time's up: stop where it has faded right out, so it never just vanishes.
        if (Date.now() >= until && v === 0) {
          setCursor(0);
          then();
          return;
        }
        setCursor(v);
        step++;
        later(tick, BLINK_STEP_MS);
      };
      tick();
    };
    const write = (i: number) => {
      setShown(i);
      setCursor(1);
      if (i >= letters.length) {
        blink(Date.now() + BLINK_FOR_MS, () => {
          round++;
          if (again && round < 2) later(() => write(0), AGAIN_AFTER_MS);
        });
        return;
      }
      later(() => write(i + 1), delayAfter(letters[i]));
    };
    setShown(0);
    setCursor(0);
    later(() => write(0), START_MS);
    return () => timers.forEach(clearTimeout);
    // `letters` follows `text`.
  }, [text, reduce, again]);
  return (
    <span className={'pp-writing' + (shown >= letters.length ? ' done' : '')} data-shown={shown} data-total={letters.length}>
      <span className="pp-sr">{text}</span>
      <span aria-hidden="true">
        <span className="pp-written">{letters.slice(0, shown).join('')}</span>
        <span className="pp-cursor" style={{ opacity: cursor }} />
        <span className="pp-unwritten">{letters.slice(shown).join('')}</span>
      </span>
    </span>
  );
}

/**
 * The handwriting face: Snell Roundhand, the flowing script the iPhone signs with, which every Mac has;
 * elsewhere Great Vibes, a similar script from Google Fonts (asked for the first time it is needed, as
 * lib/font.ts does for the app's faces); the system's cursive face until it arrives or if it can't.
 */
const SCRIPT_CSS = 'https://fonts.googleapis.com/css2?family=Great+Vibes&display=swap';
function useScriptFace() {
  useEffect(() => {
    if (document.querySelector(`link[href="${SCRIPT_CSS}"]`)) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = SCRIPT_CSS;
    document.head.appendChild(link);
  }, []);
}

/** "Share your first post": on your own empty tab, the words sign themselves; a click opens Create. */
function ShareFirst({ icon, title, onClick }: { icon: IconName; title: string; onClick: () => void }) {
  useScriptFace();
  return (
    <div className="empty pp-first-wrap">
      <button type="button" className="pp-first po-signed" onClick={onClick} aria-label={title}>
        <span className="empty-ring">
          <Icon name={icon} size={34} stroke={1.5} />
        </span>
        <span className="pp-first-title po-script">
          <WritingText text={title} />
        </span>
      </button>
    </div>
  );
}

export function ProfileGrid({ person, tab, mine, openPost, onCreate, onSubscribe }: { person: Profile; tab: ProfileTab; mine: boolean; openPost: (id: string, list?: string[]) => void; onCreate: (m: 'post' | 'story' | 'short') => void; onSubscribe: () => void }) {
  const { me } = useMe();
  const { data, error, loading, reload } = useLoad<Post[]>(async () => {
    if (tab === 'saved') return mine ? fetchSaved(me.id) : [];
    if (tab === 'reposts') return fetchReposts(person.id);
    if (tab === 'tagged') return fetchTaggedPosts(person.id);
    const all = await fetchUserPosts(person.id);
    return tab === 'reels' ? all.filter((p) => p.kind === 'reel') : all;
  }, [person.id, tab]);
  useEffect(() => listen('profile', reload), [person.id, tab]);
  useEffect(() => listen('feed', reload), [person.id, tab]);

  // While the tab loads, the shape of its grid shimmers where the tiles will be.
  if (loading && !data) return <GridSkeleton kind={tab === 'reels' ? 'shorts' : 'posts'} count={tab === 'reels' ? 8 : 9} />;
  if (error) return <Failed error={error} retry={reload} />;
  const posts = data ?? [];
  // Posts kept for subscribers, which this viewer can't see yet.
  // Only while the creator has subscriptions on: with them off there is nothing to offer (as on the iPhone).
  const locked = tab === 'posts' && !mine && !person.subscribed && (person.subscriber_posts ?? 0) > 0 && !!person.sub_price_pence ? <SubscriberCard person={person} onSubscribe={onSubscribe} /> : null;

  if (!posts.length) {
    if (locked) return <div className="prof-grid-end">{locked}</div>;
    switch (tab) {
      case 'saved':
        return <Empty icon="bookmark" title={t('ssPub.save')} />;
      case 'reposts':
        return <Empty icon="repost" title={t('profile.emptyNoReposts')} />;
      case 'tagged':
        return <Empty icon="tagged" title={mine ? t('d.profile.photosOfYou') : t('d.profile.noPhotos')} />;
      case 'reels':
        return mine ? (
          <ShareFirst icon="reels" title={t('d.profile.firstShort')} onClick={() => onCreate('short')} />
        ) : (
          <Empty icon="reels" title={t('d.profile.noShorts')} />
        );
      default:
        return mine ? (
          <ShareFirst icon="camera" title={t('profile.shareFirstPost')} onClick={() => onCreate('post')} />
        ) : (
          <Empty icon="camera" title={t('profile.emptyNoPosts')} />
        );
    }
  }
  // The post dialog steps through what this tab shows; a Short opens the Shorts player, and more of
  // the same come from this profile (Posts and Shorts) or nowhere (Saved, Reposts, Tagged: fixed lists).
  const source: GridSource = tab === 'posts' || tab === 'reels' ? { from: 'user', userId: person.id } : LIST_SOURCE;
  const ids = gridIds(posts, me);
  const open = (id: string) => openPost(id, ids);
  const openShort = (p: Post) => openShortsFrom(p, posts, source, me);
  return (
    <>
      <div className={'grid prof-grid' + (tab === 'reels' ? ' shorts' : '')} role="tabpanel">
        {posts.map((p) => (tab === 'reels' ? <ShortTile key={p.id} post={p} onOpen={openShort} /> : <Tile key={p.id} post={p} onOpen={open} grid={posts} source={source} />))}
      </div>
      {locked ? <div className="prof-grid-end">{locked}</div> : null}
    </>
  );
}
