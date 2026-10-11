// Settings (built in settings-frame.tsx and the settings-*.tsx pages) and Your activity. The Hymnal,
// Churches, and Communities and pages are in hymnal.tsx, churches.tsx and groups.tsx.
import React from 'react';
import { fetchLiked, fetchMyComments } from 'shared/api';
import { supabase } from 'shared/supabase';
import { getPostNow } from 'shared/store';
import { ago, agoLong } from 'shared/theme';
import type { Comment, Post } from 'shared/types';
import type { Session } from '../lib/admin';
import { dateLocale, languageCode, t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { parts, useRoute } from '../lib/router';
import { Avatar, Empty, Failed, Icon, type IconName, Link, useLoad } from '../ui/kit';
import { GridSkeleton, RowsSkeleton } from '../ui/skeleton';
import { Tile } from '../ui/post';
import { LIST_SOURCE, gridIds } from '../ui/post-data';

/* ---------- settings (in settings-frame.tsx) ---------- */

export { Settings } from './settings-frame';

/* ---------- your activity ---------- */

// group and label are keys, drawn with t().
const ACTIVITY: { group: string; items: { id: string; label: string; icon: IconName; to?: string }[] }[] = [
  {
    group: 'd.frame.interactions',
    items: [
      { id: 'likes', label: 'd.frame.likes', icon: 'heart' },
      { id: 'comments', label: 'live.comments', icon: 'comment' },
    ],
  },
  {
    group: 'd.frame.contentShared',
    items: [
      { id: 'posts', label: 'd.frame.postsAndShorts', icon: 'grid', to: 'profile' },
      { id: 'archive', label: 'd.frame.storiesArchive', icon: 'archive', to: '/archive' },
    ],
  },
  { group: 'd.frame.accountHistory', items: [{ id: 'history', label: 'd.frame.accountHistory', icon: 'clock' }] },
];

/** Your activity: the same two-column layout as Settings, with likes, comments and account history. */
export function Activity({ openPost }: { openPost: (id: string, list?: string[]) => void }) {
  const { me } = useMe();
  const route = useRoute();
  const asked = parts(route)[1];
  const tab = asked === 'comments' || asked === 'history' ? asked : 'likes';
  return (
    <div className="st-shell">
      <nav className="st-nav" aria-label={t('settings.yourActivity')}>
        <h2 className="st-nav-title">{t('settings.yourActivity')}</h2>
        <div className="st-nav-list">
          {ACTIVITY.map((g) => (
            <div key={g.group} className="st-group">
              <h3 className="st-group-h">{t(g.group)}</h3>
              {g.items.map((it) => (
                <Link key={it.id} to={it.to === 'profile' ? '/u/' + me.username : it.to ?? '/activity/' + it.id} className={'st-nav-item' + (it.id === tab ? ' on' : '')}>
                  <Icon name={it.icon} />
                  <span className="st-nav-text">
                    <span>{t(it.label)}</span>
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

function LikedPosts({ openPost }: { openPost: (id: string, list?: string[]) => void }) {
  const { me } = useMe();
  const likes = useLoad<Post[]>(() => fetchLiked(me.id), []);
  // The post dialog steps through the liked posts; a liked Short opens the Shorts player with the others.
  const all = likes.data ?? [];
  const ids = gridIds(all, me);
  return (
    <div className="st-page wide">
      <h1 className="st-title">{t('d.frame.likes')}</h1>
      {likes.loading ? <GridSkeleton count={6} /> : likes.error ? <Failed error={likes.error} retry={likes.reload} /> : all.length ? (
        <div className="grid st-activity-grid">{all.map((p) => <Tile key={p.id} post={p} onOpen={(id) => openPost(id, ids)} grid={all} source={LIST_SOURCE} />)}</div>
      ) : (
        <Empty icon="heart" title={t('d.frame.noLikes')} />
      )}
    </div>
  );
}

function MyComments({ openPost }: { openPost: (id: string) => void }) {
  const { me } = useMe();
  const comments = useLoad<Comment[]>(() => fetchMyComments(me.id), []);
  return (
    <div className="st-page wide">
      <h1 className="st-title">{t('live.comments')}</h1>
      {comments.loading ? <RowsSkeleton count={4} square /> : comments.error ? <Failed error={comments.error} retry={comments.reload} /> : comments.data?.length ? (
        <div className="st-card">
          {comments.data.map((c) => {
            const p = getPostNow(c.post_id);
            const cover = p?.media[0]?.type === 'video' ? p.media[0].poster : p?.media[0]?.url;
            return (
              <button key={c.id} className="st-row st-link st-comment" onClick={() => openPost(c.post_id)}>
                <Avatar src={me.avatar_url} name={me.username} size={36} />
                <span className="st-row-text wrap">
                  <b>{c.text}</b>
                  <span>{p ? t('d.frame.onPost', { username: p.username, time: ago(c.created_at) }) : t('d.frame.onAPost', { time: ago(c.created_at) })}</span>
                </span>
                {cover ? <img className="row-thumb" src={cover} alt="" /> : null}
              </button>
            );
          })}
        </div>
      ) : (
        <Empty icon="comment" title={t('d.frame.noComments')} />
      )}
    </div>
  );
}

/** Keys for the name of each app, drawn with t(). */
const PLATFORM_NAMES: Record<string, string> = { mac: 'd.frame.appMac', web: 'd.frame.appWeb', ios: 'd.frame.appIos', windows: 'd.frame.appWindows' };

/** "2 days ago" as the app writes it in English; other languages say it their own way. */
function lastSeen(iso: string): string {
  const long = agoLong(iso);
  if (languageCode() === 'en' || typeof Intl === 'undefined' || !Intl.RelativeTimeFormat) return long.toLowerCase();
  const m = /^(\d+) (minute|hour|day|week)/.exec(long);
  const rtf = new Intl.RelativeTimeFormat(dateLocale(), { numeric: 'auto' });
  return m ? rtf.format(-Number(m[1]), m[2] as Intl.RelativeTimeFormatUnit) : rtf.format(0, 'second');
}

/** When you joined, and each app and computer you've used Community on (the app's own record). */
function AccountHistory() {
  const { me } = useMe();
  const sessions = useLoad(async () => {
    const { data, error } = await supabase.from('community_sessions').select('*').eq('user_id', me.id).order('first_seen', { ascending: false }).limit(30);
    if (error) throw error;
    return (data as Session[]) ?? [];
  }, []);
  const day = (iso: string) => new Date(iso).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <div className="st-page wide">
      <h1 className="st-title">{t('d.frame.accountHistory')}</h1>
      <div className="st-card st-timeline">
        {(sessions.data ?? []).map((s) => (
          <div key={s.id} className="st-row">
            <span className="st-row-icon">
              <Icon name={s.platform === 'ios' ? 'phone' : 'mac'} />
            </span>
            <span className="st-row-text">
              <b>{t('d.frame.firstUsed', { app: PLATFORM_NAMES[s.platform] ? t(PLATFORM_NAMES[s.platform]) : 'Community' })}</b>
              <span>
                {day(s.first_seen)}
                {s.country ? ' · ' + s.country : ''} · {t('d.frame.lastUsed', { when: lastSeen(s.last_seen) })}
              </span>
            </span>
          </div>
        ))}
        <div className="st-row">
          <span className="st-row-icon">
            <Icon name="user" />
          </span>
          <span className="st-row-text">
            <b>{t('d.frame.joined')}</b>
            <span>{day(me.created_at)}</span>
          </span>
        </div>
      </div>
      {sessions.loading ? <RowsSkeleton count={2} avatar={24} /> : null}
    </div>
  );
}
