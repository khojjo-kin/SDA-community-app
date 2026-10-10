// "Discover people" under a profile's header, as on Instagram: cards with the picture, the name, why
// they're suggested, Follow, and an X that stops suggesting them. On your own profile it shows by
// default; on someone else's it opens after you follow them (or from the person button). The same
// suggestions as the iPhone's carousel (src/components/DiscoverCarousel.tsx).
import React, { useEffect, useRef, useState } from 'react';
import { dismissSuggestion, fetchSuggestedPeople, removeFollowRequest, requestFollow, setFollow } from 'shared/api';
import { fmt } from 'shared/theme';
import type { SuggestedPerson } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Icon, Link, Spinner, Verified, toast, toastError } from './kit';
import '../styles/profile.css';

type FollowState = 'none' | 'following' | 'requested';

/** The short grey line on a card. */
export function suggestionReason(p: SuggestedPerson): string {
  if (p.mutual_count > 0) return `${fmt(p.mutual_count)} ${p.mutual_count === 1 ? 'mutual' : 'mutuals'}`;
  if (p.follows_me) return 'Follows you';
  return 'Suggested for you';
}

/**
 * Follows someone suggested. Suggestions don't say whether an account is private, and the database
 * refuses a plain follow of a private account, so a refusal is answered with a request.
 */
async function followSuggested(me: string, id: string): Promise<'following' | 'requested'> {
  try {
    await setFollow(me, id, true);
    return 'following';
  } catch (e) {
    try {
      await requestFollow(me, id);
    } catch {
      throw e;
    }
    return 'requested';
  }
}

function Card({ p, onDismiss }: { p: SuggestedPerson; onDismiss: () => void }) {
  const { me } = useMe();
  const [state, setState] = useState<FollowState>('none');
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    const was = state;
    try {
      if (was === 'none') {
        setState('following');
        const now = await followSuggested(me.id, p.id);
        setState(now);
        if (now === 'requested') toast(`Requested to follow ${p.username}`);
      } else {
        setState('none');
        if (was === 'following') await setFollow(me.id, p.id, false);
        else await removeFollowRequest(me.id, p.id);
      }
    } catch (e) {
      setState(was);
      toastError(e);
    } finally {
      setBusy(false);
    }
  };
  const label = state === 'following' ? 'Following' : state === 'requested' ? 'Requested' : p.follows_me ? 'Follow back' : 'Follow';
  return (
    <div className="prof-dcard">
      <button className="prof-dcard-x" aria-label={'Stop suggesting ' + p.username} onClick={onDismiss}>
        <Icon name="close" size={14} stroke={2.2} />
      </button>
      <Avatar src={p.avatar_url} name={p.username} size={76} onClick={() => nav('/u/' + p.username)} label={p.username} />
      <Link to={'/u/' + p.username} className="prof-dcard-name">
        <b>{p.full_name || p.username}</b>
        {p.verified ? <Verified size={12} /> : null}
      </Link>
      <span className="prof-dcard-why">{suggestionReason(p)}</span>
      <button className={'prof-btn small block' + (state === 'none' ? ' primary' : '')} onClick={toggle} disabled={busy}>
        {label}
      </button>
    </div>
  );
}

/** The carousel. `excludeId` leaves out the person whose profile it is under. */
export function DiscoverPeople({ excludeId, onHide }: { excludeId?: string; onHide?: () => void }) {
  const { me } = useMe();
  const [list, setList] = useState<SuggestedPerson[] | null>(null);
  const [error, setError] = useState(false);
  const strip = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  const load = () => {
    setError(false);
    fetchSuggestedPeople(20).then(
      (rows) => setList(rows.filter((p) => p.id !== excludeId && p.id !== me.id)),
      () => setError(true),
    );
  };
  useEffect(load, [excludeId]);

  const measure = () => {
    const el = strip.current;
    if (el) setEdges({ left: el.scrollLeft > 4, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
  };
  useEffect(measure, [list?.length]);

  const dismiss = (p: SuggestedPerson) => {
    setList((cur) => (cur ? cur.filter((x) => x.id !== p.id) : cur));
    dismissSuggestion(me.id, p.id).catch(toastError);
  };

  let body: React.ReactNode;
  if (list === null) {
    body = error ? (
      <p className="prof-discover-note">
        Suggestions didn't load.{' '}
        <button className="link-btn" onClick={load}>
          Try again
        </button>
      </p>
    ) : (
      <div className="prof-discover-wait">
        <Spinner size={24} />
      </div>
    );
  } else if (!list.length) {
    body = <p className="prof-discover-note">No one to suggest just now.</p>;
  } else {
    body = (
      <div className="prof-discover-wrap">
        <div className="prof-discover-strip" ref={strip} onScroll={measure}>
          {list.map((p) => (
            <Card key={p.id} p={p} onDismiss={() => dismiss(p)} />
          ))}
        </div>
        {edges.left ? (
          <button className="prof-arrow left" aria-label="Scroll left" onClick={() => strip.current?.scrollBy({ left: -380, behavior: 'smooth' })}>
            <Icon name="back" size={14} stroke={2.6} />
          </button>
        ) : null}
        {edges.right ? (
          <button className="prof-arrow right" aria-label="Scroll right" onClick={() => strip.current?.scrollBy({ left: 380, behavior: 'smooth' })}>
            <Icon name="right" size={14} stroke={2.6} />
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <section className="prof-discover" aria-label="Discover people">
      <div className="prof-discover-head">
        <h2>Discover people</h2>
        <span className="grow" />
        <Link to="/explore/people" className="prof-see-all">
          See all
        </Link>
        {onHide ? (
          <button className="icon-btn tiny" aria-label="Close Discover people" onClick={onHide}>
            <Icon name="close" size={16} />
          </button>
        ) : null}
      </div>
      {body}
    </section>
  );
}
