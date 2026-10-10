// The tabs under a profile (icons only, the open one underlined, as on Instagram's 2026 desktop
// profile) and what each shows: Posts as a grid of portrait 3:4 tiles, Shorts as tall tiles with view
// counts, Saved (your own only), Reposts and Tagged.
import React, { useEffect } from 'react';
import { fetchReposts, fetchSaved, fetchUserPosts } from 'shared/api';
import { listen, putPosts } from 'shared/store';
import { supabase } from 'shared/supabase';
import { fmt } from 'shared/theme';
import type { Post, Profile } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Empty, Failed, Icon, type IconName, Spinner, useLoad } from '../ui/kit';
import { Tile } from '../ui/post';
import '../styles/profile.css';

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

/** A Short in its tab: tall, with how many times it has been watched. */
function ShortTile({ post, onOpen }: { post: Post; onOpen: (id: string) => void }) {
  const m = post.media[0];
  const cover = m?.type === 'video' ? m.poster || '' : m?.url;
  useEffect(() => putPosts([post]), [post.id]);
  return (
    <button className="tile prof-short" onClick={() => onOpen(post.id)} aria-label={'Short by ' + post.username + (post.view_count != null ? ', ' + fmt(post.view_count) + ' views' : '')}>
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

export function ProfileGrid({ person, tab, mine, openPost, onCreate, onSubscribe }: { person: Profile; tab: ProfileTab; mine: boolean; openPost: (id: string) => void; onCreate: (m: 'post' | 'story' | 'short') => void; onSubscribe: () => void }) {
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
        return (
          <Empty icon="reels" title={mine ? 'Share a Short' : 'No Shorts yet'} body={mine ? 'Videos you post appear here.' : `Videos from ${name} will show up here.`}>
            {mine ? (
              <button className="link-btn" onClick={() => onCreate('short')}>
                Create your first Short
              </button>
            ) : null}
          </Empty>
        );
      default:
        return (
          <Empty icon="camera" title={mine ? 'Share photos' : 'No posts yet'} body={mine ? 'When you share photos, they will appear on your profile.' : `When ${name} posts, it will show up here.`}>
            {mine ? (
              <button className="link-btn" onClick={() => onCreate('post')}>
                Share your first photo
              </button>
            ) : null}
          </Empty>
        );
    }
  }
  return (
    <>
      <div className={'grid prof-grid' + (tab === 'reels' ? ' shorts' : '')} role="tabpanel">
        {posts.map((p) => (tab === 'reels' ? <ShortTile key={p.id} post={p} onOpen={openPost} /> : <Tile key={p.id} post={p} onOpen={openPost} />))}
      </div>
      {locked ? <div className="prof-grid-end">{locked}</div> : null}
    </>
  );
}
