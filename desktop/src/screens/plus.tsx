// Community Plus and the verified tick.
import React, { useState } from 'react';
import { myPlusRequests, requestPlus } from 'shared/api';
import { agoLong } from 'shared/theme';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Empty, Failed, Icon, Link, Modal, Spinner, Verified, toast, toastError, useLoad } from '../ui/kit';

export function Plus() {
  const { me } = useMe();
  const requests = useLoad(() => myPlusRequests(me.id), []);
  const [note, setNote] = useState('');
  const pending = (requests.data ?? []).find((r) => r.status === 'pending');
  const ask = async (kind: 'verify' | 'plus') => {
    try {
      await requestPlus(me.id, kind, note);
      toast(kind === 'verify' ? 'Request sent. An admin will review it.' : 'Request sent.');
      setNote('');
      requests.reload();
    } catch (e) {
      toastError(e);
    }
  };
  return (
    <div className="page narrow-page plus-page">
      <div className="plus-hero">
        <Verified size={40} />
        <h1>Community Plus</h1>
        <p>{me.plus ? `Active${me.plus_until ? ' until ' + new Date(me.plus_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : ''}.` : 'The verified tick and more, for £4.99 a month.'}</p>
      </div>
      <ul className="perk-list">
        <li><Icon name="verified" size={20} color="#3d8bff" /> The verified tick next to your name</li>
        <li><Icon name="boost" size={20} /> Boost a post to the top of For you and Explore</li>
        <li><Icon name="eye" size={20} /> See who viewed your profile</li>
        <li><Icon name="crown" size={20} /> Appear in the Subscribers feed</li>
        <li><Icon name="wallpaper" size={20} /> Chat wallpapers, app fonts and photo adjustments on iPhone</li>
        <li><Icon name="podcast" size={20} /> Share songs and podcasts on Pod</li>
      </ul>
      {me.plus ? (
        <p className="note">Manage your subscription in the Community app on iPhone (Settings → Community Plus).</p>
      ) : (
        <>
          <p className="note">Subscribing uses Apple Pay or a card in the Community app on iPhone. You can also ask an admin for the verified tick here.</p>
          {pending ? (
            <p className="note">
              Your {pending.kind === 'verify' ? 'verification' : 'Plus'} request ({agoLong(pending.created_at).toLowerCase()}) is waiting for an admin.
            </p>
          ) : (
            <div className="form-pad flat">
              <label className="form-row">
                <span>Why should your account have the tick? (optional)</span>
                <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="I lead the youth ministry at…" />
              </label>
              <button className="btn" onClick={() => ask('verify')}>
                Request the verified tick
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- help and support ---------- */
