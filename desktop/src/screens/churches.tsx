// Churches, from the iPhone app (app/(app)/churches.tsx and church/[id].tsx): the list, and a
// church's details and members.
import React, { useState } from 'react';
import { fetchChurchMembers, fetchChurches } from 'shared/api';
import type { Church } from 'shared/types';
import { nav } from '../lib/router';
import { Avatar, Empty, Failed, Icon, Link, Spinner, useLoad } from '../ui/kit';

export function Churches({ id }: { id?: string }) {
  const list = useLoad(() => fetchChurches(), []);
  const [q, setQ] = useState('');
  const church = (list.data ?? []).find((c) => c.id === id) ?? null;
  const shown = (list.data ?? []).filter((c) => !q || (c.name + ' ' + c.city + ' ' + c.country).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="split-page">
      <section className="split-list">
        <header>
          <h1>Churches</h1>
          <div className="panel-search in-modal">
            <input placeholder="Name or town" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search churches" />
          </div>
        </header>
        <div className="split-scroll">
          {list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : null}
          {list.data && !list.data.length ? <p className="muted-text pad">No churches have been added yet. Add yours from the iPhone app.</p> : null}
          {shown.map((c) => (
            <Link key={c.id} to={'/churches/' + c.id} className={'hymn-row' + (c.id === id ? ' on' : '')}>
              <span className="hymn-no">
                <Icon name="church" size={20} />
              </span>
              <span className="row-text">
                <b>{c.name}</b>
                <span>{[c.city, c.country].filter(Boolean).join(', ')}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="split-detail">{church ? <ChurchDetail c={church} /> : <Empty icon="church" title="Choose a church" body="Service times, address and members." />}</section>
    </div>
  );
}

function ChurchDetail({ c }: { c: Church }) {
  const members = useLoad(() => fetchChurchMembers(c.id), [c.id]);
  const map = c.lat != null && c.lng != null ? `https://maps.apple.com/?ll=${c.lat},${c.lng}&q=${encodeURIComponent(c.name)}` : `https://maps.apple.com/?q=${encodeURIComponent([c.name, c.address, c.city, c.country].filter(Boolean).join(', '))}`;
  return (
    <article className="church">
      <h1>{c.name}</h1>
      <p>{[c.address, c.city, c.country].filter(Boolean).join(', ')}</p>
      {c.service_times ? (
        <p>
          <b>Services:</b> {c.service_times}
        </p>
      ) : null}
      <div className="btn-row">
        <a className="btn quiet" href={map} target="_blank" rel="noreferrer">
          Directions
        </a>
        {c.website ? (
          <a className="btn quiet" href={/^https?:/.test(c.website) ? c.website : 'https://' + c.website} target="_blank" rel="noreferrer">
            Website
          </a>
        ) : null}
      </div>
      <h3>Members on Community</h3>
      {members.loading ? <Spinner /> : null}
      {members.data && !members.data.length ? <p className="muted-text">Nobody has set this as their church yet.</p> : null}
      {(members.data ?? []).map((p) => (
        <div className="row" key={p.id}>
          <Avatar src={p.avatar_url} name={p.username} size={40} onClick={() => nav('/u/' + p.username)} />
          <span className="row-text">
            <Link to={'/u/' + p.username} className="uname">
              {p.username}
            </Link>
            <span>{p.full_name}</span>
          </span>
        </div>
      ))}
    </article>
  );
}
