// The Professional dashboard: insights about your posts, stories and followers, and ad tools.
import React, { useState } from 'react';
import { fetchStats } from 'shared/api';
import { dayLabelISO, fmt } from 'shared/theme';
import type { Stats } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Empty, Failed, Icon, Link, Modal, Spinner, Verified, toast, toastError, useLoad } from '../ui/kit';

const RANGES = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
];

export function Dashboard(_: { path?: string }) {
  const { me } = useMe();
  const [days, setDays] = useState(30);
  const stats = useLoad<Stats>(() => fetchStats(new Date(Date.now() - days * 86400e3), new Date()), [days]);
  const s = stats.data;
  const max = Math.max(1, ...(s?.days ?? []).map((d) => d.views));
  return (
    <div className="page dash">
      <div className="dash-head">
        <h1 className="page-title">Professional dashboard</h1>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Period">
          {RANGES.map((r) => (
            <option key={r.days} value={r.days}>
              {r.label}
            </option>
          ))}
        </select>
      </div>
      {me.account_type !== 'creator' ? (
        <p className="note">
          Your account is personal. Switch to a creator account in <Link to="/accounts/professional" className="link-btn">Settings → Creator tools</Link> to add a category to your profile and turn on frequently asked questions.
        </p>
      ) : null}
      {stats.loading && !s ? <Spinner /> : stats.error ? <Failed error={stats.error} retry={stats.reload} /> : s ? (
        <>
          <div className="stat-tiles">
            <div className="tile-stat">
              <span>Views</span>
              <b>{fmt(s.views)}</b>
              <em>
                {fmt(s.post_views)} on posts · {fmt(s.story_views)} on stories
              </em>
            </div>
            <div className="tile-stat">
              <span>Accounts reached</span>
              <b>{fmt(s.accounts)}</b>
              <em>Different people who saw something of yours</em>
            </div>
            <div className="tile-stat">
              <span>Followers</span>
              <b>{fmt(s.followers)}</b>
              <em className={s.new_followers ? 'up' : ''}>{s.new_followers ? `+${fmt(s.new_followers)} in this period` : 'No new followers in this period'}</em>
            </div>
            <div className="tile-stat">
              <span>Interactions</span>
              <b>{fmt(s.likes + s.comments + s.reposts)}</b>
              <em>
                {fmt(s.likes)} likes · {fmt(s.comments)} comments · {fmt(s.reposts)} reposts
              </em>
            </div>
          </div>
          <section className="dash-card">
            <h3>Views by day</h3>
            <div className="bars-chart" role="img" aria-label="Views by day">
              {s.days.map((d) => (
                <div key={d.d} className="bar-col" title={`${dayLabelISO(d.d)}: ${d.views} views, ${d.followers} new followers`}>
                  <i style={{ height: `${(d.views / max) * 100}%` }} />
                </div>
              ))}
            </div>
            <div className="bars-axis">
              <span>{s.days[0] ? dayLabelISO(s.days[0].d) : ''}</span>
              <span>{s.days.length ? dayLabelISO(s.days[s.days.length - 1].d) : ''}</span>
            </div>
          </section>
          <section className="dash-card">
            <h3>Your content</h3>
            <p className="muted-text">
              {s.posts} posts · {s.reels} reels · {s.stories} stories shared in this period
            </p>
            {s.top.length ? (
              <div className="top-grid">
                {s.top.map((t) => (
                  <Link key={t.id} to={'/p/' + t.id} className="top-item">
                    {t.media ? <img src={t.media.type === 'video' ? t.media.poster || '' : t.media.url} alt="" /> : <span className="hl-blank" />}
                    <span>
                      <Icon name="eye" size={14} /> {fmt(t.views)} <Icon name="heart" size={14} /> {fmt(t.likes)}
                    </span>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="muted-text">Share a post to see how it does here.</p>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

/* ---------- saved replies ---------- */
