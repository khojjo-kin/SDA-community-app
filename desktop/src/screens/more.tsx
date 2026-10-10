// Settings (built in settings-frame.tsx and the settings-*.tsx pages) and Your activity. The Hymnal,
// Churches, and Communities and pages are in hymnal.tsx, churches.tsx and groups.tsx.
import React from 'react';
import { fetchLiked, fetchMyComments } from 'shared/api';
import { supabase } from 'shared/supabase';
import { getPostNow } from 'shared/store';
import { ago, agoLong } from 'shared/theme';
import type { Comment, Post } from 'shared/types';
import type { Session } from '../lib/admin';
import { useMe } from '../lib/me';
import { parts, useRoute } from '../lib/router';
import { Avatar, Empty, Failed, Icon, type IconName, Link, Spinner, useLoad } from '../ui/kit';
import { Tile } from '../ui/post';

/* ---------- settings (in settings-frame.tsx) ---------- */

export { Settings } from './settings-frame';

/* ---------- your activity ---------- */

const ACTIVITY: { group: string; items: { id: string; label: string; icon: IconName; to?: string }[] }[] = [
  {
    group: 'Interactions',
    items: [
      { id: 'likes', label: 'Likes', icon: 'heart' },
      { id: 'comments', label: 'Comments', icon: 'comment' },
    ],
  },
  {
    group: 'Content you shared',
    items: [
      { id: 'posts', label: 'Posts and Shorts', icon: 'grid', to: 'profile' },
      { id: 'archive', label: 'Stories archive', icon: 'archive', to: '/archive' },
    ],
  },
  { group: 'Account history', items: [{ id: 'history', label: 'Account history', icon: 'clock' }] },
];

/** Your activity: the same two-column layout as Settings, with likes, comments and account history. */
export function Activity({ openPost }: { openPost: (id: string) => void }) {
  const { me } = useMe();
  const route = useRoute();
  const asked = parts(route)[1];
  const tab = asked === 'comments' || asked === 'history' ? asked : 'likes';
  return (
    <div className="st-shell">
      <nav className="st-nav" aria-label="Your activity">
        <h2 className="st-nav-title">Your activity</h2>
        <div className="st-nav-list">
          {ACTIVITY.map((g) => (
            <div key={g.group} className="st-group">
              <h3 className="st-group-h">{g.group}</h3>
              {g.items.map((it) => (
                <Link key={it.id} to={it.to === 'profile' ? '/u/' + me.username : it.to ?? '/activity/' + it.id} className={'st-nav-item' + (it.id === tab ? ' on' : '')}>
                  <Icon name={it.icon} />
                  <span className="st-nav-text">
                    <span>{it.label}</span>
                  </span>
                </Link>
              ))}
            </div>
          ))}
        </div>
      </nav>
      <div className="st-body">{tab === 'likes' ? <LikedPosts openPost={openPost} /> : tab === 'comments' ? <MyComments openPost={openPost} /> : <AccountHistory />}</div>
    </div>
  );
}

function LikedPosts({ openPost }: { openPost: (id: string) => void }) {
  const { me } = useMe();
  const likes = useLoad<Post[]>(() => fetchLiked(me.id), []);
  return (
    <div className="st-page wide">
      <h1 className="st-title">Likes</h1>
      <p className="st-intro">Posts and Shorts you've liked, newest first. Only you can see this.</p>
      {likes.loading ? <Spinner /> : likes.error ? <Failed error={likes.error} retry={likes.reload} /> : likes.data?.length ? (
        <div className="grid st-activity-grid">{likes.data.map((p) => <Tile key={p.id} post={p} onOpen={openPost} />)}</div>
      ) : (
        <Empty icon="heart" title="No likes yet" body="Posts you like appear here." />
      )}
    </div>
  );
}

function MyComments({ openPost }: { openPost: (id: string) => void }) {
  const { me } = useMe();
  const comments = useLoad<Comment[]>(() => fetchMyComments(me.id), []);
  return (
    <div className="st-page wide">
      <h1 className="st-title">Comments</h1>
      <p className="st-intro">Comments you've written, newest first. Open one to see it on its post, or delete it there.</p>
      {comments.loading ? <Spinner /> : comments.error ? <Failed error={comments.error} retry={comments.reload} /> : comments.data?.length ? (
        <div className="st-card">
          {comments.data.map((c) => {
            const p = getPostNow(c.post_id);
            const cover = p?.media[0]?.type === 'video' ? p.media[0].poster : p?.media[0]?.url;
            return (
              <button key={c.id} className="st-row st-link st-comment" onClick={() => openPost(c.post_id)}>
                <Avatar src={me.avatar_url} name={me.username} size={36} />
                <span className="st-row-text wrap">
                  <b>{c.text}</b>
                  <span>
                    On {p ? p.username + "'s post" : 'a post'} · {ago(c.created_at)}
                  </span>
                </span>
                {cover ? <img className="row-thumb" src={cover} alt="" /> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <Empty icon="comment" title="No comments yet" body="Comments you write appear here." />
      )}
    </div>
  );
}

const PLATFORM_NAMES: Record<string, string> = { mac: 'Community for Mac', web: 'Community on the web', ios: 'Community for iPhone', windows: 'Community for Windows' };

/** When you joined, and each app and computer you've used Community on (the app's own record). */
function AccountHistory() {
  const { me } = useMe();
  const sessions = useLoad(async () => {
    const { data, error } = await supabase.from('community_sessions').select('*').eq('user_id', me.id).order('first_seen', { ascending: false }).limit(30);
    if (error) throw error;
    return (data as Session[]) ?? [];
  }, []);
  const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="st-page wide">
      <h1 className="st-title">Account history</h1>
      <p className="st-intro">When you joined, and where you first used Community. To see where you're logged in now, open Settings → Accounts Centre.</p>
      <div className="st-card st-timeline">
        {(sessions.data ?? []).map((s) => (
          <div key={s.id} className="st-row">
            <span className="st-row-icon">
              <Icon name={s.platform === 'ios' ? 'phone' : 'mac'} />
            </span>
            <span className="st-row-text">
              <b>First used {PLATFORM_NAMES[s.platform] ?? 'Community'}</b>
              <span>
                {day(s.first_seen)}
                {s.country ? ' · ' + s.country : ''} · last used {agoLong(s.last_seen).toLowerCase()}
              </span>
            </span>
          </div>
        ))}
        <div className="st-row">
          <span className="st-row-icon">
            <Icon name="user" />
          </span>
          <span className="st-row-text">
            <b>You joined Community</b>
            <span>{day(me.created_at)}</span>
          </span>
        </div>
      </div>
      {sessions.loading ? <Spinner /> : null}
    </div>
  );
}
