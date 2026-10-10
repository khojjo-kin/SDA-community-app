// The dashboard's "Your tools", from the iPhone app: Inspiration (inspiration.tsx: what other people's
// most liked posts look like right now) and Best practices (best-practices.tsx: tips for creators,
// each with a button to the desktop's own tool for it).
import React from 'react';
import { fetchTopPosts } from 'shared/api';
import { openCreate } from '../lib/create';
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
        <h3>Nothing to show yet</h3>
        <p>When people share posts that others love, the most liked ones show here.</p>
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
          <h2>Inspiration</h2>
          <p className="muted-text">The most liked posts and Shorts from other people in the last 30 days.</p>
        </div>
        <button className="pro-chip" onClick={posts.reload} disabled={posts.loading}>
          Refresh
        </button>
      </div>
      {body}
    </>
  );
}

/* ---------- Best practices ---------- */

type Tip = { icon: IconName; title: string; body: string; action: string; to?: string; create?: 'story' | 'short' };

/** The iPhone's tips, pointing at the same tools on the desktop. */
const TIPS: Tip[] = [
  { icon: 'story', title: 'Share to your story often', body: 'Stories sit at the top of Home for 24 hours, so they are the first thing followers see. Add text, stickers or a drawing to make them yours.', action: 'Add to your story', create: 'story' },
  { icon: 'highlight', title: 'Keep your best stories as highlights', body: 'Highlights stay on your profile after a story disappears. Use them for the things new visitors ask about most.', action: 'New highlight', to: '/archive' },
  { icon: 'reels', title: 'Share Shorts', body: 'Shorts up to 60 seconds get their own tab, with captions made from the sound, and you can see how many people watched each one.', action: 'New Short', create: 'short' },
  { icon: 'reply', title: 'Answer faster with saved replies', body: 'Write an answer once and drop it into any chat from the message box.', action: 'Saved replies', to: '/accounts/creator' },
  { icon: 'question', title: 'Set up frequently asked questions', body: 'People click a question at the top of your chat and get your answer straight away, even when you are busy.', action: 'Frequently asked questions', to: '/accounts/creator' },
  { icon: 'star', title: 'Use close friends for the personal things', body: 'Share some stories with a smaller list. They get a green ring so your friends know it is just for them.', action: 'Close friends', to: '/accounts/close-friends' },
  { icon: 'chart', title: 'Check what works', body: 'Insights show views, new followers and your most viewed posts, so you can do more of what people respond to.', action: 'Open Insights', to: '/dashboard' },
  { icon: 'boost', title: 'Help a good post reach further', body: "Promote a post for a few days and it is shown to people who don't follow you yet. Ad tools shows how it does.", action: 'Ad tools', to: '/dashboard/ads' },
];

export function BestPractices() {
  return (
    <>
      <div className="pro-ins-head">
        <div>
          <h2>Best practices</h2>
          <p className="muted-text">Ways to reach more people, and to look after the ones who already follow you.</p>
        </div>
      </div>
      <div className="pro-bp-grid">
        {TIPS.map((t) => {
          const action = (
            <>
              {t.action} <Icon name="right" size={14} stroke={2.4} />
            </>
          );
          return (
            <section key={t.title} className="pro-bp-card">
              <span className="pro-bp-icon">
                <Icon name={t.icon} size={24} />
              </span>
              <h3>{t.title}</h3>
              <p>{t.body}</p>
              {t.to ? (
                <Link to={t.to} className="pro-bp-go">
                  {action}
                </Link>
              ) : (
                <button className="pro-bp-go" onClick={() => openCreate({ mode: t.create! })}>
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
