// Settings pages about who sees you and who can reach you: Account privacy, Close friends, Blocked,
// Story, live and location (with story alerts and the friends' map), Activity status, Messages and
// story replies, and Notifications.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { amSharingLocation, countCloseFriends, fetchFollowAlerts, fetchStoryWatchList, fetchThreads, listBlocked, listCloseFriends, listPeople, searchProfiles, setBlock, setCloseFriend, setFollowAlerts, setStoryWatch, setThreadMuted, stopSharingLocation, updateProfile } from 'shared/api';
import type { FollowAlerts, Profile, StoryReplies } from 'shared/types';
import { useMe } from '../lib/me';
import { Failed, Link, Modal, Spinner, toast, toastError, useLoad } from '../ui/kit';
import { Block, Card, LinkRow, Notice, Page, PersonRow, PlusUpsell, RadioRow, ToggleRow, useProfileFlag } from './settings-ui';

/* ---------- Account privacy ---------- */

export function AccountPrivacy() {
  const { me } = useMe();
  const [priv, setPriv] = useProfileFlag('is_private');
  const restricted = me.restricted === true;
  return (
    <Page title="Account privacy">
      <Card>
        <ToggleRow title="Private account" sub={restricted ? 'Accounts of members under 14 stay private.' : undefined} on={restricted || priv} disabled={restricted} onChange={setPriv} />
      </Card>
      <div className="st-text-block">
        <p>When your account is public, your profile and posts can be seen by anyone on Community.</p>
        <p>When your account is private, only the followers you approve can see what you share, including your photos, videos, Shorts and stories, and your followers and following lists. Anyone who taps Follow sends you a request, which you accept or decline in Notifications. Your profile picture and username can always be seen.</p>
      </div>
      {restricted ? (
        <Notice icon="shield">
          Your account is set up for members under 14, so it stays private until your 14th birthday. <Link to="/accounts/family" className="link-btn inline">What this means</Link>
        </Notice>
      ) : null}
    </Page>
  );
}

/* ---------- Close friends ---------- */

export function CloseFriends() {
  const { me } = useMe();
  const friends = useLoad(() => listCloseFriends(me.id), []);
  const [q, setQ] = useState('');
  const [found, setFound] = useState<Profile[] | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      if (q.trim()) searchProfiles(q).then((r) => setFound(r.filter((p) => p.id !== me.id)), () => setFound([]));
      else listPeople(me.id, 'following').then(setFound, () => setFound([]));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);
  const ids = new Set((friends.data ?? []).map((p) => p.id));
  // Shown changed at once; the list is read again if the save fails.
  const flip = (p: Profile) => {
    const add = !ids.has(p.id);
    const list = friends.data ?? [];
    friends.set(add ? [p, ...list] : list.filter((x) => x.id !== p.id));
    setCloseFriend(me.id, p.id, add).then(
      () => toast(add ? `Added ${p.username} to close friends` : `Removed ${p.username} from close friends`),
      (e) => {
        toastError(e);
        friends.reload();
      },
    );
  };
  const check = (p: Profile) => <input type="checkbox" className="round-check close" checked={ids.has(p.id)} onChange={() => flip(p)} aria-label={(ids.has(p.id) ? 'Remove ' : 'Add ') + p.username} />;
  const others = (found ?? []).filter((p) => q || !ids.has(p.id));
  return (
    <Page title="Close friends" intro="Share a story with only these people. Nobody is told when you add or remove them.">
      <input className="st-input st-search-input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
      {!q ? (
        <Block title={`On your list · ${friends.data?.length ?? 0}`}>
          {friends.loading ? <Spinner /> : friends.error ? <Failed error={friends.error} retry={friends.reload} /> : !friends.data?.length ? <p className="st-empty-line">Nobody yet. Add people from the list below.</p> : (
            <Card className="st-friends">
              {friends.data.map((p) => (
                <PersonRow key={p.id} p={p} right={check(p)} />
              ))}
            </Card>
          )}
        </Block>
      ) : null}
      <Block title={q ? 'Results' : 'People you follow'}>
        {found === null ? <Spinner /> : !others.length ? <p className="st-empty-line">{q ? 'No one found.' : 'Everyone you follow is on your list.'}</p> : (
          <Card className="st-candidates">
            {others.map((p) => (
              <PersonRow key={p.id} p={p} right={check(p)} />
            ))}
          </Card>
        )}
      </Block>
    </Page>
  );
}

/* ---------- Blocked ---------- */

export function Blocked() {
  const { me } = useMe();
  const list = useLoad(() => listBlocked(me.id), []);
  return (
    <Page title="Blocked accounts" intro="They can't find your profile, posts or stories on Community, or message you, and you won't see theirs. They aren't told that you blocked them.">
      {list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : !list.data?.length ? <p className="st-empty-line">You haven't blocked anyone. To block someone, open the three dots on their profile.</p> : (
        <Card className="st-blocked">
          {list.data.map((p) => (
            <PersonRow
              key={p.id}
              p={p}
              onOpen={false}
              right={
                <button className="btn quiet small" onClick={() => setBlock(me.id, p.id, false).then(() => { list.reload(); toast('Unblocked ' + p.username); }, toastError)}>
                  Unblock
                </button>
              }
            />
          ))}
        </Card>
      )}
    </Page>
  );
}

/* ---------- Story, live and location ---------- */

const REPLIES: Record<StoryReplies, string> = { everyone: 'Everyone', following: 'People you follow', off: 'Off' };

export function StoryLiveLocation() {
  const { me } = useMe();
  const friends = useLoad(() => countCloseFriends(me.id), []);
  const sharing = useLoad(() => amSharingLocation(me.id), []);
  // How many people are on the story alerts list (a Plus perk).
  const alerts = useLoad(() => (me.plus ? fetchStoryWatchList(me.id).then((l) => l.length) : Promise.resolve(null)), [me.plus]);
  const restricted = me.restricted === true;
  return (
    <Page title="Story, live and location">
      <Block title="Story">
        <Card>
          <LinkRow icon="star" title="Close friends" value={friends.data ?? ''} to="/accounts/close-friends" />
          <LinkRow icon="reply" title="Story replies" value={REPLIES[me.story_replies] ?? 'Everyone'} to="/accounts/messages" />
          <LinkRow icon="bell" title="Story alerts" sub="Be told when people you choose watch your stories." value={me.plus ? alerts.data ?? '' : 'Plus'} to="/accounts/story-alerts" />
          <LinkRow icon="archive" title="Stories archive" sub="Your stories are kept here after they disappear, and only you can see them." to="/archive" />
        </Card>
      </Block>
      <Block title="Live">
        {restricted ? (
          <Notice icon="lock">Live broadcasts aren't available to members under 14.</Notice>
        ) : (
          <Card>
            <LinkRow icon="live" title="Go live" sub="Your followers are told, and the broadcast shows at the top of Home while it runs. Choose who can watch before you start." to="/live/new" />
          </Card>
        )}
      </Block>
      <Block title="Location">
        {restricted ? (
          <Notice icon="lock">Members under 14 can't share their location.</Notice>
        ) : sharing.loading ? (
          <Spinner />
        ) : (
          <Card>
            {sharing.data ? (
              <ToggleRow
                icon="location"
                title="Share my live location"
                sub="Friends you chose can see where you are on the map. Turn this off to stop at once."
                on
                onChange={() =>
                  stopSharingLocation(me.id).then(() => {
                    sharing.set(false);
                    toast('You stopped sharing your location');
                  }, toastError)
                }
              />
            ) : null}
            {/* The friends' map is where sharing starts: who sees it (mutual followers or close friends) and for how long. */}
            <LinkRow
              icon="compass"
              title={sharing.data ? "Friends' map" : 'Share my live location'}
              sub={sharing.data ? 'See friends who share their location with you, and change who sees yours.' : "Open the friends' map to share where you are with mutual followers or close friends, for as long as you choose."}
              to="/map"
            />
          </Card>
        )}
      </Block>
    </Page>
  );
}

/* ---------- Story alerts (Community Plus) ---------- */

/**
 * The people whose views of your stories you are told about, as on the iPhone's story-alerts.tsx. They
 * aren't told. The list is the same one the bell beside each viewer in a story's viewers changes.
 */
export function StoryAlerts() {
  const { me } = useMe();
  const plus = !!me.plus;
  const [list, setList] = useState<Profile[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [picking, setPicking] = useState(false);
  // People being added or removed right now: another click on them waits for the first to finish.
  const saving = useRef(new Set<string>());

  const load = () => {
    setError(null);
    fetchStoryWatchList(me.id).then(setList, (e) => {
      setError(e);
      setList((old) => old ?? []);
    });
  };
  useEffect(() => {
    if (plus) load();
  }, [plus]);

  /** Adds or removes one person. Shown at once, and put back if the save fails. */
  async function setOn(p: Profile, on: boolean) {
    if (saving.current.has(p.id)) return;
    saving.current.add(p.id);
    // Only this person changes, so a failure doesn't undo other clicks still saving.
    const put = (add: boolean) => setList((cur) => (add ? [p, ...(cur ?? []).filter((x) => x.id !== p.id)] : (cur ?? []).filter((x) => x.id !== p.id)));
    put(on);
    try {
      await setStoryWatch(me.id, p.id, on);
    } catch (e) {
      put(!on);
      toastError(e);
    } finally {
      saving.current.delete(p.id);
    }
  }

  if (!plus) {
    return (
      <Page title="Story alerts">
        <PlusUpsell title="Story alerts are part of Community Plus" body="Choose people, and be told when they watch your stories. They aren't told." />
      </Page>
    );
  }
  const add = (
    <button className="btn small" onClick={() => setPicking(true)}>
      Add people
    </button>
  );
  return (
    <Page title="Story alerts" intro="You're told when the people on this list watch your stories. They aren't told. You can also add someone from the bell beside them in a story's viewers.">
      <Block title={`On your list · ${list?.length ?? 0}`} action={list?.length ? add : undefined}>
        {list === null ? (
          <Spinner />
        ) : error && !list.length ? (
          <Failed error={error} retry={load} />
        ) : !list.length ? (
          <div className="st-alerts-empty">
            <p className="st-empty-line">No one yet. Add people you follow to hear when they watch your stories.</p>
            {add}
          </div>
        ) : (
          <Card className="st-watch">
            {list.map((p) => (
              <PersonRow
                key={p.id}
                p={p}
                right={
                  <button className="btn quiet small" onClick={() => setOn(p, false)} aria-label={'Remove ' + p.username}>
                    Remove
                  </button>
                }
              />
            ))}
          </Card>
        )}
      </Block>
      {picking ? <AddWatchers chosen={list ?? []} onToggle={setOn} onClose={() => setPicking(false)} /> : null}
    </Page>
  );
}

/** The people you follow, ticked when they're on the story alerts list. Each click saves straight away. */
function AddWatchers({ chosen, onToggle, onClose }: { chosen: Profile[]; onToggle: (p: Profile, on: boolean) => void; onClose: () => void }) {
  const { me } = useMe();
  const following = useLoad(() => listPeople(me.id, 'following').then((all) => all.filter((p) => p.id !== me.id && !p.is_blocked)), []);
  const [q, setQ] = useState('');
  const on = new Set(chosen.map((p) => p.id));
  const n = q.trim().toLowerCase();
  const shown = (following.data ?? []).filter((p) => !n || `${p.username} ${p.full_name}`.toLowerCase().includes(n));
  return (
    <Modal title="Add people" onClose={onClose}>
      <div className="st-modal-body st-watch-pick">
        {following.loading ? (
          <Spinner />
        ) : following.error ? (
          <Failed error={following.error} retry={following.reload} />
        ) : !following.data?.length ? (
          <p className="st-empty-line">You aren't following anyone yet. Story alerts are for people you follow.</p>
        ) : (
          <>
            <input className="st-input st-search-input" placeholder="Search people you follow" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people you follow" autoFocus />
            {shown.length ? (
              <Card className="st-candidates">
                {shown.map((p) => (
                  <PersonRow key={p.id} p={p} onOpen={false} right={<input type="checkbox" className="round-check" checked={on.has(p.id)} onChange={() => onToggle(p, !on.has(p.id))} aria-label={(on.has(p.id) ? 'Remove ' : 'Add ') + p.username} />} />
                ))}
              </Card>
            ) : (
              <p className="st-empty-line">No one by that name.</p>
            )}
          </>
        )}
        <button className="btn block big" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}

/* ---------- Activity status ---------- */

export function ActivityStatus() {
  const [on, set] = useProfileFlag('show_activity');
  return (
    <Page title="Activity status">
      <Card>
        <ToggleRow title="Show activity status" on={on} onChange={set} sub="Let people you follow and message see when you're active, or when you were last active. If you turn this off, you won't see theirs either." />
      </Card>
    </Page>
  );
}

/* ---------- Messages and story replies ---------- */

export function MessagesReplies() {
  const { me, refresh } = useMe();
  const [replies, setReplies] = useState<StoryReplies>(me.story_replies ?? 'everyone');
  const [receipts, setReceipts] = useProfileFlag('read_receipts');
  useEffect(() => setReplies(me.story_replies ?? 'everyone'), [me.story_replies]);
  const choose = (next: StoryReplies) => {
    const before = replies;
    setReplies(next);
    updateProfile(me.id, { story_replies: next }).then(
      () => refresh().catch(() => {}),
      (e) => {
        setReplies(before);
        toastError(e);
      },
    );
  };
  return (
    <Page title="Messages and story replies">
      <Block title="Who can reply to your stories">
        <Card>
          {(Object.keys(REPLIES) as StoryReplies[]).map((r) => (
            <RadioRow key={r} name="story-replies" title={REPLIES[r]} checked={replies === r} onChange={() => choose(r)} />
          ))}
        </Card>
      </Block>
      <Block title="Seen" note={me.plus ? undefined : 'Turning read receipts off is part of Community Plus.'}>
        <Card>
          <ToggleRow title="Read receipts" sub="Let people see when you've read their messages." on={receipts} onChange={setReceipts} disabled={!me.plus} />
        </Card>
        {!me.plus ? (
          <Link to="/plus" className="link-btn st-gap-top">
            About Community Plus
          </Link>
        ) : null}
      </Block>
      <Block title="Who can message you">
        <p className="st-text">
          {me.restricted
            ? 'Because your account is set up for members under 14, only people you follow can message or call you, and you can only message people you follow.'
            : 'People on Community can message and call you. To stop someone, block them from their profile or from your chat with them.'}
        </p>
        <Card>
          <LinkRow icon="block" title="Blocked accounts" to="/accounts/blocked" />
        </Card>
      </Block>
    </Page>
  );
}

/* ---------- Notifications ---------- */

const ALERTS: [keyof FollowAlerts, string][] = [
  ['posts', 'Posts'],
  ['stories', 'Stories'],
  ['clips', 'Shorts'],
  ['live', 'Live videos'],
];

/** Which alerts you get from one person you follow (the same choices as the bell on their profile). */
function AlertsDialog({ p, onClose }: { p: Profile; onClose: (changed: boolean) => void }) {
  const { me } = useMe();
  const [alerts, setAlerts] = useState<FollowAlerts | null>(null);
  // A ref, because the dialog's Escape key keeps the close function it was first given.
  const changed = useRef(false);
  useEffect(() => {
    fetchFollowAlerts(me.id, p.id).then(setAlerts, (e) => {
      toastError(e);
      onClose(false);
    });
  }, [p.id]);
  const flip = (k: keyof FollowAlerts, v: boolean) => {
    if (!alerts) return;
    const before = alerts;
    const next = { ...alerts, [k]: v };
    setAlerts(next);
    changed.current = true;
    setFollowAlerts(me.id, p.id, next).catch((e) => {
      setAlerts(before);
      toastError(e);
    });
  };
  return (
    <Modal title={'Alerts from ' + p.username} onClose={() => onClose(changed.current)}>
      <div className="st-modal-body">
        <p className="st-text">Get a notification when {p.username} shares something new. They aren't told.</p>
        {alerts ? (
          <Card>
            {ALERTS.map(([k, label]) => (
              <ToggleRow key={k} title={label} on={alerts[k]} onChange={(v) => flip(k, v)} />
            ))}
          </Card>
        ) : (
          <Spinner />
        )}
      </div>
    </Modal>
  );
}

export function Notifications() {
  const { me } = useMe();
  const following = useLoad(() => listPeople(me.id, 'following'), []);
  const threads = useLoad(() => fetchThreads(), []);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Profile | null>(null);
  const shown = useMemo(() => {
    const n = q.trim().toLowerCase();
    const list = (following.data ?? []).filter((p) => !n || (p.username + ' ' + p.full_name).toLowerCase().includes(n));
    // People you already get alerts from first.
    return list.sort((a, b) => Number(b.alerts_on) - Number(a.alerts_on));
  }, [following.data, q]);
  const muted = (threads.data ?? []).filter((t) => t.muted);
  return (
    <Page title="Notifications" intro="Likes, comments, follows and requests always show in Notifications. Choose whose posts, stories, Shorts and live videos you also hear about.">
      <Block title="Alerts from people you follow">
        {following.loading ? <Spinner /> : following.error ? <Failed error={following.error} retry={following.reload} /> : !following.data?.length ? <p className="st-empty-line">You don't follow anyone yet.</p> : (
          <>
            {following.data.length > 6 ? <input className="st-input st-search-input" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people you follow" /> : null}
            <Card className="st-alerts">
              {shown.map((p) => (
                <PersonRow
                  key={p.id}
                  p={p}
                  sub={p.alerts_on ? 'Alerts on' : 'Alerts off'}
                  right={
                    <button className="btn quiet small" onClick={() => setEditing(p)} aria-label={'Alerts from ' + p.username}>
                      {p.alerts_on ? 'Change' : 'Turn on'}
                    </button>
                  }
                />
              ))}
            </Card>
          </>
        )}
      </Block>
      <Block title="Muted chats" note="You don't get notifications for muted chats, and they don't show an unread dot.">
        {threads.loading ? <Spinner /> : !muted.length ? <p className="st-empty-line">No muted chats. Mute a chat from its details in Messages.</p> : (
          <Card>
            {muted.map((t) => (
              <PersonRow
                key={t.id}
                p={{ username: t.username, full_name: t.full_name, avatar_url: t.avatar_url, verified: t.verified }}
                right={
                  <button className="btn quiet small" onClick={() => setThreadMuted(me.id, t.id, false).then(threads.reload, toastError)}>
                    Unmute
                  </button>
                }
              />
            ))}
          </Card>
        )}
      </Block>
      {editing ? (
        <AlertsDialog
          p={editing}
          onClose={(changed) => {
            setEditing(null);
            if (changed) following.reload();
          }}
        />
      ) : null}
    </Page>
  );
}
