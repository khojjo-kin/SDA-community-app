// Ad tools: the ads you have paid for (filter, sort, choose columns), promoting a post, billing and
// payouts. An ad puts one of your posts at the top of For you and Explore, labelled Sponsored, for the
// days paid for. Each ad is a one-off card payment: Community has no ad balance to top up.
import React, { useEffect, useMemo, useState } from 'react';
import { fetchUserPosts, myPromotions, promotePost, settlePayment } from 'shared/api';
import type { PaymentsConfig, Post, Promotion } from 'shared/types';
import { dateLocale, t, tn, tSplit } from '../lib/i18n';
import { useMe } from '../lib/me';
import { money, paymentsConfig } from '../lib/pay';
import { nav } from '../lib/router';
import { AccountSwitcher } from '../ui/accounts';
import { errText } from 'shared/theme';
import { Failed, Icon, Link, Modal, Spinner, toast, useLoad } from '../ui/kit';
import { Dropdown, longDay, Notice, oneOff, pay, shortDay } from './pro-kit';
import { PaymentHistory, PayoutBox, SavedCards } from './pro-money';

type Filter = 'all' | 'active' | 'ended' | 'refunded';
type Sort = 'latest' | 'oldest' | 'views' | 'spend' | 'ending';
type Col = 'views' | 'goal' | 'spend' | 'status' | 'ends' | 'days' | 'started';

// The labels in these lists are keys for t(), read where the menus are drawn.
const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'd.pro.allAds' },
  { value: 'active', label: 'd.pro.adActive' },
  { value: 'ended', label: 'd.pro.adEnded' },
  { value: 'refunded', label: 'd.pro.adRefunded' },
];
const SORTS: { value: Sort; label: string }[] = [
  { value: 'latest', label: 'd.pro.sortLatest' },
  { value: 'oldest', label: 'd.pro.sortOldest' },
  { value: 'views', label: 'd.pro.sortViews' },
  { value: 'spend', label: 'd.pro.sortSpend' },
  { value: 'ending', label: 'd.pro.sortEnding' },
];
const COLUMNS: { value: Col; label: string }[] = [
  { value: 'views', label: 'd.pro.views' },
  { value: 'goal', label: 'd.pro.adGoal' },
  { value: 'spend', label: 'd.pro.spend' },
  { value: 'status', label: 'd.pro.status' },
  { value: 'ends', label: 'd.pro.ends' },
  { value: 'days', label: 'd.pro.days' },
  { value: 'started', label: 'd.pro.started' },
];
/** A list's labels in the app's language, for a menu. */
const shown = <T extends string>(list: { value: T; label: string }[]) => list.map((x) => ({ value: x.value, label: t(x.label) }));
/** What the table says when a filter leaves nothing to show. */
const NONE_LABEL: Record<Filter, string> = { all: 'd.pro.noAds', active: 'd.pro.noActiveAds', ended: 'd.pro.noEndedAds', refunded: 'd.pro.noRefundedAds' };
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
const STANDING_LABEL = { active: 'd.pro.adActive', ended: 'd.pro.adEnded', refunded: 'd.pro.adRefunded' };

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
                <th>{t('d.pro.ads')}</th>
                {has('views') ? <th className="num">{t('d.pro.views')}</th> : null}
                {has('goal') ? <th>{t('d.pro.adGoal')}</th> : null}
                {has('spend') ? <th className="num">{t('d.pro.spend')}</th> : null}
                {has('status') ? <th>{t('d.pro.status')}</th> : null}
                {has('ends') ? <th>{t('d.pro.ends')}</th> : null}
                {has('days') ? <th className="num">{t('d.pro.days')}</th> : null}
                {has('started') ? <th>{t('d.pro.started')}</th> : null}
                <th aria-label={t('d.pro.actions')} />
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
                        <span className="pro-ad-caption">{p.post ? p.post.caption || t('d.pro.post') : t('ssPub.deleted')}</span>
                      </span>
                    </td>
                    {has('views') ? <td className="num">{p.post?.view_count != null ? p.post.view_count.toLocaleString(dateLocale()) : '–'}</td> : null}
                    {has('goal') ? <td className="pro-nowrap pro-ad-goal">{t('d.pro.reachMore')}</td> : null}
                    {has('spend') ? <td className="num">{money(p.amount_pence, p.currency)}</td> : null}
                    {has('status') ? (
                      <td>
                        <span className={'pro-tag ' + (st === 'active' ? 'ok' : st === 'refunded' ? 'bad' : '')}>{t(STANDING_LABEL[st])}</span>
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
                          {t('d.pro.promoteAgain')}
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
            <h3>{t(ads.data.length === 0 ? 'd.pro.noAds' : NONE_LABEL[filter])}</h3>
            {ads.data.length === 0 ? null : <p>{t('d.pro.tryAnotherFilter')}</p>}
          </div>
        ) : null}
      </>
    );

  return (
    <div className="pro-split">
      <section className="pro-main">
        <div className="pro-section-head">
          <h2>{t('d.pro.manageAds')}</h2>
          <div className="pro-filters">
            <Dropdown label={t(FILTERS.find((f) => f.value === filter)!.label)} items={shown(FILTERS)} value={filter} onChange={setFilter} menuLabel={t('d.pro.show')} />
            <Dropdown label={t(SORTS.find((s) => s.value === sort)!.label)} items={shown(SORTS)} value={sort} onChange={setSort} menuLabel={t('d.pro.sortBy')} />
            <Dropdown label={t('d.pro.columns')} icon={<Icon name="sliders" size={18} />} items={shown(COLUMNS)} multi chosen={cols} onToggle={toggleCol} align="right" />
          </div>
        </div>
        {table}
      </section>

      <aside className="pro-aside">
        <h3 className="pro-aside-h">{t('d.pro.nextAd')}</h3>
        <button className="pro-next" disabled={!top} onClick={() => top && setCreating({ postId: top.id })}>
          <span className="pro-next-thumb">{top && thumbOf(top) ? <img src={thumbOf(top)} alt="" /> : <Icon name="image" size={22} />}</span>
          <span className="grow">
            <b>{t('d.pro.topPost')}</b>
            {top ? null : <span>{posts.data ? t('d.pro.topPostNone') : t('d.pro.topPostFinding')}</span>}
          </span>
          <Icon name="right" size={20} />
        </button>
        <button className="pro-next" onClick={() => setCreating({})}>
          <span className="pro-next-thumb plus">
            <Icon name="plus" size={26} stroke={1.6} />
          </span>
          <span className="grow">
            <b>{t('d.pro.createAd')}</b>
          </span>
          <Icon name="right" size={20} />
        </button>

        <h3 className="pro-aside-h">{t('d.pro.billing')}</h3>
        <p className="muted-text small pro-aside-p">{t('d.pro.billingNote')}</p>
        <SavedCards compact />
        <Link to="/dashboard/billing" className="pro-link-row">
          <Icon name="receipt" size={20} />
          <span className="grow">{t('d.pro.billing')}</span>
          <Icon name="right" size={18} />
        </Link>

        <h3 className="pro-aside-h">{t('creatorSubs.payouts')}</h3>
        <PayoutBox compact />
        <Link to="/dashboard/fundraisers" className="pro-link-row">
          <Icon name="heart" size={20} />
          <span className="grow">{t('d.pro.yourFundraisers')}</span>
          <Icon name="right" size={18} />
        </Link>

        <h3 className="pro-aside-h">{t('d.pro.adAccount')}</h3>
        <div className="pro-account">
          <div className="grow">
            <b>{me.full_name || me.username}</b>
            <span className="muted-text small">@{me.username} · GBP</span>
          </div>
          <button className="link-btn" onClick={() => setSwitching(true)}>
            {t('d.pro.switch')}
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
      const ok = await pay({ title: tn('d.pro.promoteFor', days), detail: oneOff(total), amountPence: r.amount, currency: r.currency, clientSecret: r.client_secret, intent: 'payment', action: t('checkout.pay', { price: total }) });
      setPaying(false);
      if (!ok) return;
      const settled = await settlePayment(r.payment_intent_id).catch(() => null);
      toast(settled?.settled ? t('d.pro.promoting') : t('d.pro.paymentReceived'));
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
      <Modal title={t('d.pro.createAd')} onClose={onClose} wide className="pro-modal">
        <div className="pro-modal-body">
          {posts.length ? (
            <div className="pro-pick-grid" role="listbox" aria-label={t('d.pro.yourPosts')}>
              {posts.map((p) => (
                <button key={p.id} role="option" aria-selected={false} className="pro-pick" title={p.caption} onClick={() => setPostId(p.id)}>
                  {thumbOf(p) ? <img src={thumbOf(p)} alt={p.caption || t('d.pro.post')} /> : <Icon name="image" size={24} />}
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
              <h3>{t('profile.emptyNoPosts')}</h3>
              <p>{t('d.pro.shareFirst')}</p>
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
  // The words either side of the Privacy link.
  const privacy = tSplit('d.pro.privateNotice', 'privacy');
  return (
    <Modal title={t('d.pro.promotePost')} onClose={() => !busy && onClose()} wide className="pro-modal" closeOutside={!busy}>
      <div className="pro-modal-body">
        <div className="pro-promo-post">
          <span className="pro-promo-thumb">{thumbOf(post) ? <img src={thumbOf(post)} alt="" /> : <Icon name="image" size={24} />}</span>
          <div className="grow">
            <p className={post.caption ? '' : 'muted-text'}>{post.caption || t('d.pro.noCaption')}</p>
            {until ? <p className="pro-ok-text small">{t('d.pro.promotedUntil', { day: until })}</p> : null}
          </div>
          {initialPostId ? null : (
            <button className="link-btn" onClick={() => setPostId('')} disabled={busy}>
              {t('d.pro.changePost')}
            </button>
          )}
        </div>
        {config.error && !c ? (
          <Failed error={config.error} retry={config.reload} />
        ) : !c ? (
          <Spinner />
        ) : !c.ready ? (
          <Notice>{t('pay.unavailable')}</Notice>
        ) : (
          <>
            <div>
              <h3 className="pro-sub-h">{t('d.pro.howLong')}</h3>
              <div className="pro-chips" role="radiogroup" aria-label={t('d.pro.howLong')}>
                {CHOICES.map((n) => (
                  <button key={n} role="radio" aria-checked={days === n} className={'pro-chip' + (days === n ? ' on' : '')} onClick={() => setDays(n)} disabled={busy}>
                    {tn('d.pro.dayCount', n)}
                  </button>
                ))}
              </div>
              <div className="pro-stepper">
                <button className="icon-btn" aria-label={t('d.pro.oneDayFewer')} disabled={days <= 1 || busy} onClick={() => step(-1)}>
                  <span className="pro-minus" />
                </button>
                <b aria-live="polite">{tn('d.pro.dayCount', days)}</b>
                <button className="icon-btn" aria-label={t('d.pro.oneDayMore')} disabled={days >= MAX_DAYS || busy} onClick={() => step(1)}>
                  <Icon name="plus" size={20} stroke={2.2} />
                </button>
              </div>
            </div>
            <div className="pro-total">
              <div>
                <b>{t('pay.total')}</b>
                <span className="muted-text small">{tn('d.pro.daysTimes', days, { price: money(c.ad_day_pence, c.currency) })}</span>
              </div>
              <strong>{total}</strong>
            </div>
            <p className="pro-explain">
              <Icon name="boost" size={20} />
              <span>
                {t('d.pro.promoteExplain')}
                {until ? ' ' + t('d.pro.promoteExplainMore', { day: until }) : ''}
              </span>
            </p>
            {me.is_private ? (
              <Notice kind="warn" icon={<Icon name="lock" size={18} />}>
                {privacy[0]}
                <Link to="/accounts/privacy" className="link-btn inline">
                  {t('d.pro.privacy')}
                </Link>
                {privacy[1]}
              </Notice>
            ) : (
              <>
                {error ? <p className="form-error">{error}</p> : null}
                <button className="btn block big" disabled={busy} onClick={go}>
                  {busy ? t('d.pro.startingPayment') : t('checkout.pay', { price: total })}
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
        <h2>{t('d.pro.newLook')}</h2>
      </div>
      <button className="pro-newlook-ok" onClick={onClose}>
        {t('d.pro.gotIt')}
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
        <Icon name="back" size={18} /> {t('d.pro.adTools')}
      </Link>
      <div className="pro-split">
        <section className="pro-main">
          <div className="pro-section-head">
            <h2>{t('plus.paymentHistory')}</h2>
          </div>
          <PaymentHistory />
        </section>
        <aside className="pro-aside">
          <h3 className="pro-aside-h">{t('plus.paymentMethods')}</h3>
          <SavedCards />
        </aside>
      </div>
    </div>
  );
}
