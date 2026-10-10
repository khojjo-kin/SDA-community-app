// New message (/direct/new): search for someone, or pick from recent chats and people you follow,
// then open the chat with them (made if it doesn't exist yet), as on the iPhone (app/(app)/new-message.tsx).
// Also Forward: photos from a chat sent on to up to ten people (the iPhone's app/(app)/send-to.tsx).
import React, { useEffect, useState } from 'react';
import { ERHA_ID, getProfile, openThread, peopleToMessage, searchProfiles, sendToPeople } from 'shared/api';
import type { Profile } from 'shared/types';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Icon, Modal, Spinner, Verified, toast, toastError } from '../ui/kit';
import '../styles/messages.css';

/** At most this many people at once, as on the iPhone. */
const FORWARD_MAX = 10;

/** Forward photos from a chat: choose people (recent chats first), add a few words, Send. */
export function ForwardPhotos({ media, onClose, onSent }: { media: string[]; onClose: () => void; onSent?: () => void }) {
  const { me } = useMe();
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const searching = !!q.trim();

  useEffect(() => {
    let alive = true;
    const t = setTimeout(
      () => {
        (searching ? searchProfiles(q) : peopleToMessage(me.id)).then(
          (list) => alive && setPeople(list.filter((p) => p.id !== me.id && p.id !== ERHA_ID && !p.is_blocked && !p.deleted_at)),
          () => alive && setPeople([]),
        );
      },
      searching ? 220 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= FORWARD_MAX ? cur : [...cur, id]));
  const send = async () => {
    if (!picked.length || busy) return;
    setBusy(true);
    try {
      await sendToPeople(me.id, picked, { media, text: note });
      toast(picked.length > 1 ? `Sent to ${picked.length} people` : 'Sent');
      onSent?.();
      onClose();
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };

  return (
    <Modal title="Forward" onClose={onClose} className="share mx-new mx-fwd">
      <div className="mx-fwd-photos" aria-label="Photos to forward">
        {media.map((u, i) => (
          <img key={i + u} src={u} alt={`Photo ${i + 1} of ${media.length}`} />
        ))}
      </div>
      <div className="share-search">
        <span>To:</span>
        <input autoFocus placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
      </div>
      <div className="share-list">
        {!searching ? <h4 className="mx-new-h">Suggested</h4> : null}
        {people === null ? <Spinner /> : null}
        {people && !people.length ? <p className="muted-text pad">{searching ? 'No one found. Try another name.' : 'Follow people or search for someone by name.'}</p> : null}
        {(people ?? []).map((p) => (
          <label key={p.id} className="row mx-pick">
            <Avatar src={p.avatar_url} name={p.username} size={44} />
            <span className="row-text">
              <b>
                {p.full_name || p.username}
                {p.verified ? <Verified size={12} /> : null}
              </b>
              <span>{p.username}</span>
            </span>
            <input type="checkbox" className="round-check" checked={picked.includes(p.id)} onChange={() => toggle(p.id)} aria-label={'Choose ' + (p.full_name || p.username)} />
          </label>
        ))}
      </div>
      <div className="modal-foot mx-fwd-foot">
        {picked.length ? <input className="mx-fwd-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Write a message…" maxLength={300} aria-label="Message" /> : null}
        <button className="btn block big" disabled={!picked.length || busy} onClick={send}>
          {picked.length > 1 ? 'Send separately' : 'Send'}
        </button>
      </div>
    </Modal>
  );
}

export function NewMessage({ onClose }: { onClose: () => void }) {
  const { me } = useMe();
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Profile[] | null>(null);
  const [picked, setPicked] = useState<Profile | null>(null);
  const [busy, setBusy] = useState(false);
  const searching = !!q.trim();

  useEffect(() => {
    let alive = true;
    const t = setTimeout(
      async () => {
        try {
          const list = searching ? await searchProfiles(q) : await peopleToMessage(me.id);
          // Erha is always there to ask, at the end of the suggestions.
          if (!searching && !list.some((p) => p.id === ERHA_ID)) {
            const erha = await getProfile(ERHA_ID).catch(() => null);
            if (erha) list.push(erha);
          }
          if (alive) setPeople(list.filter((p) => p.id !== me.id && !p.is_blocked && !p.deleted_at));
        } catch (e) {
          if (alive) {
            setPeople([]);
            toastError(e);
          }
        }
      },
      searching ? 200 : 0,
    );
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q]);

  const start = async (p: Profile | null = picked) => {
    if (!p || busy) return;
    setBusy(true);
    try {
      const id = await openThread(p.id);
      nav('/direct/t/' + id, true);
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  };

  return (
    <Modal title="New message" onClose={onClose} className="share mx-new">
      <div className="share-search">
        <span>To:</span>
        {picked ? (
          <span className="chip">
            {picked.username}
            <button aria-label={'Remove ' + picked.username} onClick={() => setPicked(null)}>
              <Icon name="close" size={10} stroke={3} />
            </button>
          </span>
        ) : null}
        <input
          autoFocus
          placeholder="Search…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && picked) start();
          }}
          aria-label="Search people"
        />
      </div>
      <div className="share-list">
        {!searching ? <h4 className="mx-new-h">Suggested</h4> : null}
        {people === null ? <Spinner /> : null}
        {people && !people.length ? <p className="muted-text pad">No account found.</p> : null}
        {(people ?? []).map((p) => (
          <label key={p.id} className="row mx-pick">
            <Avatar src={p.avatar_url} name={p.username} size={44} />
            <span className="row-text">
              <b>
                {p.full_name || p.username}
                {p.verified ? <Verified size={12} /> : null}
              </b>
              <span>{p.id === ERHA_ID ? 'Your church assistant' : p.username}</span>
            </span>
            <input type="radio" name="to" className="round-check" checked={picked?.id === p.id} onChange={() => setPicked(p)} onDoubleClick={() => start(p)} aria-label={'Choose ' + (p.full_name || p.username)} />
          </label>
        ))}
      </div>
      <div className="modal-foot">
        <button className="btn block big" disabled={!picked || busy} onClick={() => start()}>
          Chat
        </button>
      </div>
    </Modal>
  );
}
