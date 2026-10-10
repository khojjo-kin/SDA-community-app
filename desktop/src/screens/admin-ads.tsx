// Ads and fundraisers, as on the iPhone console (admin-ads): every paid ad, with a way to stop one
// early, and every fundraiser. It uses the iPhone app's own functions, so it works on the database as
// it is (the Money page's Boosts and Fundraisers tabs need the admin database update).
import React, { useMemo, useState } from 'react';
import { adminEndBoost, fetchAllFundraisers, fetchAllPromotions, profilesInOrder } from 'shared/api';
import { count, dayLabel } from 'shared/theme';
import type { Promotion, Profile } from 'shared/types';
import { money } from '../lib/pay';
import { nav } from '../lib/router';
import { Avatar, Empty, Failed, Icon, Spinner, ask, toast, toastError, useLoad } from '../ui/kit';

type Tone = 'ok' | 'warn' | 'muted';

/**
 * Where an ad stands. Ending an ad early clears the post's boost but leaves the promotion row as it
 * was paid for ('active' until its end date), so the post's own boost decides whether it is still showing.
 */
function adState(a: Promotion): { label: string; tone: Tone; running: boolean } {
  switch (a.status) {
    case 'active': {
      if (a.ends_at && new Date(a.ends_at).getTime() <= Date.now()) return { label: 'Finished', tone: 'muted', running: false };
      if (!a.post) return { label: 'Post deleted', tone: 'muted', running: false };
      if (!a.post.boosted) return { label: 'Ended early', tone: 'muted', running: false };
      return { label: 'Running', tone: 'ok', running: true };
    }
    case 'ended':
      return { label: 'Ended', tone: 'muted', running: false };
    case 'failed':
      return { label: 'Payment failed', tone: 'warn', running: false };
    case 'refunded':
      return { label: 'Refunded', tone: 'warn', running: false };
    default:
      return { label: 'Not paid yet', tone: 'muted', running: false };
  }
}

/** "9 Oct" this year, "9 Oct 2025" otherwise. */
const when = (iso: string) => {
  const d = new Date(iso);
  return dayLabel(d) + (d.getFullYear() === new Date().getFullYear() ? '' : ' ' + d.getFullYear());
};

/** A small square picture, or an icon when there is none. */
function Thumb({ src, icon }: { src?: string | null; icon: 'image' | 'heart' }) {
  return <span className="adm-thumb">{src ? <img src={src} alt="" /> : <Icon name={icon} size={22} />}</span>;
}

export function AdsAndFundraisers() {
  const [seg, setSeg] = useState<'ads' | 'fundraisers'>('ads');
  // A deleted post no longer carries its author, so those members are looked up directly.
  const ads = useLoad(async () => {
    const rows = await fetchAllPromotions();
    const missing = [...new Set(rows.filter((r) => !r.post).map((r) => r.user_id))];
    const people = missing.length ? await profilesInOrder(missing).catch(() => [] as Profile[]) : [];
    return { rows, people: Object.fromEntries(people.map((p) => [p.id, p])) as Record<string, Profile> };
  }, []);
  const funds = useLoad(() => fetchAllFundraisers(), []);
  const [ending, setEnding] = useState('');

  // Running ads first (those are the ones an admin may need to act on), newest first within each group.
  const adRows = useMemo(() => (ads.data?.rows ?? []).map((a) => ({ ad: a, state: adState(a) })).sort((x, y) => Number(y.state.running) - Number(x.state.running)), [ads.data]);
  const running = adRows.filter((r) => r.state.running).length;
  const openFunds = (funds.data ?? []).filter((f) => f.status === 'active').length;

  async function endNow(a: Promotion) {
    if (!a.post_id || ending) return;
    if (!(await ask('End this ad now?', 'The post stops showing as sponsored straight away. No money is refunded automatically.', 'End now'))) return;
    const postId = a.post_id;
    setEnding(a.id);
    try {
      await adminEndBoost(postId);
      if (ads.data) ads.set({ ...ads.data, rows: ads.data.rows.map((x) => (x.post_id === postId && x.post ? { ...x, post: { ...x.post, boosted: false, boosted_until: null } } : x)) });
      toast('Ad ended');
    } catch (e) {
      toastError(e);
    } finally {
      setEnding('');
    }
  }

  return (
    <div className="admin-wide adm-ads">
      <div className="dash-head">
        <div>
          <h1 className="page-title">Ads and fundraisers</h1>
          <p className="muted-text small">
            {ads.data ? count(running, 'ad') + ' running' : 'Ads loading'} · {funds.data ? count(openFunds, 'fundraiser') + ' open' : 'fundraisers loading'}
          </p>
        </div>
        <div className="seg left tight adm-tabs" role="tablist">
          <button role="tab" aria-selected={seg === 'ads'} className={seg === 'ads' ? 'on' : ''} onClick={() => setSeg('ads')}>Ads</button>
          <button role="tab" aria-selected={seg === 'fundraisers'} className={seg === 'fundraisers' ? 'on' : ''} onClick={() => setSeg('fundraisers')}>Fundraisers</button>
        </div>
      </div>
      {seg === 'ads' ? (
        ads.loading && !ads.data ? (
          <Spinner />
        ) : ads.error ? (
          <Failed error={ads.error} retry={ads.reload} />
        ) : !adRows.length ? (
          <Empty icon="boost" title="No ads yet" body="When a member pays to promote a post, it appears here." />
        ) : (
          <table className="table adm-ads-table">
            <thead>
              <tr>
                <th>Ad</th>
                <th>Status</th>
                <th>Paid</th>
                <th>When</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {adRows.map(({ ad: a, state }) => {
                const post = a.post ?? null;
                const who = post ? { username: post.username, full_name: post.full_name, avatar_url: post.avatar_url } : ads.data?.people[a.user_id];
                const media = post?.media?.[0];
                const end = a.ends_at ? new Date(a.ends_at) : null;
                const time = end ? (state.running ? 'Ends ' + when(end.toISOString()) : 'Ended ' + when(end.toISOString())) : 'Paid ' + when(a.created_at);
                return (
                  <tr key={a.id} data-ad={a.id} onClick={post ? () => nav('/p/' + post.id) : undefined} className={post ? '' : 'dim'}>
                    <td>
                      <span className="cell-person">
                        <Thumb src={media ? media.poster ?? (media.type === 'image' ? media.url : null) : null} icon="image" />
                        <span>
                          <b className="adm-ad-who">
                            <Avatar src={who?.avatar_url} name={who?.full_name || who?.username || '?'} size={18} />
                            {who ? '@' + who.username : 'A member'}
                          </b>
                          <span className="muted-text small clip">{post ? post.caption || 'No caption' : 'The post was deleted'}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      <span className={'adm-tone ' + state.tone}>{state.label}</span>
                    </td>
                    <td className="nowrap">
                      {count(a.days, 'day')} · {money(a.amount_pence, a.currency)}
                    </td>
                    <td className="nowrap">{time}</td>
                    <td className="adm-cell-action" onClick={(e) => e.stopPropagation()}>
                      {state.running ? (
                        <button className="btn danger-outline small" disabled={!!ending && ending !== a.id} onClick={() => endNow(a)}>
                          {ending === a.id ? 'Ending…' : 'End now'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )
      ) : funds.loading && !funds.data ? (
        <Spinner />
      ) : funds.error ? (
        <Failed error={funds.error} retry={funds.reload} />
      ) : !funds.data?.length ? (
        <Empty icon="heart" title="No fundraisers yet" body="When a member starts a fundraiser on their profile, it appears here." />
      ) : (
        <div className="adm-cards">
          {funds.data.map((f) => {
            const share = f.goal_pence > 0 ? Math.min(1, f.raised_pence / f.goal_pence) : 0;
            const open = f.status === 'active';
            return (
              <button key={f.id} className="dash-card adm-fund" onClick={() => nav('/fundraisers/' + f.id)} data-fundraiser={f.id}>
                <Thumb src={f.cover_url || f.avatar_url || null} icon="heart" />
                <span className="adm-fund-text">
                  <span className="adm-fund-title">
                    <b>{f.title}</b>
                    <span className={'adm-tone ' + (open ? 'ok' : 'muted')}>{open ? 'Open' : 'Closed'}</span>
                  </span>
                  <em>
                    @{f.username}
                    {f.accepting ? '' : ' · payouts not set up'}
                  </em>
                  <span>
                    {money(f.raised_pence, f.currency)} of {money(f.goal_pence, f.currency)} · {count(f.donor_count, 'supporter')}
                  </span>
                  <span className="adm-progress">
                    <i style={{ width: Math.round(share * 100) + '%' }} />
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
