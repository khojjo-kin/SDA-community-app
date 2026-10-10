// Ad tools: the ads you have paid for (filter, sort, choose columns), promoting a post, billing and
// payouts. An ad puts one of your posts at the top of For you and Explore, labelled Sponsored, for the
// days paid for. Each ad is a one-off card payment: Community has no ad balance to top up.
import React, { useEffect, useMemo, useState } from 'react';
import { fetchUserPosts, myPromotions, promotePost, settlePayment } from 'shared/api';
import type { PaymentsConfig, Post, Promotion } from 'shared/types';
import { useMe } from '../lib/me';
import { money, paymentsConfig } from '../lib/pay';
import { nav } from '../lib/router';
import { AccountSwitcher } from '../ui/accounts';
import { errText } from 'shared/theme';
import { Failed, Icon, Link, Modal, Spinner, toast, useLoad } from '../ui/kit';
import { Dropdown, longDay, Notice, oneOff, pay, plural, shortDay } from './pro-kit';
import { PaymentHistory, PayoutBox, SavedCards } from './pro-money';

type Filter = 'all' | 'active' | 'ended' | 'refunded';
type Sort = 'latest' | 'oldest' | 'views' | 'spend' | 'ending';
type Col = 'views' | 'goal' | 'spend' | 'status' | 'ends' | 'days' | 'started';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All ads' },
  { value: 'active', label: 'Active' },
  { value: 'ended', label: 'Ended' },
  { value: 'refunded', label: 'Refunded' },
];
const SORTS: { value: Sort; label: string }[] = [
  { value: 'latest', label: 'Latest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'views', label: 'Most views' },
  { value: 'spend', label: 'Most spent' },
  { value: 'ending', label: 'Ending soonest' },
];
const COLUMNS: { value: Col; label: string }[] = [
  { value: 'views', label: 'Views' },
  { value: 'goal', label: 'Ad goal' },
  { value: 'spend', label: 'Spend' },
  { value: 'status', label: 'Status' },
  { value: 'ends', label: 'Ends' },
  { value: 'days', label: 'Days' },
  { value: 'started', label: 'Started' },
];
const DEFAULT_COLS: Col[] = ['views', 'goal', 'spend', 'status', 'ends'];
const COLS_KEY = 'community.adColumns';
const NEW_LOOK_KEY = 'community.adToolsNewLook';

/** The lengths most people pick; the stepper covers anything from 1 to 30. */
const CHOICES = [1, 3, 7, 14, 30];
const MAX_DAYS = 30;

function readCols(): Col[] {
  try {
    const saved = JSON.parse(localStorage.getItem(COLS_KEY) ?? 'null');
    if (Array.isArray(saved)) return COLUMNS.map((c) => c.value).filter((c) => saved.includes(c));
  } catch {
    // no saved choice
  }
  return DEFAULT_COLS;
}

/** Active (and running), ended, or refunded: from the row and the clock, as on the iPhone. */
function standing(p: Promotion): 'active' | 'ended' | 'refunded' {
  if (p.status === 'refunded') return 'refunded';
  // The row stays 'active' until the nightly tidy-up, so the end date decides.
  if (p.status === 'active' && p.ends_at && new Date(p.ends_at) > new Date()) return 'active';
  return 'ended';
}
const STANDING_LABEL = { active: 'Active', ended: 'Ended', refunded: 'Refunded' };

const thumbOf = (post?: Post | null) => {
  const first = post?.media?.[0];
  return first ? (first.type === 'video' ? first.poster || '' : first.url) : '';
};

export function AdTools() {
  const { me } = useMe();
  const ads = useLoad(() => myPromotions(me.id).then((rows) => rows.filter((r) => r.status !== 'failed')), [me.id]);
  const posts = useLoad(() => fetchUserPosts(me.id), [me.id]);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('latest');
  const [cols, setCols] = useState<Col[]>(readCols);
  const [creating, setCreating] = useState<null | { postId?: string }>(null);
  const [switching, setSwitching] = useState(false);
  const [newLook, setNewLook] = useState(() => {
    try {
      return localStorage.getItem(NEW_LOOK_KEY) !== '1';
    } catch {
      return true;
    }
  });

  const toggleCol = (c: Col) => {
    const next = cols.includes(c) ? cols.filter((x) => x !== c) : COLUMNS.map((x) => x.value).filter((x) => x === c || cols.includes(x));
    setCols(next);
    try {
      localStorage.setItem(COLS_KEY, JSON.stringify(next));
    } catch {
      // kept for this visit only
    }
  };
  const closeNewLook = () => {
    setNewLook(false);
    try {
      localStorage.setItem(NEW_LOOK_KEY, '1');
    } catch {
      // shown again next time
    }
  };

  // Your current top post: the most liked of the last 28 days.
  const top = useMemo(() => {
    const since = Date.now() - 28 * 86400e3;
    return [...(posts.data ?? [])].filter((p) => new Date(p.created_at).getTime() >= since).sort((a, b) => b.like_count - a.like_count)[0] ?? null;
  }, [posts.data]);

  const rows = useMemo(() => {
    const list = (ads.data ?? []).filter((p) => filter === 'all' || standing(p) === filter);
    const time = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
    const by: Record<Sort, (a: Promotion, b: Promotion) => number> = {
      latest: (a, b) => time(b.created_at) - time(a.created_at),
      oldest: (a, b) => time(a.created_at) - time(b.created_at),
      views: (a, b) => (b.post?.view_count ?? 0) - (a.post?.view_count ?? 0),
      spend: (a, b) => b.amount_pence - a.amount_pence,
      ending: (a, b) => (time(a.ends_at) || Infinity) - (time(b.ends_at) || Infinity),
    };
    return list.sort(by[sort]);
  }, [ads.data, filter, sort]);

  const has = (c: Col) => cols.includes(c);
  let table: React.ReactNode;
  if (ads.error && !ads.data) table = <Failed error={ads.error} retry={ads.reload} />;
  else if (!ads.data) table = <Spinner />;
  else
    table = (
      <>
        <div className="table-wrap">
          <table className="table pro-table pro-ads-table">
            <thead>
              <tr>
                <th>Ads</th>
                {has('views') ? <th className="num">Views</th> : null}
                {has('goal') ? <th>Ad goal</th> : null}
                {has('spend') ? <th className="num">Spend</th> : null}
                {has('status') ? <th>Status</th> : null}
                {has('ends') ? <th>Ends</th> : null}
                {has('days') ? <th className="num">Days</th> : null}
                {has('started') ? <th>Started</th> : null}
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const st = standing(p);
                const thumb = thumbOf(p.post);
                return (
                  <tr key={p.id} className="pro-ad-row" onClick={() => p.post && nav('/p/' + p.post.id)}>
                    <td>
                      <span className="pro-ad-cell">
                        <span className="pro-ad-thumb">{thumb ? <img src={thumb} alt="" /> : <Icon name={p.post ? 'image' : 'trash'} size={18} />}</span>
                        <span className="pro-ad-caption">{p.post ? p.post.caption || 'Post' : 'Post deleted'}</span>
                      </span>
                    </td>
                    {has('views') ? <td className="num">{p.post?.view_count != null ? p.post.view_count.toLocaleString('en-GB') : '–'}</td> : null}
                    {has('goal') ? <td className="pro-nowrap">Reach more people</td> : null}
                    {has('spend') ? <td className="num">{money(p.amount_pence, p.currency)}</td> : null}
                    {has('status') ? (
                      <td>
                        <span className={'pro-tag ' + (st === 'active' ? 'ok' : st === 'refunded' ? 'bad' : '')}>{STANDING_LABEL[st]}</span>
                      </td>
                    ) : null}
                    {has('ends') ? <td className="pro-nowrap">{p.ends_at ? shortDay(p.ends_at) : '–'}</td> : null}
                    {has('days') ? <td className="num">{p.days}</td> : null}
                    {has('started') ? <td className="pro-nowrap">{shortDay(p.starts_at ?? p.created_at)}</td> : null}
                    <td className="pro-row-act">
                      {p.post ? (
                        <button
                          className="btn quiet small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCreating({ postId: p.post!.id });
                          }}
                        >
                          Promote again
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 ? (
          <div className="pro-empty">
            <span className="pro-empty-ring">
              <Icon name="image" size={30} stroke={1.6} />
            </span>
            <h3>{ads.data.length === 0 ? 'No ads available' : `No ${FILTERS.find((f) => f.value === filter)!.label.toLowerCase()} ads`}</h3>
            <p>{ads.data.length === 0 ? 'Ads that you create will appear here.' : 'Try another filter.'}</p>
          </div>
        ) : null}
      </>
    );

  return (
    <div className="pro-split">
      <section className="pro-main">
        <div className="pro-section-head">
          <h2 className="pro-with-info">
            Manage ads
            <span className="pro-info" tabIndex={0} aria-label="About ads" data-tip="An ad shows one of your posts at the top of For you and Explore, labelled Sponsored, for the days you pay for.">
              <Icon name="info" size={18} />
            </span>
          </h2>
          <div className="pro-filters">
            <Dropdown label={FILTERS.find((f) => f.value === filter)!.label} items={FILTERS} value={filter} onChange={setFilter} menuLabel="Show" />
            <Dropdown label={SORTS.find((s) => s.value === sort)!.label} items={SORTS} value={sort} onChange={setSort} menuLabel="Sort by" />
            <Dropdown label="Columns" icon={<Icon name="sliders" size={18} />} items={COLUMNS} multi chosen={cols} onToggle={toggleCol} align="right" />
          </div>
        </div>
        {table}
      </section>

      <aside className="pro-aside">
        <h3 className="pro-aside-h">Create your next ad</h3>
        <button className="pro-next" disabled={!top} onClick={() => top && setCreating({ postId: top.id })}>
          <span className="pro-next-thumb">{top && thumbOf(top) ? <img src={thumbOf(top)} alt="" /> : <Icon name="image" size={22} />}</span>
          <span className="grow">
            <b>Your current top post</b>
            <span>{top ? 'Reach more people with your most liked post in the last 28 days.' : posts.data ? 'Share a post to see your top post here.' : 'Finding your top post…'}</span>
          </span>
          <Icon name="right" size={20} />
        </button>
        <button className="pro-next" onClick={() => setCreating({})}>
          <span className="pro-next-thumb plus">
            <Icon name="plus" size={26} stroke={1.6} />
          </span>
          <span className="grow">
            <b>Create ad</b>
          </span>
          <Icon name="right" size={20} />
        </button>

        <h3 className="pro-aside-h">Billing and payments</h3>
        <p className="muted-text small pro-aside-p">Each ad is paid once by card. It doesn't renew.</p>
        <SavedCards compact />
        <Link to="/dashboard/billing" className="pro-link-row">
          <Icon name="receipt" size={20} />
          <span className="grow">Billing and payments</span>
          <Icon name="right" size={18} />
        </Link>

        <h3 className="pro-aside-h">Payouts</h3>
        <p className="muted-text small pro-aside-p">For gifts to your fundraisers.</p>
        <PayoutBox compact />
        <Link to="/dashboard/fundraisers" className="pro-link-row">
          <Icon name="heart" size={20} />
          <span className="grow">Your fundraisers</span>
          <Icon name="right" size={18} />
        </Link>

        <h3 className="pro-aside-h">Ad account</h3>
        <div className="pro-account">
          <div className="grow">
            <b>{me.full_name || me.username}</b>
            <span className="muted-text small">@{me.username} · GBP</span>
          </div>
          <button className="link-btn" onClick={() => setSwitching(true)}>
            Switch
          </button>
        </div>
      </aside>

      {creating ? (
        <CreateAd
          posts={posts.data ?? []}
          initialPostId={creating.postId}
          onClose={() => setCreating(null)}
          onDone={() => {
            setCreating(null);
            ads.reload();
            posts.reload();
          }}
        />
      ) : null}
      {newLook ? <NewLook onClose={closeNewLook} /> : null}
      {switching ? <AccountSwitcher onClose={() => setSwitching(false)} /> : null}
    </div>
  );
}

/* ---------- Create ad: pick a post, choose the days, pay ---------- */

function CreateAd({ posts, initialPostId, onClose, onDone }: { posts: Post[]; initialPostId?: string; onClose: () => void; onDone: () => void }) {
  const { me } = useMe();
  const config = useLoad<PaymentsConfig>(() => paymentsConfig(true), []);
  const [postId, setPostId] = useState(initialPostId ?? '');
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  // The card form is open on top: this dialog steps aside until it closes.
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const post = posts.find((p) => p.id === postId) ?? null;

  const step = (by: number) => setDays((d) => Math.min(MAX_DAYS, Math.max(1, d + by)));

  const go = async () => {
    if (!post || !config.data || busy) return;
    setBusy(true);
    setError('');
    try {
      const r = await promotePost(post.id, days);
      const total = money(r.amount, r.currency);
      setPaying(true);
      const ok = await pay({ title: `Promote your post for ${plural(days, 'day')}`, detail: oneOff(total), amountPence: r.amount, currency: r.currency, clientSecret: r.client_secret, intent: 'payment', action: `Pay ${total}` });
      setPaying(false);
      if (!ok) return;
      const settled = await settlePayment(r.payment_intent_id).catch(() => null);
      toast(settled?.settled ? 'Your post is being promoted' : 'Payment received — it may take a minute to show');
      onDone();
    } catch (e) {
      setPaying(false);
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  };

  if (paying) return null;

  // Step 1: choose one of your posts.
  if (!post) {
    return (
      <Modal title="Create ad" onClose={onClose} wide className="pro-modal">
        <div className="pro-modal-body">
          <p className="muted-text">Choose a post to promote. It will be shown at the top of For you and Explore, labelled Sponsored.</p>
          {posts.length ? (
            <div className="pro-pick-grid" role="listbox" aria-label="Your posts">
              {posts.map((p) => (
                <button key={p.id} role="option" aria-selected={false} className="pro-pick" title={p.caption} onClick={() => setPostId(p.id)}>
                  {thumbOf(p) ? <img src={thumbOf(p)} alt={p.caption || 'Post'} /> : <Icon name="image" size={24} />}
                  {p.kind === 'reel' ? (
                    <span className="pro-pick-badge">
                      <Icon name="reels" size={14} color="#fff" />
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="pro-empty small">
              <h3>No posts yet</h3>
              <p>Share a post first, then promote it here.</p>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  // Step 2: how long, the total, and pay.
  const c = config.data;
  const total = c ? money(days * c.ad_day_pence, c.currency) : '';
  const until = post.boosted_until && new Date(post.boosted_until) > new Date() ? longDay(post.boosted_until) : '';
  return (
    <Modal title="Promote post" onClose={() => !busy && onClose()} wide className="pro-modal" closeOutside={!busy}>
      <div className="pro-modal-body">
        <div className="pro-promo-post">
          <span className="pro-promo-thumb">{thumbOf(post) ? <img src={thumbOf(post)} alt="" /> : <Icon name="image" size={24} />}</span>
          <div className="grow">
            <p className={post.caption ? '' : 'muted-text'}>{post.caption || 'No caption'}</p>
            {until ? <p className="pro-ok-text small">Promoted until {until}</p> : null}
          </div>
          {initialPostId ? null : (
            <button className="link-btn" onClick={() => setPostId('')} disabled={busy}>
              Change
            </button>
          )}
        </div>
        {config.error && !c ? (
          <Failed error={config.error} retry={config.reload} />
        ) : !c ? (
          <Spinner />
        ) : !c.ready ? (
          <Notice>Payments aren't available yet.</Notice>
        ) : (
          <>
            <div>
              <h3 className="pro-sub-h">How long</h3>
              <div className="pro-chips" role="radiogroup" aria-label="How long">
                {CHOICES.map((n) => (
                  <button key={n} role="radio" aria-checked={days === n} className={'pro-chip' + (days === n ? ' on' : '')} onClick={() => setDays(n)} disabled={busy}>
                    {plural(n, 'day')}
                  </button>
                ))}
              </div>
              <div className="pro-stepper">
                <button className="icon-btn" aria-label="One day fewer" disabled={days <= 1 || busy} onClick={() => step(-1)}>
                  <span className="pro-minus" />
                </button>
                <b aria-live="polite">{plural(days, 'day')}</b>
                <button className="icon-btn" aria-label="One day more" disabled={days >= MAX_DAYS || busy} onClick={() => step(1)}>
                  <Icon name="plus" size={20} stroke={2.2} />
                </button>
              </div>
            </div>
            <div className="pro-total">
              <div>
                <b>Total</b>
                <span className="muted-text small">
                  {plural(days, 'day')} × {money(c.ad_day_pence, c.currency)} a day
                </span>
              </div>
              <strong>{total}</strong>
            </div>
            <p className="pro-explain">
              <Icon name="boost" size={20} />
              <span>
                Your post is shown at the top of For you and Explore, labelled Sponsored, until the days run out. Ad goal: reach more people. It runs straight after paying.
                {until ? ` It's already promoted until ${until}, so these days are added on after that.` : ''}
              </span>
            </p>
            {me.is_private ? (
              <Notice kind="warn" icon={<Icon name="lock" size={18} />}>
                Your account is private, so new people can't see your posts. Make it public in <Link to="/accounts/privacy" className="link-btn inline">Privacy</Link> to promote this post.
              </Notice>
            ) : (
              <>
                {error ? <p className="form-error">{error}</p> : null}
                <button className="btn block big" disabled={busy} onClick={go}>
                  {busy ? 'Starting payment…' : `Pay ${total}`}
                </button>
                <p className="pro-terms center">{oneOff(total)}</p>
              </>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

/* ---------- "Ad tools has a new look" ---------- */

function NewLook({ onClose }: { onClose: () => void }) {
  return (
    <Modal onClose={onClose} className="pro-newlook" closeOutside={false}>
      <div className="pro-newlook-body">
        <div className="pro-art" aria-hidden="true">
          <svg className="pro-art-lines" viewBox="0 0 240 124" width="240" height="124">
            <path d="M44 34 H84 M44 92 H84 M156 34 H196 M156 92 H196" stroke="currentColor" strokeWidth="1.6" fill="none" />
            <rect x="84" y="24" width="72" height="58" rx="5" stroke="currentColor" strokeWidth="2.2" fill="none" />
            <rect x="91" y="31" width="58" height="44" rx="2" stroke="currentColor" strokeWidth="1.6" fill="none" />
            <path d="M74 90 H166 L160 98 H80 Z" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinejoin="round" />
          </svg>
          <span className="pro-art-screen">
            <Icon name="boost" size={26} />
          </span>
          <span className="pro-art-dot a">
            <Icon name="draw" size={20} />
          </span>
          <span className="pro-art-dot b">
            <Icon name="dashboard" size={20} />
          </span>
          <span className="pro-art-dot c">
            <Icon name="pulse" size={20} />
          </span>
          <span className="pro-art-dot d">
            <Icon name="card" size={20} />
          </span>
        </div>
        <h2>Ad tools has a new look</h2>
        <p>We've made it easier to compare how your ads do, act on them and focus on what matters most, all in one place. You may notice updates over time.</p>
      </div>
      <button className="pro-newlook-ok" onClick={onClose}>
        Got it
      </button>
    </Modal>
  );
}

/* ---------- Billing and payments ---------- */

export function Billing() {
  useEffect(() => {
    // Opened from the right column: start at the top.
    window.scrollTo(0, 0);
  }, []);
  return (
    <div className="pro-billing">
      <Link to="/dashboard/ads" className="pro-back">
        <Icon name="back" size={18} /> Ad tools
      </Link>
      <div className="pro-split">
        <section className="pro-main">
          <div className="pro-section-head">
            <div>
              <h2>Payment history</h2>
              <p className="muted-text">Ads, gifts and Community Plus, newest first.</p>
            </div>
          </div>
          <PaymentHistory />
        </section>
        <aside className="pro-aside">
          <h3 className="pro-aside-h">Payment methods</h3>
          <p className="muted-text small pro-aside-p">Plus renews with your default card. Payments are handled by Stripe; Community never sees your card number.</p>
          <SavedCards />
        </aside>
      </div>
    </div>
  );
}
