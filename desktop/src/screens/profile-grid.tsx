// The tabs under a profile (icons only, the open one underlined, as on Instagram's 2026 desktop
// profile) and what each shows: Posts as a grid of portrait 3:4 tiles, Shorts as tall tiles with view
// counts, Saved (your own only), Reposts and Tagged. A post opens the post dialog, which steps through
// the tab's posts; a Short opens the Shorts player at it, with the tab's other Shorts round it. Your
// own empty Posts and Shorts tabs write their invitation out letter by letter and open Create.
import React, { useEffect, useState } from 'react';
import { fetchReposts, fetchSaved, fetchUserPosts } from 'shared/api';
import { listen, putPosts } from 'shared/store';
import { supabase } from 'shared/supabase';
import { fmt } from 'shared/theme';
import type { Post, Profile } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Empty, Failed, Icon, type IconName, Spinner, useLoad } from '../ui/kit';
import { Tile } from '../ui/post';
import { type GridSource, LIST_SOURCE, gridIds, openShortsFrom } from '../ui/post-data';
import '../styles/profile.css';
import '../styles/posts.css';

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
    { id: 'posts', label: 'Posts', icon: 'grid' },
    { id: 'reels', label: 'Shorts', icon: 'reels' },
    ...(mine ? [{ id: 'saved' as ProfileTab, label: 'Saved', icon: 'bookmark' as IconName }] : []),
    { id: 'reposts', label: 'Reposts', icon: 'repost' },
    { id: 'tagged', label: 'Tagged', icon: 'tagged' },
  ];
  return (
    <nav className="profile-tabs prof-tabs" role="tablist" aria-label="Profile">
      {tabs.map((t) => {
        const on = tab === t.id;
        const to = tabPath(person.username, t.id);
        return (
          <a
            key={t.id}
            href={'#' + to}
            role="tab"
            aria-selected={on}
            aria-label={t.label}
            title={t.label}
            className={'prof-tab' + (on ? ' on' : '')}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              nav(to, true);
            }}
          >
            <Icon name={t.icon} size={24} stroke={on ? 2 : 1.7} />
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
    <button className="tile prof-short" data-post={post.id} onClick={() => onOpen(post)} aria-label={'Short by ' + post.username + (post.view_count != null ? ', ' + fmt(post.view_count) + ' views' : '')}>
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

/** Subscriber-only posts this viewer can't see yet, as a card after the grid. */
function SubscriberCard({ person, onSubscribe }: { person: Profile; onSubscribe: () => void }) {
  const n = person.subscriber_posts ?? 0;
  return (
    <button className="prof-subcard" onClick={onSubscribe} disabled={!person.sub_price_pence}>
      <span className="prof-card-icon accent">
        <Icon name="lock" size={20} />
      </span>
      <span className="prof-card-text">
        <b>
          {fmt(n)} subscriber-only {n === 1 ? 'post' : 'posts'}
        </b>
        <span className="prof-card-sub">{person.sub_price_pence ? 'Subscribe to see them' : 'Only their subscribers can see them'}</span>
      </span>
      {person.sub_price_pence ? <Icon name="right" size={18} /> : null}
    </button>
  );
}

/* ---------- words that write themselves ---------- */

/*
 * As the iPhone's WritingText (src/components/WritingText.tsx): letter by letter in the app's green,
 * with a soft cursor blinking just after the last letter, then they rest; after a pause they write once
 * more, then stay. The whole line is laid out from the start (the letters still to come are clear), so
 * nothing moves as they appear. With "reduce motion" on, the words are simply there.
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
    <span className="pp-writing" data-shown={shown} data-total={letters.length}>
      <span className="pp-sr">{text}</span>
      <span aria-hidden="true">
        <span className="pp-written">{letters.slice(0, shown).join('')}</span>
        <span className="pp-cursor" style={{ opacity: cursor }} />
        <span className="pp-unwritten">{letters.slice(shown).join('')}</span>
      </span>
    </span>
  );
}

/** "Share your first photo or Short": on your own empty tab, the words write themselves; a click opens Create. */
function ShareFirst({ icon, title, body, onClick }: { icon: IconName; title: string; body: string; onClick: () => void }) {
  return (
    <div className="empty pp-first-wrap">
      <button type="button" className="pp-first" onClick={onClick} aria-label={title}>
        <span className="empty-ring">
          <Icon name={icon} size={34} stroke={1.5} />
        </span>
        <span className="pp-first-title">
          <WritingText text={title} />
        </span>
        <span className="pp-first-body">{body}</span>
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

  if (loading && !data) return <Spinner />;
  if (error) return <Failed error={error} retry={reload} />;
  const posts = data ?? [];
  // Posts kept for subscribers, which this viewer can't see yet.
  const locked = tab === 'posts' && !mine && !person.subscribed && (person.subscriber_posts ?? 0) > 0 ? <SubscriberCard person={person} onSubscribe={onSubscribe} /> : null;

  if (!posts.length) {
    if (locked) return <div className="prof-grid-end">{locked}</div>;
    const name = person.username;
    switch (tab) {
      case 'saved':
        return <Empty icon="bookmark" title="Save" body="Save photos and videos that you want to see again. No one is notified, and only you can see what you've saved." />;
      case 'reposts':
        return <Empty icon="repost" title="No reposts yet" body={mine ? 'Posts you repost appear here.' : `Posts ${name} reposts will show up here.`} />;
      case 'tagged':
        return <Empty icon="tagged" title={mine ? 'Photos of you' : 'No photos yet'} body={mine ? "When people tag you in photos, they'll appear here." : `When people tag ${name} in photos, they'll appear here.`} />;
      case 'reels':
        return mine ? (
          <ShareFirst icon="reels" title="Share your first Short" body="Videos you post appear here. Click to make one." onClick={() => onCreate('short')} />
        ) : (
          <Empty icon="reels" title="No Shorts yet" body={`Videos from ${name} will show up here.`} />
        );
      default:
        return mine ? (
          <ShareFirst icon="camera" title="Share your first photo or Short" body="Click to add a post to your profile." onClick={() => onCreate('post')} />
        ) : (
          <Empty icon="camera" title="No posts yet" body={`When ${name} posts, it will show up here.`} />
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
