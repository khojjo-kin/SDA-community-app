// Insights on the Professional dashboard: an overview, your content, your audience and your income,
// for the last 7, 30 or 90 days, compared with the period before; and a monthly recap.
import React, { useMemo, useState } from 'react';
import { fetchStats, fetchUserFundraisers, listNewFollowers, mySubscribers } from 'shared/api';
import { fmt } from 'shared/theme';
import type { Stats, StatsTop } from 'shared/types';
import { dateLocale, t, tn } from '../lib/i18n';
import { useMe } from '../lib/me';
import { money, paymentsConfig } from '../lib/pay';
import { ColumnChart, Donut, LineChart, SERIES, Spark } from '../ui/charts';
import { Avatar, Failed, Icon, Link, Spinner, Verified, useLoad } from '../ui/kit';
import { longDay, shortDay, useOpenPost } from './pro-kit';
import { FundraiserRow, PayoutBox } from './pro-money';

export type Section = 'overview' | 'content' | 'audience' | 'income';
/** label is a key for t(), read where it is drawn. */
export const SECTIONS: { value: Section; label: string; path: string }[] = [
  { value: 'overview', label: 'd.pro.overview', path: '/dashboard' },
  { value: 'content', label: 'd.pro.content', path: '/dashboard/content' },
  { value: 'audience', label: 'd.pro.audience', path: '/dashboard/audience' },
  { value: 'income', label: 'd.pro.income', path: '/dashboard/income' },
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
  const title = t(SECTIONS.find((s) => s.value === section)!.label);
  const range = stats.data ? `${shortDay(stats.data.from)} – ${shortDay(stats.data.to)}` : '';
  const head = (
    <div className="pro-ins-head">
      <div>
        <h2>{title}</h2>
        {section !== 'income' ? <p className="muted-text">{range || ' '}</p> : <p className="muted-text">{t('d.pro.incomeSub')}</p>}
      </div>
      {section !== 'income' ? (
        <div className="pro-chips" role="tablist" aria-label={t('d.pro.period')}>
          {PERIODS.map((d) => (
            <button key={d} role="tab" aria-selected={days === d} className={'pro-chip' + (days === d ? ' on' : '')} onClick={() => setDays(d)}>
              {t('d.pro.lastDays', { count: d })}
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
          <h3>{t('d.pro.creatorOnly')}</h3>
          <p>{t('d.pro.creatorOnlyBody')}</p>
          <Link to="/accounts/professional" className="btn">
            {t('d.pro.switchType')}
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
  if (now === before) return <em className="pro-change">{t('d.pro.noChangeOn', { days })}</em>;
  const up = now > before;
  const pct = before === 0 ? null : Math.round((Math.abs(now - before) / before) * 100);
  const change = pct === null ? `${up ? '+' : '−'}${fmt(Math.abs(now - before))}` : `${pct}%`;
  return (
    <em className={'pro-change ' + (up ? 'up' : 'down')}>
      <Icon name={up ? 'up' : 'dip'} size={14} stroke={2.4} /> {t('d.pro.changeOn', { change, days })}
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
// "12 views", "1 like", "3 comments": counted words, with the number written as everywhere else (1.2K).
const views = (n: number) => tn('d.pro.viewCount', n, { count: fmt(n) });
const likes = (n: number) => tn('d.pro.likeCount', n, { count: fmt(n) });
const comments = (n: number) => tn('d.pro.commentCount', n, { count: fmt(n) });
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
        <Tile label={t('d.pro.views')} value={now.views} before={before.views} days={days} spark={now.days.map((d) => d.views)} color={SERIES[0]} />
        <Tile label={t('d.pro.accountsReached')} value={now.accounts} before={before.accounts} days={days} />
        <Tile label={t('d.pro.followersGained')} value={now.new_followers} before={before.new_followers} days={days} sub={t('d.pro.followersTotal', { count: fmt(now.followers) })} />
        <Tile label={t('d.pro.contentShared')} value={shared(now)} before={shared(before)} days={days} sub={t('d.pro.contentSharedSub', { posts: now.posts, shorts: now.reels, stories: now.stories })} />
        <Tile label={t('d.pro.likes')} value={now.likes} before={before.likes} days={days} />
        <Tile label={t('live.comments')} value={now.comments} before={before.comments} days={days} />
      </div>

      <section className="pro-card">
        <div className="pro-card-head">
          <h3>{t('d.pro.viewsAndFollowers')}</h3>
          <div className="pro-legend" role="tablist" aria-label={t('d.pro.chart')}>
            <button role="tab" aria-selected={chart === 'views'} className={chart === 'views' ? 'on' : ''} onClick={() => setChart('views')}>
              <i style={{ background: SERIES[0] }} /> {t('d.pro.views')}
            </button>
            <button role="tab" aria-selected={chart === 'followers'} className={chart === 'followers' ? 'on' : ''} onClick={() => setChart('followers')}>
              <i style={{ background: SERIES[2] }} /> {t('d.pro.newFollowers')}
            </button>
          </div>
        </div>
        {chart === 'views' ? <LineChart data={viewsLine} name={t('d.pro.chartViews')} height={240} /> : <ColumnChart data={followLine} name={t('d.pro.chartNewFollowers')} height={240} color={SERIES[2]} />}
        <p className="muted-text small">
          {chart === 'views'
            ? best && best.views
              ? t('d.pro.mostInADay', { count: fmt(best.views), day: shortDay(best.d + 'T12:00:00') })
              : t('d.pro.noViews')
            : now.new_followers
              ? tn('d.pro.newFollowersInLast', now.new_followers, { count: fmt(now.new_followers), days })
              : t('d.pro.nobodyNew')}
        </p>
      </section>

      <div className="pro-grid-2">
        <section className="pro-card">
          <div className="pro-card-head">
            <h3>{t('d.pro.topContent')}</h3>
            <Link to="/dashboard/content" className="link-btn">
              {t('ssPub.seeAll')}
            </Link>
          </div>
          <TopGrid top={now.top.slice(0, 6)} />
        </section>
        <section className="pro-card">
          <div className="pro-card-head">
            <h3>{t('d.pro.audience')}</h3>
            <Link to="/dashboard/audience" className="link-btn">
              {t('d.pro.seeAudience')}
            </Link>
          </div>
          <div className="pro-big">
            <b>{fmt(now.followers)}</b>
            <span className="muted-text">{now.new_followers ? t('d.pro.audienceGained', { count: fmt(now.new_followers), days }) : t('d.pro.audienceNoneNew', { days })}</span>
          </div>
          <LineChart data={followersOverTime(now)} name={t('profile.stat.followers')} height={150} color={SERIES[2]} />
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
  if (!top.length) return <p className="muted-text">{t('d.pro.nothingSharedShare')}</p>;
  const ids = top.map((x) => x.id);
  return (
    <div className="pro-top-grid">
      {top.map((x) => (
        <button key={x.id} className="pro-top" onClick={() => open(x, ids)} title={`${views(x.views)} · ${likes(x.likes)}`} aria-label={tn(x.kind === 'reel' ? 'd.pro.shortViews' : 'd.pro.postViews', x.views, { count: fmt(x.views) })}>
          {thumbOf(x) ? <img src={thumbOf(x)} alt="" /> : <span className="pro-top-blank" />}
          {x.kind === 'reel' ? (
            <span className="pro-top-kind">
              <Icon name="reels" size={14} color="#fff" />
            </span>
          ) : null}
          <span className="pro-top-stats">
            <Icon name="eye" size={14} color="#fff" /> {fmt(x.views)}
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
        <Tile label={t('profile.tab.posts')} value={now.posts} before={before.posts} days={days} />
        <Tile label={t('tabs.clips')} value={now.reels} before={before.reels} days={days} />
        <Tile label={t('profile.alertsStories')} value={now.stories} before={before.stories} days={days} />
        <Tile label={t('d.pro.likes')} value={now.likes} before={before.likes} days={days} />
        <Tile label={t('live.comments')} value={now.comments} before={before.comments} days={days} />
        <Tile label={t('profile.tab.reposts')} value={now.reposts} before={before.reposts} days={days} />
      </div>
      <div className="pro-grid-2 wide-left">
        <section className="pro-card">
          <div className="pro-card-head">
            <h3>{t('d.pro.postsAndShortsPeriod')}</h3>
            <span className="muted-text small">{t('d.pro.mostViewedFirst')}</span>
          </div>
          {now.top.length ? (
            <div className="table-wrap">
              <table className="table pro-table">
                <thead>
                  <tr>
                    <th>{t('d.pro.content')}</th>
                    <th>{t('d.pro.sharedOn')}</th>
                    <th className="num">{t('d.pro.views')}</th>
                    <th className="num">{t('d.pro.likes')}</th>
                    <th className="num">{t('live.comments')}</th>
                  </tr>
                </thead>
                <tbody>
                  {now.top.map((x) => (
                    <tr key={x.id} onClick={() => open(x, ids)}>
                      <td>
                        <span className="pro-ad-cell">
                          <span className="pro-ad-thumb">{thumbOf(x) ? <img src={thumbOf(x)} alt="" /> : <Icon name="image" size={18} />}</span>
                          <span>{x.kind === 'reel' ? t('createFlow.short') : t('d.pro.post')}</span>
                        </span>
                      </td>
                      <td className="pro-nowrap">{shortDay(x.created_at)}</td>
                      <td className="num">{fmt(x.views)}</td>
                      <td className="num">{fmt(x.likes)}</td>
                      <td className="num">{fmt(x.comments)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted-text">{t('d.pro.nothingShared')}</p>
          )}
        </section>
        <section className="pro-card">
          <div className="pro-card-head">
            <h3>{t('d.pro.whereViews')}</h3>
          </div>
          <Donut name={t('d.pro.whereViews')} slices={[{ label: t('d.pro.postsAndShorts'), value: now.post_views }, { label: t('profile.alertsStories'), value: now.story_views }]} />
          <p className="muted-text small">{tn('d.pro.differentPeople', now.accounts, { count: fmt(now.accounts) })}</p>
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
        <Tile label={t('liveSetup.followers')} value={now.followers} days={days} sub={t('d.pro.followingCount', { count: me.following_count })} />
        <Tile label={t('d.pro.newFollowers')} value={now.new_followers} before={before.new_followers} days={days} spark={now.days.map((d) => d.followers)} color={SERIES[2]} />
        <Tile label={t('d.pro.accountsReached')} value={now.accounts} before={before.accounts} days={days} />
      </div>
      <div className="pro-grid-2">
        <section className="pro-card">
          <div className="pro-card-head">
            <h3>{t('d.pro.followersOverTime')}</h3>
          </div>
          <LineChart data={followersOverTime(now)} name={t('profile.stat.followers')} height={220} color={SERIES[2]} />
        </section>
        <section className="pro-card">
          <div className="pro-card-head">
            <h3>{t('d.pro.newFollowersByDay')}</h3>
          </div>
          <ColumnChart data={now.days.map((d) => ({ x: d.d, y: d.followers }))} name={t('d.pro.chartNewFollowers')} height={220} color={SERIES[2]} />
        </section>
      </div>
      <section className="pro-card">
        <div className="pro-card-head">
          <h3>{t('d.pro.newFollowers')}</h3>
          <span className="muted-text small">{t('creatorSubs.since', { day: longDay(from) })}</span>
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
          <p className="muted-text">{t('d.pro.nobodyNew')}</p>
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
        <h3>{t('d.pro.income')}</h3>
        <Link to="/dashboard/income" className="link-btn">
          {t('d.pro.seeIncome')}
        </Link>
      </div>
      {!d ? (
        inc.error ? <Failed error={inc.error} retry={inc.reload} /> : <Spinner size={22} />
      ) : (
        <ul className="pro-lines">
          <li>
            <span>{t('createFlow.subscribers')}</span>
            <b>{fmt(d.live.length)}</b>
          </li>
          <li>
            <span>{t('d.pro.subsAMonth')}</span>
            <b>{money(d.monthly)}</b>
          </li>
          <li>
            <span>{t('d.pro.raisedByYours')}</span>
            <b>{money(d.raised)}</b>
          </li>
          <li>
            <span>{t('common.communityPlus')}</span>
            <b className={me.plus ? 'pro-ok-text' : ''}>{me.plus ? t('settings.plusActive') : t('d.pro.notActive')}</b>
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
          <span className="pro-tile-label">{t('createFlow.subscribers')}</span>
          <div className="pro-tile-row">
            <b>{fmt(d.live.length)}</b>
          </div>
          <span className="pro-tile-sub">{me.sub_price_pence ? t('d.pro.atPriceAMonth', { price: money(me.sub_price_pence) }) : t('d.pro.noSubsOffered')}</span>
        </div>
        <div className="pro-tile">
          <span className="pro-tile-label">{t('d.pro.subIncomeAMonth')}</span>
          <div className="pro-tile-row">
            <b>{money(d.monthly)}</b>
          </div>
          <span className="pro-tile-sub">{t('d.pro.afterFee', { amount: money(d.yours), fee: d.fee })}</span>
        </div>
        <div className="pro-tile">
          <span className="pro-tile-label">{t('d.pro.raisedByYours')}</span>
          <div className="pro-tile-row">
            <b>{money(d.raised)}</b>
          </div>
          <span className="pro-tile-sub">{tn('d.pro.fromSupporters', d.donors, { count: fmt(d.donors) })}</span>
        </div>
        <div className="pro-tile">
          <span className="pro-tile-label">{t('common.communityPlus')}</span>
          <div className="pro-tile-row">
            <b className={me.plus ? 'pro-ok-text' : ''}>{me.plus ? t('settings.plusActive') : t('settings.repliesOff')}</b>
          </div>
          <span className="pro-tile-sub">
            {me.plus ? (
              until ? (
                t('d.pro.until', { day: until })
              ) : (
                t('settings.plusActive')
              )
            ) : (
              <Link to="/plus" className="link-btn small">
                {t('d.pro.getPlus')}
              </Link>
            )}
          </span>
        </div>
      </div>

      <div className="pro-grid-2 wide-left">
        <section className="pro-card">
          <div className="pro-card-head">
            <h3>{d.live.length ? t('d.pro.subscribersCount', { count: d.live.length }) : t('createFlow.subscribers')}</h3>
            <span className="muted-text small">{me.sub_price_pence ? t('creatorSubs.youOffer', { cost: t('plus.perMonth', { price: money(me.sub_price_pence) }) }) : ''}</span>
          </div>
          {d.subs.length ? (
            <div className="pro-people list">
              {d.subs.map((s) => {
                const ends = s.cancel_at_period_end && s.current_period_end ? shortDay(s.current_period_end) : '';
                const since = shortDay(s.created_at);
                const standing =
                  s.status === 'past_due'
                    ? ends
                      ? t('d.pro.paymentDueEnds', { end: ends })
                      : t('creatorSubs.paymentDue')
                    : ends
                      ? t('d.pro.sinceEnds', { day: since, end: ends })
                      : t('creatorSubs.since', { day: since });
                return (
                  <div key={s.id} className="pro-person">
                    <Avatar src={s.profile?.avatar_url} name={s.profile?.username ?? '?'} size={40} />
                    <span className="row-text">
                      <b>{s.profile?.username ?? t('creatorSubs.someone')}</b>
                      <span>{standing}</span>
                    </span>
                    <span className="muted-text small pro-nowrap">{t('creatorSubs.perMo', { price: money(s.amount_pence) })}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted-text">
              {me.sub_price_pence ? (
                t('d.pro.nobodySubscribes')
              ) : (
                <>
                  {t('d.pro.offerSubs')}{' '}
                  <Link to="/accounts/subscriptions" className="link-btn inline">
                    {t('d.pro.setMonthlyPrice')}
                  </Link>
                </>
              )}
            </p>
          )}
        </section>
        <section className="pro-card">
          <div className="pro-card-head">
            <h3>{t('creatorSubs.payouts')}</h3>
          </div>
          <PayoutBox />
        </section>
      </div>

      <section className="pro-card">
        <div className="pro-card-head">
          <h3>{t('d.pro.yourFundraisers')}</h3>
          <Link to="/fundraisers/new" className="link-btn">
            {t('d.pro.startFundraiser')}
          </Link>
        </div>
        {d.funds.length ? (
          <div className="pro-fund-list">
            {d.funds.map((f) => (
              <FundraiserRow key={f.id} f={f} />
            ))}
          </div>
        ) : (
          <p className="muted-text">{t('d.pro.noFundraisersStarted')}</p>
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
      return { key: `${from.getFullYear()}-${from.getMonth()}`, from, to, label: from.toLocaleDateString(dateLocale(), { month: 'long' }), short: from.toLocaleDateString(dateLocale(), { month: 'short' }) };
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
        <h3>{t('d.pro.monthlyRecap')}</h3>
        <div className="pro-chips small" role="tablist" aria-label={t('d.pro.month')}>
          {months.map((m, i) => (
            <button key={m.key} role="tab" aria-selected={at === i} className={'pro-chip' + (at === i ? ' on' : '')} onClick={() => setAt(i)}>
              {m.short}
            </button>
          ))}
        </div>
      </div>
      <div className="pro-recap-banner">
        <span>{month.from.getFullYear()}</span>
        <b>{t('d.pro.yourMonth', { month: month.label })}</b>
        <p>
          {!s
            ? t('d.pro.addingUp')
            : quiet
              ? t('d.pro.quietMonth')
              : t('d.pro.recapLine', { views: views(s.views), people: tn('d.pro.peopleCount', s.accounts, { count: fmt(s.accounts) }), followers: tn('d.pro.newFollowerCount', s.new_followers, { count: fmt(s.new_followers) }) })}
        </p>
      </div>
      {stats.error && !s ? (
        <Failed error={stats.error} retry={stats.reload} />
      ) : !s ? null : (
        <>
          <ul className="pro-recap-tiles">
            <li><b>{fmt(s.views)}</b><span>{t('d.pro.views')}</span></li>
            <li><b>{fmt(s.accounts)}</b><span>{t('d.pro.peopleReached')}</span></li>
            <li><b>{fmt(s.likes)}</b><span>{t('d.pro.likes')}</span></li>
            <li><b>{fmt(s.comments)}</b><span>{t('live.comments')}</span></li>
            <li><b>{fmt(s.new_followers)}</b><span>{t('d.pro.newFollowers')}</span></li>
            <li><b>{fmt(shared(s))}</b><span>{t('d.pro.sharedCount')}</span></li>
          </ul>
          {top ? (
            <Link to={'/p/' + top.id} className="pro-recap-top">
              {thumbOf(top) ? <img src={thumbOf(top)} alt="" /> : <span className="pro-top-blank" />}
              <span className="grow">
                <span className="pro-eyebrow">{t('d.pro.mostViewed')}</span>
                <b>{views(top.views)}</b>
                <span className="muted-text small">
                  {likes(top.likes)} · {comments(top.comments)}
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
