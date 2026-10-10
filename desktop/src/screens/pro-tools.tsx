// The dashboard's "Your tools", from the iPhone app: Inspiration (inspiration.tsx: what other people's
// most liked posts look like right now) and Best practices (best-practices.tsx: tips for creators,
// each with a button to the desktop's own tool for it).
import React from 'react';
import { fetchTopPosts } from 'shared/api';
import { openCreate } from '../lib/create';
import { t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { Failed, Icon, type IconName, Link, Spinner, useLoad } from '../ui/kit';
import { Tile } from '../ui/post';
import { useOpenPost } from './pro-kit';

/* ---------- Inspiration ---------- */

/** Other people's most liked posts and Shorts of the last 30 days, opening like any grid. */
export function Inspiration() {
  const { me } = useMe();
  const posts = useLoad(() => fetchTopPosts(me.id), [me.id]);
  const open = useOpenPost();
  const list = posts.data ?? [];
  const ids = list.map((p) => p.id);
  let body: React.ReactNode;
  if (posts.error && !list.length) body = <Failed error={posts.error} retry={posts.reload} />;
  else if (!posts.data) body = <Spinner />;
  else if (!list.length) {
    body = (
      <div className="pro-empty">
        <span className="pro-empty-ring">
          <Icon name="bulb" size={30} stroke={1.6} />
        </span>
        <h3>{t('d.pro.inspirationEmpty')}</h3>
        <p>{t('d.pro.inspirationEmptyBody')}</p>
      </div>
    );
  } else {
    body = (
      <div className="pro-insp-grid">
        {list.map((p) => (
          <Tile key={p.id} post={p} onOpen={() => open(p, ids)} />
        ))}
      </div>
    );
  }
  return (
    <>
      <div className="pro-ins-head">
        <div>
          <h2>{t('d.pro.inspiration')}</h2>
          <p className="muted-text">{t('d.pro.inspirationSub')}</p>
        </div>
        <button className="pro-chip" onClick={posts.reload} disabled={posts.loading}>
          {t('d.pro.refresh')}
        </button>
      </div>
      {body}
    </>
  );
}

/* ---------- Best practices ---------- */

type Tip = { icon: IconName; title: string; body: string; action: string; to?: string; create?: 'story' | 'short' };

/** The iPhone's tips, pointing at the same tools on the desktop. title, body and action are keys for t(). */
const TIPS: Tip[] = [
  { icon: 'story', title: 'd.pro.tipStory', body: 'd.pro.tipStoryBody', action: 'profile.addToStory', create: 'story' },
  { icon: 'highlight', title: 'd.pro.tipHighlights', body: 'd.pro.tipHighlightsBody', action: 'd.pro.tipHighlightsAction', to: '/archive' },
  { icon: 'reels', title: 'd.pro.tipShorts', body: 'd.pro.tipShortsBody', action: 'd.pro.tipShortsAction', create: 'short' },
  { icon: 'reply', title: 'd.pro.tipReplies', body: 'd.pro.tipRepliesBody', action: 'd.pro.tipRepliesAction', to: '/accounts/creator' },
  { icon: 'question', title: 'd.pro.tipFaq', body: 'd.pro.tipFaqBody', action: 'd.pro.tipFaqAction', to: '/accounts/creator' },
  { icon: 'star', title: 'd.pro.tipCloseFriends', body: 'd.pro.tipCloseFriendsBody', action: 'settings.closeFriends', to: '/accounts/close-friends' },
  { icon: 'chart', title: 'd.pro.tipInsights', body: 'd.pro.tipInsightsBody', action: 'd.pro.tipInsightsAction', to: '/dashboard' },
  { icon: 'boost', title: 'd.pro.tipPromote', body: 'd.pro.tipPromoteBody', action: 'd.pro.adTools', to: '/dashboard/ads' },
];

export function BestPractices() {
  return (
    <>
      <div className="pro-ins-head">
        <div>
          <h2>{t('d.pro.bestPractices')}</h2>
          <p className="muted-text">{t('d.pro.bestPracticesSub')}</p>
        </div>
      </div>
      <div className="pro-bp-grid">
        {TIPS.map((tip) => {
          const action = (
            <>
              {t(tip.action)} <Icon name="right" size={14} stroke={2.4} />
            </>
          );
          return (
            <section key={tip.title} className="pro-bp-card">
              <span className="pro-bp-icon">
                <Icon name={tip.icon} size={24} />
              </span>
              <h3>{t(tip.title)}</h3>
              <p>{t(tip.body)}</p>
              {tip.to ? (
                <Link to={tip.to} className="pro-bp-go">
                  {action}
                </Link>
              ) : (
                <button className="pro-bp-go" onClick={() => openCreate({ mode: tip.create! })}>
                  {action}
                </button>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
