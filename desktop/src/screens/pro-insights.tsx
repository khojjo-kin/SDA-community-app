// Insights on the Professional dashboard: an overview, your content, your audience and your income,
// for the last 7, 30 or 90 days, compared with the period before; and a monthly recap.
import React, { useMemo, useState } from 'react';
import { fetchStats, fetchUserFundraisers, listNewFollowers, mySubscribers } from 'shared/api';
import { count, fmt } from 'shared/theme';
import type { Stats, StatsTop } from 'shared/types';
import { useMe } from '../lib/me';
import { money, paymentsConfig } from '../lib/pay';
import { ColumnChart, Donut, LineChart, SERIES, Spark } from '../ui/charts';
import { Avatar, Failed, Icon, Link, Spinner, Verified, useLoad } from '../ui/kit';
import { longDay, shortDay, useOpenPost } from './pro-kit';
import { FundraiserRow, PayoutBox } from './pro-money';

export type Section = 'overview' | 'content' | 'audience' | 'income';
export const SECTIONS: { value: Section; label: string; path: string }[] = [
  { value: 'overview', label: 'Overview', path: '/dashboard' },
  { value: 'content', label: 'Content', path: '/dashboard/content' },
  { value: 'audience', label: 'Audience', path: '/dashboard/audience' },
  { value: 'income', label: 'Income', path: '/dashboard/income' },
];
const PERIODS = [7, 30, 90];

type Pair = { now: Stats; before: Stats; from: Date; to: Date };

/** The chosen period and the one before it, fetched together so tiles can show the change. */
export function useStats(days: number) {
  return useLoad<Pair>(async () => {
    const to = new Date();
    const from = new Date(to.getTime() - days * 86400e3);
    const earlier = new Date(from.getTime() - days * 86400e3);
    const [now, before] = await Promise.all([fetchStats(from, to), fetchStats(earlier, from)]);
    return { now, before, from, to };
  }, [days]);
}

export function Insights({ section, days, setDays, stats }: { section: Section; days: number; setDays: (d: number) => void; stats: ReturnType<typeof useStats> }) {
  const { me } = useMe();
  const title = SECTIONS.find((s) => s.value === section)!.label;
  const range = stats.data ? `${shortDay(stats.data.from)} – ${shortDay(stats.data.to)}` : '';
  const head = (
    <div className="pro-ins-head">
      <div>
        <h2>{title}</h2>
        {section !== 'income' ? <p className="muted-text">{range || ' '}</p> : <p className="muted-text">Subscriptions, gifts and Plus</p>}
      </div>
      {section !== 'income' ? (
        <div className="pro-chips" role="tablist" aria-label="Period">
          {PERIODS.map((d) => (
            <button key={d} role="tab" aria-selected={days === d} className={'pro-chip' + (days === d ? ' on' : '')} onClick={() => setDays(d)}>
              Last {d} days
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  if (section === 'income') {
    return (
      <>
        {head}
        <Income />
      </>
    );
  }
  if (me.account_type !== 'creator') {
    return (
      <>
        {head}
        <div className="pro-empty">
          <span className="pro-empty-ring">
            <Icon name="chart" size={30} stroke={1.6} />
          </span>
          <h3>Insights come with a creator account</h3>
          <p>Switch to a creator account to see how your posts, Shorts and stories are doing.</p>
          <Link to="/accounts/professional" className="btn">
            Switch account type
          </Link>
        </div>
      </>
    );
  }
  let body: React.ReactNode;
  if (stats.error && !stats.data) body = <Failed error={stats.error} retry={stats.reload} />;
  else if (!stats.data) body = <Spinner />;
  else if (section === 'overview') body = <Overview pair={stats.data} days={days} />;
  else if (section === 'content') body = <Content pair={stats.data} days={days} />;
  else body = <Audience pair={stats.data} days={days} />;
  return (
    <>
      {head}
      <div className={stats.loading ? 'pro-loading' : ''}>{body}</div>
    </>
  );
}

/* ---------- tiles ---------- */

/** "▲ 12%" or "▼ 8%" against the period before, or "No change". */
function Change({ now, before, days }: { now: number; before: number; days: number }) {
  if (now === before) return <em className="pro-change">No change on the {days} days before</em>;
  const up = now > before;
  const pct = before === 0 ? null : Math.round((Math.abs(now - before) / before) * 100);
  return (
    <em className={'pro-change ' + (up ? 'up' : 'down')}>
      <Icon name={up ? 'up' : 'dip'} size={14} stroke={2.4} /> {pct === null ? `${up ? '+' : '−'}${fmt(Math.abs(now - before))}` : `${pct}%`} on the {days} days before
    </em>
  );
}

function Tile({ label, value, before, days, sub, spark, color }: { label: string; value: number; before?: number; days: number; sub?: string; spark?: number[]; color?: string }) {
  return (
    <div className="pro-tile">
      <span className="pro-tile-label">{label}</span>
      <div className="pro-tile-row">
        <b>{fmt(value)}</b>
        {spark ? <Spark values={spark} color={color} /> : null}
      </div>
      {sub ? <span className="pro-tile-sub">{sub}</span> : null}
      {before !== undefined ? <Change now={value} before={before} days={days} /> : null}
    </div>
  );
}

const shared = (s: Stats) => s.posts + s.reels + s.stories;
const thumbOf = (t: StatsTop) => (t.media ? (t.media.type === 'video' ? t.media.poster || '' : t.media.url) : '');

/* ---------- overview ---------- */

function Overview({ pair, days }: { pair: Pair; days: number }) {
  const { now, before } = pair;
  const [chart, setChart] = useState<'views' | 'followers'>('views');
  const viewsLine = now.days.map((d) => ({ x: d.d, y: d.views }));
  const followLine = now.days.map((d) => ({ x: d.d, y: d.followers }));
  const best = now.days.reduce((a, d) => (d.views > a.views ? d : a), now.days[0] ?? { d: '', views: 0, followers: 0 });
  return (
    <>
      <div className="pro-tiles">
        <Tile label="Views" value={now.views} before={before.views} days={days} spark={now.days.map((d) => d.views)} color={SERIES[0]} />
        <Tile label="Accounts reached" value={now.accounts} before={before.accounts} days={days} />
        <Tile label="Followers gained" value={now.new_followers} before={before.new_followers} days={days} sub={`${fmt(now.followers)} followers in total`} />
        <Tile label="Content shared" value={shared(now)} before={shared(before)} days={days} sub={`${now.posts} posts · ${now.reels} Shorts · ${now.stories} stories`} />
        <Tile label="Likes" value={now.likes} before={before.likes} days={days} />
        <Tile label="Comments" value={now.comments} before={before.comments} days={days} />
      </div>

      <section className="pro-card">
        <div className="pro-card-head">
          <h3>Views and followers</h3>
          <div className="pro-legend" role="tablist" aria-label="Chart">
            <button role="tab" aria-selected={chart === 'views'} className={chart === 'views' ? 'on' : ''} onClick={() => setChart('views')}>
              <i style={{ background: SERIES[0] }} /> Views
            </button>
            <button role="tab" aria-selected={chart === 'followers'} className={chart === 'followers' ? 'on' : ''} onClick={() => setChart('followers')}>
              <i style={{ background: SERIES[2] }} /> New followers
            </button>
          </div>
        </div>
        {chart === 'views' ? <LineChart data={viewsLine} name="views" height={240} /> : <ColumnChart data={followLine} name="new followers" height={240} color={SERIES[2]} />}
        <p className="muted-text small">
          {chart === 'views'
            ? best && best.views
              ? `Most in a day: ${fmt(best.views)} views on ${shortDay(best.d + 'T12:00:00')}.`
              : 'No views in this period.'
            : now.new_followers
              ? `${count(now.new_followers, 'new follower')} in the last ${days} days.`
              : 'Nobody new followed you in this period.'}
        </p>
      </section>

      <div className="pro-grid-2">
        <section className="pro-card">
          <div className="pro-card-head">
            <h3>Top content</h3>
            <Link to="/dashboard/content" className="link-btn">
              See all
            </Link>
          </div>
          <TopGrid top={now.top.slice(0, 6)} />
        </section>
        <section className="pro-card">
          <div className="pro-card-head">
            <h3>Audience</h3>
            <Link to="/dashboard/audience" className="link-btn">
              See audience
            </Link>
          </div>
          <div className="pro-big">
            <b>{fmt(now.followers)}</b>
            <span className="muted-text">followers · {now.new_followers ? `+${fmt(now.new_followers)}` : 'none new'} in the last {days} days</span>
          </div>
          <LineChart data={followersOverTime(now)} name="followers" height={150} color={SERIES[2]} />
        </section>
      </div>

      <div className="pro-grid-2">
        <IncomeSummary />
        <Recap />
      </div>
    </>
  );
}

/** Followers at the end of each day: today's total, worked backwards through the new ones. */
function followersOverTime(s: Stats) {
  let total = s.followers - s.days.reduce((a, d) => a + d.followers, 0);
  return s.days.map((d) => {
    total += d.followers;
    return { x: d.d, y: total };
  });
}

function TopGrid({ top }: { top: StatsTop[] }) {
  const open = useOpenPost();
  if (!top.length) return <p className="muted-text">Nothing shared in this period. Share a post or a Short to see how it does here.</p>;
  const ids = top.map((t) => t.id);
  return (
    <div className="pro-top-grid">
      {top.map((t) => (
        <button key={t.id} className="pro-top" onClick={() => open(t, ids)} title={`${count(t.views, 'view')} · ${count(t.likes, 'like')}`} aria-label={`${t.kind === 'reel' ? 'Short' : 'Post'}, ${count(t.views, 'view')}`}>
          {thumbOf(t) ? <img src={thumbOf(t)} alt="" /> : <span className="pro-top-blank" />}
          {t.kind === 'reel' ? (
            <span className="pro-top-kind">
              <Icon name="reels" size={14} color="#fff" />
            </span>
          ) : null}
          <span className="pro-top-stats">
            <Icon name="eye" size={14} color="#fff" /> {fmt(t.views)}
          </span>
        </button>
      ))}
    </div>
  );
}

/* ---------- content ---------- */

function Content({ pair, days }: { pair: Pair; days: number }) {
  const { now, before } = pair;
  const open = useOpenPost();
  const ids = now.top.map((t) => t.id);
  return (
    <>
      <div className="pro-tiles">
        <Tile label="Posts" value={now.posts} before={before.posts} days={days} />
        <Tile label="Shorts" value={now.reels} before={before.reels} days={days} />
        <Tile label="Stories" value={now.stories} before={before.stories} days={days} />
        <Tile label="Likes" value={now.likes} before={before.likes} days={days} />
        <Tile label="Comments" value={now.comments} before={before.comments} days={days} />
        <Tile label="Reposts" value={now.reposts} before={before.reposts} days={days} />
      </div>
      <div className="pro-grid-2 wide-left">
        <section className="pro-card">
          <div className="pro-card-head">
            <h3>Posts and Shorts from this period</h3>
            <span className="muted-text small">Most viewed first</span>
          </div>
          {now.top.length ? (
            <div className="table-wrap">
              <table className="table pro-table">
                <thead>
                  <tr>
                    <th>Content</th>
                    <th>Shared</th>
                    <th className="num">Views</th>
                    <th className="num">Likes</th>
                    <th className="num">Comments</th>
                  </tr>
                </thead>
                <tbody>
                  {now.top.map((t) => (
                    <tr key={t.id} onClick={() => open(t, ids)}>
                      <td>
                        <span className="pro-ad-cell">
                          <span className="pro-ad-thumb">{thumbOf(t) ? <img src={thumbOf(t)} alt="" /> : <Icon name="image" size={18} />}</span>
                          <span>{t.kind === 'reel' ? 'Short' : 'Post'}</span>
                        </span>
                      </td>
                      <td className="pro-nowrap">{shortDay(t.created_at)}</td>
                      <td className="num">{fmt(t.views)}</td>
                      <td className="num">{fmt(t.likes)}</td>
                      <td className="num">{fmt(t.comments)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted-text">Nothing shared in this period.</p>
          )}
        </section>
        <section className="pro-card">
          <div className="pro-card-head">
            <h3>Where views came from</h3>
          </div>
          <Donut name="Where views came from" slices={[{ label: 'Posts and Shorts', value: now.post_views }, { label: 'Stories', value: now.story_views }]} />
          <p className="muted-text small">{count(now.accounts, 'different person')} saw something of yours.</p>
        </section>
      </div>
    </>
  );
}

/* ---------- audience ---------- */

function Audience({ pair, days }: { pair: Pair; days: number }) {
  const { now, before, from } = pair;
  const { me } = useMe();
  const people = useLoad(() => listNewFollowers(me.id, from), [me.id, from.getTime()]);
  return (
    <>
      <div className="pro-tiles three">
        <Tile label="Followers" value={now.followers} days={days} sub={`${me.following_count} following`} />
        <Tile label="New followers" value={now.new_followers} before={before.new_followers} days={days} spark={now.days.map((d) => d.followers)} color={SERIES[2]} />
        <Tile label="Accounts reached" value={now.accounts} before={before.accounts} days={days} />
      </div>
      <div className="pro-grid-2">
        <section className="pro-card">
          <div className="pro-card-head">
            <h3>Followers over time</h3>
          </div>
          <LineChart data={followersOverTime(now)} name="followers" height={220} color={SERIES[2]} />
        </section>
        <section className="pro-card">
          <div className="pro-card-head">
            <h3>New followers by day</h3>
          </div>
          <ColumnChart data={now.days.map((d) => ({ x: d.d, y: d.followers }))} name="new followers" height={220} color={SERIES[2]} />
        </section>
      </div>
      <section className="pro-card">
        <div className="pro-card-head">
          <h3>New followers</h3>
          <span className="muted-text small">Since {longDay(from)}</span>
        </div>
        {people.error && !people.data ? (
          <Failed error={people.error} retry={people.reload} />
        ) : !people.data ? (
          <Spinner size={22} />
        ) : people.data.length ? (
          <div className="pro-people">
            {people.data.map((p) => (
              <Link key={p.id} to={'/u/' + p.username} className="pro-person">
                <Avatar src={p.avatar_url} name={p.username} size={44} />
                <span className="row-text">
                  <b>
                    {p.username}
                    {p.verified ? <Verified /> : null}
                  </b>
                  <span>{p.full_name}</span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted-text">Nobody new followed you in this period.</p>
        )}
      </section>
    </>
  );
}

/* ---------- income ---------- */

/** Creator subscriptions, gifts to your fundraisers and your Plus, in one place. */
function useIncome() {
  const { me } = useMe();
  return useLoad(async () => {
    const [subs, funds, config] = await Promise.all([mySubscribers(me.id), fetchUserFundraisers(me.id), paymentsConfig().catch(() => null)]);
    const live = subs.filter((s) => s.status === 'active' || s.status === 'trialing');
    const monthly = live.reduce((a, s) => a + s.amount_pence, 0);
    const fee = config?.creator_fee_percent ?? 10;
    return { subs, live, monthly, yours: Math.round(monthly * (1 - fee / 100)), fee, funds, raised: funds.reduce((a, f) => a + f.raised_pence, 0), donors: funds.reduce((a, f) => a + f.donor_count, 0) };
  }, [me.id]);
}

function IncomeSummary() {
  const { me } = useMe();
  const inc = useIncome();
  const d = inc.data;
  return (
    <section className="pro-card">
      <div className="pro-card-head">
        <h3>Income</h3>
        <Link to="/dashboard/income" className="link-btn">
          See income
        </Link>
      </div>
      {!d ? (
        inc.error ? <Failed error={inc.error} retry={inc.reload} /> : <Spinner size={22} />
      ) : (
        <ul className="pro-lines">
          <li>
            <span>Subscribers</span>
            <b>{fmt(d.live.length)}</b>
          </li>
          <li>
            <span>Subscriptions a month</span>
            <b>{money(d.monthly)}</b>
          </li>
          <li>
            <span>Raised by your fundraisers</span>
            <b>{money(d.raised)}</b>
          </li>
          <li>
            <span>Community Plus</span>
            <b className={me.plus ? 'pro-ok-text' : ''}>{me.plus ? 'Active' : 'Not active'}</b>
          </li>
        </ul>
      )}
    </section>
  );
}

function Income() {
  const { me } = useMe();
  const inc = useIncome();
  const d = inc.data;
  if (inc.error && !d) return <Failed error={inc.error} retry={inc.reload} />;
  if (!d) return <Spinner />;
  const until = me.plus_until ? longDay(me.plus_until) : '';
  return (
    <>
      <div className="pro-tiles four">
        <div className="pro-tile">
          <span className="pro-tile-label">Subscribers</span>
          <div className="pro-tile-row">
            <b>{fmt(d.live.length)}</b>
          </div>
          <span className="pro-tile-sub">{me.sub_price_pence ? `At ${money(me.sub_price_pence)} a month` : "You don't offer subscriptions"}</span>
        </div>
        <div className="pro-tile">
          <span className="pro-tile-label">Subscription income a month</span>
          <div className="pro-tile-row">
            <b>{money(d.monthly)}</b>
          </div>
          <span className="pro-tile-sub">
            {money(d.yours)} to you after the {d.fee}% fee
          </span>
        </div>
        <div className="pro-tile">
          <span className="pro-tile-label">Raised by your fundraisers</span>
          <div className="pro-tile-row">
            <b>{money(d.raised)}</b>
          </div>
          <span className="pro-tile-sub">{d.donors === 1 ? 'From 1 supporter' : `From ${fmt(d.donors)} supporters`} · no fee</span>
        </div>
        <div className="pro-tile">
          <span className="pro-tile-label">Community Plus</span>
          <div className="pro-tile-row">
            <b className={me.plus ? 'pro-ok-text' : ''}>{me.plus ? 'Active' : 'Off'}</b>
          </div>
          <span className="pro-tile-sub">{me.plus ? (until ? `Until ${until}` : 'Active') : <Link to="/plus" className="link-btn small">Get Plus</Link>}</span>
        </div>
      </div>

      <div className="pro-grid-2 wide-left">
        <section className="pro-card">
          <div className="pro-card-head">
            <h3>{d.live.length ? `Subscribers (${d.live.length})` : 'Subscribers'}</h3>
            <span className="muted-text small">{me.sub_price_pence ? `You offer subscriptions at ${money(me.sub_price_pence)} a month.` : ''}</span>
          </div>
          {d.subs.length ? (
            <div className="pro-people list">
              {d.subs.map((s) => (
                <div key={s.id} className="pro-person">
                  <Avatar src={s.profile?.avatar_url} name={s.profile?.username ?? '?'} size={40} />
                  <span className="row-text">
                    <b>{s.profile?.username ?? 'Someone'}</b>
                    <span>
                      {s.status === 'past_due' ? 'Payment due' : `Since ${shortDay(s.created_at)}`}
                      {s.cancel_at_period_end && s.current_period_end ? ` · ends ${shortDay(s.current_period_end)}` : ''}
                    </span>
                  </span>
                  <span className="muted-text small pro-nowrap">{money(s.amount_pence)}/mo</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted-text">
              {me.sub_price_pence ? (
                'Nobody subscribes yet.'
              ) : (
                <>
                  Offer subscriptions to earn from your posts.{' '}
                  <Link to="/accounts/subscriptions" className="link-btn inline">
                    Set a monthly price
                  </Link>
                </>
              )}
            </p>
          )}
        </section>
        <section className="pro-card">
          <div className="pro-card-head">
            <h3>Payouts</h3>
          </div>
          <PayoutBox />
        </section>
      </div>

      <section className="pro-card">
        <div className="pro-card-head">
          <h3>Your fundraisers</h3>
          <Link to="/fundraisers/new" className="link-btn">
            Start a fundraiser
          </Link>
        </div>
        {d.funds.length ? (
          <div className="pro-fund-list">
            {d.funds.map((f) => (
              <FundraiserRow key={f.id} f={f} />
            ))}
          </div>
        ) : (
          <p className="muted-text">You haven't started a fundraiser. Gifts go straight to your own Stripe account.</p>
        )}
      </section>
    </>
  );
}

/* ---------- monthly recap ---------- */

/** A look back at one calendar month, as on the iPhone. Opens on last month. */
function Recap() {
  const months = useMemo(() => {
    const now = new Date();
    return [1, 2, 3, 4, 5, 6].map((back) => {
      const from = new Date(now.getFullYear(), now.getMonth() - back, 1);
      const to = new Date(now.getFullYear(), now.getMonth() - back + 1, 1);
      return { key: `${from.getFullYear()}-${from.getMonth()}`, from, to, label: from.toLocaleDateString('en-GB', { month: 'long' }), short: from.toLocaleDateString('en-GB', { month: 'short' }) };
    });
  }, []);
  const [at, setAt] = useState(0);
  const month = months[at];
  const stats = useLoad(() => fetchStats(month.from, month.to), [month.key]);
  const s = stats.data;
  const quiet = s && s.views + s.likes + s.comments + s.new_followers + s.posts + s.reels + s.stories === 0;
  const top = s?.top.find((t) => t.views > 0);
  return (
    <section className="pro-card pro-recap">
      <div className="pro-card-head">
        <h3>Monthly recap</h3>
        <div className="pro-chips small" role="tablist" aria-label="Month">
          {months.map((m, i) => (
            <button key={m.key} role="tab" aria-selected={at === i} className={'pro-chip' + (at === i ? ' on' : '')} onClick={() => setAt(i)}>
              {m.short}
            </button>
          ))}
        </div>
      </div>
      <div className="pro-recap-banner">
        <span>{month.from.getFullYear()}</span>
        <b>Your {month.label}</b>
        <p>{!s ? 'Adding it up…' : quiet ? 'A quiet month. Nothing was shared and nobody new came by.' : `${count(s.views, 'view')} from ${fmt(s.accounts)} ${s.accounts === 1 ? 'person' : 'people'}, and ${count(s.new_followers, 'new follower')}.`}</p>
      </div>
      {stats.error && !s ? (
        <Failed error={stats.error} retry={stats.reload} />
      ) : !s ? null : (
        <>
          <ul className="pro-recap-tiles">
            <li><b>{fmt(s.views)}</b><span>Views</span></li>
            <li><b>{fmt(s.accounts)}</b><span>People reached</span></li>
            <li><b>{fmt(s.likes)}</b><span>Likes</span></li>
            <li><b>{fmt(s.comments)}</b><span>Comments</span></li>
            <li><b>{fmt(s.new_followers)}</b><span>New followers</span></li>
            <li><b>{fmt(shared(s))}</b><span>Shared</span></li>
          </ul>
          {top ? (
            <Link to={'/p/' + top.id} className="pro-recap-top">
              {thumbOf(top) ? <img src={thumbOf(top)} alt="" /> : <span className="pro-top-blank" />}
              <span className="grow">
                <span className="pro-eyebrow">Most viewed</span>
                <b>{count(top.views, 'view')}</b>
                <span className="muted-text small">
                  {count(top.likes, 'like')} · {count(top.comments, 'comment')}
                </span>
              </span>
              <Icon name="right" size={18} />
            </Link>
          ) : null}
        </>
      )}
    </section>
  );
}
