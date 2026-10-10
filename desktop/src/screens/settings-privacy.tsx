// Settings pages about who sees you and who can reach you: Account privacy, Close friends, Blocked,
// Story, live and location (with story alerts and the friends' map), Activity status, Messages and
// story replies, and Notifications.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { amSharingLocation, countCloseFriends, fetchFollowAlerts, fetchStoryWatchList, fetchThreads, listBlocked, listCloseFriends, listPeople, searchProfiles, setBlock, setCloseFriend, setFollowAlerts, setStoryWatch, setThreadMuted, stopSharingLocation, updateProfile } from 'shared/api';
import type { FollowAlerts, Profile, StoryReplies } from 'shared/types';
import { t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { Failed, Link, Modal, Spinner, toast, toastError, useLoad } from '../ui/kit';
import { Block, Card, LinkRow, Notice, Page, PersonRow, PlusUpsell, RadioRow, ToggleRow, useProfileFlag } from './settings-ui';

/* ---------- Account privacy ---------- */

export function AccountPrivacy() {
  const { me } = useMe();
  const [priv, setPriv] = useProfileFlag('is_private');
  const restricted = me.restricted === true;
  return (
    <Page title={t('d.settings.accountPrivacy')}>
      <Card>
        <ToggleRow title={t('d.settings.privateAccount')} sub={restricted ? t('d.settings.under14Private') : undefined} on={restricted || priv} disabled={restricted} onChange={setPriv} />
      </Card>
      <div className="st-text-block">
        <p>{t('d.settings.publicText')}</p>
        <p>{t('d.settings.privateText')}</p>
      </div>
      {restricted ? (
        <Notice icon="shield">
          {t('d.settings.under14PrivateNotice')}{' '}
          <Link to="/accounts/family" className="link-btn inline">
            {t('d.settings.whatThisMeans')}
          </Link>
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
    const timer = setTimeout(() => {
      if (q.trim()) searchProfiles(q).then((r) => setFound(r.filter((p) => p.id !== me.id)), () => setFound([]));
      else listPeople(me.id, 'following').then(setFound, () => setFound([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [q]);
  const ids = new Set((friends.data ?? []).map((p) => p.id));
  // Shown changed at once; the list is read again if the save fails.
  const flip = (p: Profile) => {
    const add = !ids.has(p.id);
    const list = friends.data ?? [];
    friends.set(add ? [p, ...list] : list.filter((x) => x.id !== p.id));
    setCloseFriend(me.id, p.id, add).then(
      () => toast(add ? t('d.settings.addedClose', { username: p.username }) : t('profile.removedCloseFriend', { username: p.username })),
      (e) => {
        toastError(e);
        friends.reload();
      },
    );
  };
  const check = (p: Profile) => <input type="checkbox" className="round-check close" checked={ids.has(p.id)} onChange={() => flip(p)} aria-label={ids.has(p.id) ? t('createFlow.untag', { username: p.username }) : t('d.settings.addPerson', { username: p.username })} />;
  const others = (found ?? []).filter((p) => q || !ids.has(p.id));
  return (
    <Page title={t('settings.closeFriends')} intro={t('d.settings.closeFriendsIntro')}>
      <input className="st-input st-search-input" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('createFlow.searchPeople')} />
      {!q ? (
        <Block title={t('d.settings.onYourList', { count: friends.data?.length ?? 0 })}>
          {friends.loading ? <Spinner /> : friends.error ? <Failed error={friends.error} retry={friends.reload} /> : !friends.data?.length ? <p className="st-empty-line">{t('d.settings.closeFriendsEmpty')}</p> : (
            <Card className="st-friends">
              {friends.data.map((p) => (
                <PersonRow key={p.id} p={p} right={check(p)} />
              ))}
            </Card>
          )}
        </Block>
      ) : null}
      <Block title={q ? t('d.settings.results') : t('settings.repliesFollowing')}>
        {found === null ? <Spinner /> : !others.length ? <p className="st-empty-line">{q ? t('d.settings.noOneFound') : t('d.settings.allOnList')}</p> : (
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
    <Page title={t('d.settings.blockedAccounts')} intro={t('d.settings.blockedIntro')}>
      {list.loading ? <Spinner /> : list.error ? <Failed error={list.error} retry={list.reload} /> : !list.data?.length ? <p className="st-empty-line">{t('d.settings.blockedEmpty')}</p> : (
        <Card className="st-blocked">
          {list.data.map((p) => (
            <PersonRow
              key={p.id}
              p={p}
              onOpen={false}
              right={
                <button className="btn quiet small" onClick={() => setBlock(me.id, p.id, false).then(() => { list.reload(); toast(t('profile.unblocked', { username: p.username })); }, toastError)}>
                  {t('profile.unblock')}
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

/** Who can reply to your stories: each choice's key. */
const REPLIES: Record<StoryReplies, string> = { everyone: 'settings.repliesEveryone', following: 'settings.repliesFollowing', off: 'settings.repliesOff' };

export function StoryLiveLocation() {
  const { me } = useMe();
  const friends = useLoad(() => countCloseFriends(me.id), []);
  const sharing = useLoad(() => amSharingLocation(me.id), []);
  // How many people are on the story alerts list (a Plus perk).
  const alerts = useLoad(() => (me.plus ? fetchStoryWatchList(me.id).then((l) => l.length) : Promise.resolve(null)), [me.plus]);
  const restricted = me.restricted === true;
  return (
    <Page title={t('d.settings.storyLiveLocation')}>
      <Block title={t('notifications.storyBadge')}>
        <Card>
          <LinkRow icon="star" title={t('settings.closeFriends')} value={friends.data ?? ''} to="/accounts/close-friends" />
          <LinkRow icon="reply" title={t('settings.storyReplies')} value={t(REPLIES[me.story_replies] ?? 'settings.repliesEveryone')} to="/accounts/messages" />
          <LinkRow icon="bell" title={t('settings.storyAlerts')} sub={t('d.settings.storyAlertsSub')} value={me.plus ? alerts.data ?? '' : t('common.plus')} to="/accounts/story-alerts" />
          <LinkRow icon="archive" title={t('d.settings.storiesArchive')} sub={t('d.settings.storiesArchiveSub')} to="/archive" />
        </Card>
      </Block>
      <Block title={t('liveSchedule.live')}>
        {restricted ? (
          <Notice icon="lock">{t('d.settings.liveUnder14')}</Notice>
        ) : (
          <Card>
            <LinkRow icon="live" title={t('goLive.goLive')} sub={t('d.settings.goLiveSub')} to="/live/new" />
          </Card>
        )}
      </Block>
      <Block title={t('create.location')}>
        {restricted ? (
          <Notice icon="lock">{t('d.settings.locationUnder14')}</Notice>
        ) : sharing.loading ? (
          <Spinner />
        ) : (
          <Card>
            {sharing.data ? (
              <ToggleRow
                icon="location"
                title={t('d.settings.shareLocation')}
                sub={t('d.settings.shareLocationSub')}
                on
                onChange={() =>
                  stopSharingLocation(me.id).then(() => {
                    sharing.set(false);
                    toast(t('d.settings.stoppedSharing'));
                  }, toastError)
                }
              />
            ) : null}
            {/* The friends' map is where sharing starts: who sees it (mutual followers or close friends) and for how long. */}
            <LinkRow
              icon="compass"
              title={sharing.data ? t('d.settings.friendsMap') : t('d.settings.shareLocation')}
              sub={sharing.data ? t('d.settings.friendsMapSub') : t('d.settings.startSharingSub')}
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
      <Page title={t('settings.storyAlerts')}>
        <PlusUpsell title={t('d.settings.alertsUpsellTitle')} body={t('d.settings.alertsUpsellBody')} />
      </Page>
    );
  }
  const add = (
    <button className="btn small" onClick={() => setPicking(true)}>
      {t('d.settings.addPeople')}
    </button>
  );
  return (
    <Page title={t('settings.storyAlerts')} intro={t('d.settings.alertsIntro')}>
      <Block title={t('d.settings.onYourList', { count: list?.length ?? 0 })} action={list?.length ? add : undefined}>
        {list === null ? (
          <Spinner />
        ) : error && !list.length ? (
          <Failed error={error} retry={load} />
        ) : !list.length ? (
          <div className="st-alerts-empty">
            <p className="st-empty-line">{t('d.settings.alertsEmpty')}</p>
            {add}
          </div>
        ) : (
          <Card className="st-watch">
            {list.map((p) => (
              <PersonRow
                key={p.id}
                p={p}
                right={
                  <button className="btn quiet small" onClick={() => setOn(p, false)} aria-label={t('createFlow.untag', { username: p.username })}>
                    {t('noteNew.removePlace')}
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
    <Modal title={t('d.settings.addPeople')} onClose={onClose}>
      <div className="st-modal-body st-watch-pick">
        {following.loading ? (
          <Spinner />
        ) : following.error ? (
          <Failed error={following.error} retry={following.reload} />
        ) : !following.data?.length ? (
          <p className="st-empty-line">{t('d.settings.notFollowingAnyone')}</p>
        ) : (
          <>
            <input className="st-input st-search-input" placeholder={t('d.settings.searchFollowing')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('d.settings.searchFollowing')} autoFocus />
            {shown.length ? (
              <Card className="st-candidates">
                {shown.map((p) => (
                  <PersonRow key={p.id} p={p} onOpen={false} right={<input type="checkbox" className="round-check" checked={on.has(p.id)} onChange={() => onToggle(p, !on.has(p.id))} aria-label={on.has(p.id) ? t('createFlow.untag', { username: p.username }) : t('d.settings.addPerson', { username: p.username })} />} />
                ))}
              </Card>
            ) : (
              <p className="st-empty-line">{t('d.settings.noOneByName')}</p>
            )}
          </>
        )}
        <button className="btn block big" onClick={onClose}>
          {t('feed.done')}
        </button>
      </div>
    </Modal>
  );
}

/* ---------- Activity status ---------- */

export function ActivityStatus() {
  const [on, set] = useProfileFlag('show_activity');
  return (
    <Page title={t('settings.activityStatus')}>
      <Card>
        <ToggleRow title={t('d.settings.showActivity')} on={on} onChange={set} sub={t('d.settings.showActivitySub')} />
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
    <Page title={t('d.settings.messagesReplies')}>
      <Block title={t('d.settings.whoCanReply')}>
        <Card>
          {(Object.keys(REPLIES) as StoryReplies[]).map((r) => (
            <RadioRow key={r} name="story-replies" title={t(REPLIES[r])} checked={replies === r} onChange={() => choose(r)} />
          ))}
        </Card>
      </Block>
      <Block title={t('d.settings.seen')} note={me.plus ? undefined : t('d.settings.receiptsPlus')}>
        <Card>
          <ToggleRow title={t('settings.readReceipts')} sub={t('d.settings.receiptsSub')} on={receipts} onChange={setReceipts} disabled={!me.plus} />
        </Card>
        {!me.plus ? (
          <Link to="/plus" className="link-btn st-gap-top">
            {t('d.settings.aboutPlus')}
          </Link>
        ) : null}
      </Block>
      <Block title={t('d.settings.whoCanMessage')}>
        <p className="st-text">
          {me.restricted
            ? t('d.settings.messageUnder14')
            : t('d.settings.messageAnyone')}
        </p>
        <Card>
          <LinkRow icon="block" title={t('d.settings.blockedAccounts')} to="/accounts/blocked" />
        </Card>
      </Block>
    </Page>
  );
}

/* ---------- Notifications ---------- */

/** Each kind of alert and its name's key (the same words as the bell on a profile). */
const ALERTS: [keyof FollowAlerts, string][] = [
  ['posts', 'profile.alertsPosts'],
  ['stories', 'profile.alertsStories'],
  ['clips', 'profile.alertsClips'],
  ['live', 'profile.alertsLive'],
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
    <Modal title={t('d.settings.alertsFrom', { username: p.username })} onClose={() => onClose(changed.current)}>
      <div className="st-modal-body">
        <p className="st-text">{t('d.settings.alertsFromText', { username: p.username })}</p>
        {alerts ? (
          <Card>
            {ALERTS.map(([k, label]) => (
              <ToggleRow key={k} title={t(label)} on={alerts[k]} onChange={(v) => flip(k, v)} />
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
  const muted = (threads.data ?? []).filter((th) => th.muted);
  return (
    <Page title={t('common.notifications')} intro={t('d.settings.notificationsIntro')}>
      <Block title={t('d.settings.alertsFromFollowing')}>
        {following.loading ? <Spinner /> : following.error ? <Failed error={following.error} retry={following.reload} /> : !following.data?.length ? <p className="st-empty-line">{t('d.settings.followNobody')}</p> : (
          <>
            {following.data.length > 6 ? <input className="st-input st-search-input" placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('d.settings.searchFollowing')} /> : null}
            <Card className="st-alerts">
              {shown.map((p) => (
                <PersonRow
                  key={p.id}
                  p={p}
                  sub={p.alerts_on ? t('d.settings.alertsOn') : t('d.settings.alertsOff')}
                  right={
                    <button className="btn quiet small" onClick={() => setEditing(p)} aria-label={t('d.settings.alertsFrom', { username: p.username })}>
                      {p.alerts_on ? t('d.settings.change') : t('d.settings.turnOn')}
                    </button>
                  }
                />
              ))}
            </Card>
          </>
        )}
      </Block>
      <Block title={t('d.settings.mutedChats')} note={t('d.settings.mutedNote')}>
        {threads.loading ? <Spinner /> : !muted.length ? <p className="st-empty-line">{t('d.settings.mutedEmpty')}</p> : (
          <Card>
            {muted.map((th) => (
              <PersonRow
                key={th.id}
                p={{ username: th.username, full_name: th.full_name, avatar_url: th.avatar_url, verified: th.verified }}
                right={
                  <button className="btn quiet small" onClick={() => setThreadMuted(me.id, th.id, false).then(threads.reload, toastError)}>
                    {t('d.settings.unmute')}
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
