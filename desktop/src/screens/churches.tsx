// Churches, from the iPhone app (app/(app)/churches.tsx, church/[id].tsx and church-new.tsx): the
// list on the left (yours first, then A to Z or nearest first), and on the right a church's page or
// the form to add one (/churches/new).
import React, { useMemo, useState } from 'react';
import { distanceKm, fetchChurches } from 'shared/api';
import type { Church } from 'shared/types';
import { dateLocale, t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Empty, Failed, Icon, Link, Spinner, useLoad } from '../ui/kit';
import { ChurchDetail } from './church-detail';
import { ChurchNew } from './church-new';
import { StatusPill, STATUS_LABEL, locateMe, townOf } from './church-parts';
import '../styles/community.css';

type Point = { lat: number; lng: number };
type Entry = { church: Church; km: number | null };

/** Why the list could not be sorted by distance: location refused, or no position came back. Keys: say them with t(). */
const NOTE = {
  settings: 'd.community.locationOffSort',
  nofix: 'd.community.noFixSort',
};

export function Churches({ id }: { id?: string; path?: string }) {
  const { me } = useMe();
  const admin = !!me.admin_role;
  // Admins also read every church waiting for review, so the list follows admin rights.
  const list = useLoad(() => fetchChurches(), [admin]);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<'name' | 'near'>('name');
  const [here, setHere] = useState<Point | null>(null);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<keyof typeof NOTE | null>(null);

  /** Sort by distance. The browser asks for location only now, the first time it is clicked. */
  async function nearMe() {
    setSort('near');
    if (here) return;
    setLocating(true);
    try {
      setHere(await locateMe());
      setNote(null);
    } catch (e) {
      setNote((e as GeolocationPositionError)?.code === 1 ? 'settings' : 'nofix');
      setSort('name');
    } finally {
      setLocating(false);
    }
  }

  const needle = q.trim().toLowerCase();
  const mineId = me.church_id ?? null;
  const near = sort === 'near' && !!here;
  const { mine, rest } = useMemo(() => {
    const entries: Entry[] = (list.data ?? [])
      // A church an admin turned down stays visible only to the member who suggested it (so they know
      // what happened) and to anyone who already has it as their church.
      .filter((c) => c.status !== 'rejected' || c.created_by === me.id || c.id === mineId)
      .filter((c) => !needle || [c.name, c.city, c.country].some((s) => (s ?? '').toLowerCase().includes(needle)))
      .map((c) => ({ church: c, km: here && c.lat !== null && c.lng !== null ? distanceKm(here, { lat: c.lat, lng: c.lng }) : null }));
    entries.sort((a, b) => {
      // Nearest first when asked and known; churches without a pin go last. Ties fall through to the name.
      const d = near ? (a.km ?? Infinity) - (b.km ?? Infinity) : 0;
      return (Number.isNaN(d) ? 0 : d) || a.church.name.localeCompare(b.church.name);
    });
    return { mine: entries.find((e) => e.church.id === mineId) ?? null, rest: entries.filter((e) => e.church.id !== mineId) };
  }, [list.data, needle, here, near, mineId, me.id]);

  const church = (list.data ?? []).find((c) => c.id === id) ?? null;
  let detail: React.ReactNode;
  if (id === 'new') detail = <ChurchNew onAdded={list.reload} />;
  else if (!id) detail = <Empty icon="church" title={t('d.community.chooseChurch')} body={t('d.community.chooseChurchBody')} />;
  else if (church) detail = <ChurchDetail key={church.id} c={church} onChanged={list.reload} />;
  else if (list.loading || !list.data) detail = list.error ? <Failed error={list.error} retry={list.reload} /> : <Spinner />;
  else detail = <Empty icon="church" title={t('d.community.churchGone')} body={t('d.community.churchGoneBody')} />;

  const row = ({ church: c, km }: Entry, isMine = false) => {
    const town = townOf(c);
    // "1.2 km", with the decimal point the language uses.
    const distance = km === null ? '' : km.toLocaleString(dateLocale(), { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false });
    const dist = km === null ? '' : t('d.community.km', { distance });
    const status = STATUS_LABEL[c.status];
    return (
      <Link
        key={c.id}
        to={'/churches/' + c.id}
        className={'hymn-row cm-church-row' + (c.id === id ? ' on' : '')}
        title={[c.name, status && t(status), town, dist && t('d.community.kmAway', { distance }), isMine && t('d.community.yourChurchLower')].filter(Boolean).join(', ')}
      >
        <span className={'hymn-no cm-church-icon' + (isMine ? ' mine' : '')}>
          <Icon name="church" size={22} />
        </span>
        <span className="row-text">
          <span className="cm-row-name">
            <b>{c.name}</b>
            <StatusPill status={c.status} />
          </span>
          <span className={isMine ? 'cm-mine-text' : ''}>{isMine ? (town ? t('d.community.yourChurchTown', { town }) : t('d.community.yourChurch')) : town || t('d.community.noAddress')}</span>
        </span>
        {dist ? <span className="cm-km">{dist}</span> : null}
      </Link>
    );
  };

  return (
    <div className="split-page cm-churches">
      <section className="split-list">
        <header>
          <div className="cm-list-head">
            <h1>{t('churchApps.churches')}</h1>
            <button className={'btn small' + (id === 'new' ? '' : ' quiet')} onClick={() => nav('/churches/new')}>
              <Icon name="plus" size={16} stroke={2.2} /> {t('d.community.addAChurch')}
            </button>
          </div>
          <div className="panel-search in-modal">
            <input placeholder={t('d.community.churchSearchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('d.community.searchChurches')} />
          </div>
          <div className="cm-sort" role="group" aria-label={t('d.community.sortChurches')}>
            <button aria-pressed={!near} className={!near ? 'on' : ''} onClick={() => setSort('name')}>
              {t('d.community.aToZ')}
            </button>
            <button aria-pressed={near} className={near ? 'on' : ''} onClick={nearMe} disabled={locating}>
              <Icon name="location" size={15} stroke={2} /> {locating ? t('d.community.findingYou') : t('d.community.nearMe')}
            </button>
          </div>
          {note ? (
            <div className="cm-note" role="status">
              <span>{t(NOTE[note])}</span>
              <button className="link-btn" onClick={nearMe}>
                {t('common.tryAgain')}
              </button>
            </div>
          ) : null}
        </header>
        <div className="split-scroll">
          {list.loading && !list.data ? <Spinner /> : list.error && !list.data ? <Failed error={list.error} retry={list.reload} /> : null}
          {mine ? (
            <>
              <h3 className="list-h">{t('d.community.myChurch')}</h3>
              {row(mine, true)}
            </>
          ) : null}
          {rest.length ? <h3 className="list-h">{near ? t('d.community.nearestFirst') : t('d.community.allChurches')}</h3> : null}
          {rest.map((e) => row(e))}
          {list.data && !mine && !rest.length ? (
            needle ? (
              <p className="muted-text cm-list-empty">{t('d.community.noChurchMatch')}</p>
            ) : (
              <div className="cm-list-empty">
                <p className="muted-text">{t('d.community.noChurches')}</p>
                <button className="btn small" onClick={() => nav('/churches/new')}>
                  {t('d.community.addAChurch')}
                </button>
              </div>
            )
          ) : null}
        </div>
      </section>
      <section className="split-detail">{detail}</section>
    </div>
  );
}
