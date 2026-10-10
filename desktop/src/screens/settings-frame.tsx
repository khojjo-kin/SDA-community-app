// Settings in Instagram's desktop layout: a column on the left titled Settings, with a search box
// and the sections (small grey headings, an icon and a name on each line), and the chosen page on
// the right. Each page has its own address, /accounts/<id>; an unknown one opens Edit profile.
import React, { useState } from 'react';
import type { Profile } from 'shared/types';
import { useAuth } from '../lib/auth';
import { useMe } from '../lib/me';
import { parts } from '../lib/router';
import { AccountSwitcher } from '../ui/accounts';
import { Icon, Link, ask } from '../ui/kit';
import { AboutPage, AccountsCentre, AccountStatus, FamilyCentre } from './settings-account';
import { AdsPayments, CreatorSubscriptions } from './settings-money';
import { Accessibility, Appearance, Archiving, ChatStreaks, ContentPrefs, Language, LikeCounts } from './settings-prefs';
import { AccountPrivacy, ActivityStatus, Blocked, CloseFriends, MessagesReplies, Notifications, StoryLiveLocation } from './settings-privacy';
import { CreatorTools, EditProfile, ProfileViewers, Professional } from './settings-profile';
import { SIcon, type SIconName } from './settings-ui';

type Entry = {
  id: string;
  label: string;
  icon: SIconName;
  /** A line under the name (only Accounts Centre has one, as on Instagram). */
  sub?: string;
  /** More words the search finds it by. */
  words?: string;
  /** The page, or `to`: a page elsewhere in the app. */
  page?: () => React.ReactElement;
  to?: string;
  external?: boolean;
  /** Only for some accounts. */
  when?: (me: Profile) => boolean;
};

const GROUPS: { label: string; entries: Entry[] }[] = [
  {
    label: 'Your account',
    entries: [
      { id: 'account', label: 'Accounts Centre', icon: 'account', sub: 'Password, security, personal details, login activity and the accounts on this computer', words: 'email password security birthday birth date login activity devices sessions where logged in switch add account deactivate delete download information clerk', page: AccountsCentre },
    ],
  },
  {
    label: 'How you use Community',
    entries: [
      { id: 'edit', label: 'Edit profile', icon: 'user', words: 'name username photo picture website bio gender pronouns category church contact', page: EditProfile },
      { id: 'notifications', label: 'Notifications', icon: 'bell', words: 'alerts posts stories shorts live mute chats follow', page: Notifications },
    ],
  },
  {
    label: 'Your insights and tools',
    entries: [
      { id: 'professional', label: 'Professional account', icon: 'shop', words: 'creator personal account type category dashboard insights', page: Professional },
      { id: 'creator', label: 'Creator tools and controls', icon: 'chart', words: 'saved replies faq frequently asked questions shortcuts', page: CreatorTools },
      { id: 'subscriptions', label: 'Creator subscriptions', icon: 'crown', words: 'subscribe subscribers monthly price payouts cancel resume exclusive', page: CreatorSubscriptions },
      { id: 'viewers', label: 'Profile viewers', icon: 'eye', words: 'who viewed visitors views plus', page: ProfileViewers },
      { id: 'ads', label: 'Ads and payments', icon: 'card', words: 'ads promote boost payment history plus billing receipts', page: AdsPayments },
    ],
  },
  {
    label: 'Who can see your content',
    entries: [
      { id: 'privacy', label: 'Account privacy', icon: 'lock', words: 'private public followers requests', page: AccountPrivacy },
      { id: 'close-friends', label: 'Close friends', icon: 'star', words: 'stories list', page: CloseFriends },
      { id: 'blocked', label: 'Blocked', icon: 'block', words: 'block unblock accounts', page: Blocked },
      { id: 'story', label: 'Story, live and location', icon: 'story', words: 'stories archive live broadcast location map share', page: StoryLiveLocation },
      { id: 'activity-status', label: 'Activity status', icon: 'pulse', words: 'active now online last seen green dot presence', page: ActivityStatus },
    ],
  },
  {
    label: 'How others can interact with you',
    entries: [{ id: 'messages', label: 'Messages and story replies', icon: 'send', words: 'chat dm story replies read receipts seen calls', page: MessagesReplies }],
  },
  {
    label: 'What you see',
    entries: [
      { id: 'content', label: 'Content preferences', icon: 'sliders', words: 'feed for you explore shorts interests topics more less sensitive recommendations', page: ContentPrefs },
      { id: 'counts', label: 'Like and share counts', icon: 'counts', words: 'view counts likes hide numbers profile display', page: LikeCounts },
      { id: 'streaks', label: 'Chat streaks', icon: 'flame', words: 'streak fire days messages in a row', page: ChatStreaks },
    ],
  },
  {
    label: 'Your app and media',
    entries: [
      { id: 'appearance', label: 'Appearance', icon: 'moon', words: 'theme dark white light mode colour color look', page: Appearance },
      { id: 'archive', label: 'Archiving', icon: 'archive', words: 'stories archive saved your activity history', page: Archiving },
      { id: 'language', label: 'Language', icon: 'globe', words: 'translate english french spanish twi', page: Language },
      { id: 'accessibility', label: 'Accessibility', icon: 'access', words: 'reduce motion animation keyboard shortcuts zoom text size', page: Accessibility },
    ],
  },
  {
    label: 'Family Centre',
    entries: [{ id: 'family', label: 'Under-14 accounts', icon: 'family', words: 'teen child children young minor age parents guardian safety restricted', page: FamilyCentre }],
  },
  {
    label: 'More info and support',
    entries: [
      { id: 'help', label: 'Help', icon: 'lifebuoy', words: 'support chat contact questions problem feedback review rate idea bug', to: '/help' },
      { id: 'privacy-centre', label: 'Privacy Centre', icon: 'shield', words: 'privacy policy data terms legal', to: '/legal/privacy', external: true },
      { id: 'status', label: 'Account status', icon: 'status', words: 'suspended warning limits standing restrictions', page: AccountStatus },
      { id: 'about', label: 'About', icon: 'info', words: 'version terms privacy copyright child safety guidelines legal', page: AboutPage },
    ],
  },
];

/** Older addresses, and the iPhone's names for the same pages. */
const ALIASES: Record<string, string> = { replies: 'creator', 'saved-replies': 'creator', faq: 'creator', 'login-activity': 'account', 'account-type': 'professional', 'story-settings': 'story', 'view-counts': 'counts', theme: 'appearance', 'clips-settings': 'content', 'creator-subscriptions': 'subscriptions', 'profile-viewers': 'viewers', 'under-14': 'family' };

export function Settings({ path }: { path: string }) {
  const { me } = useMe();
  const auth = useAuth();
  const [q, setQ] = useState('');
  const [switching, setSwitching] = useState(false);
  const groups = GROUPS.map((g) => ({ ...g, entries: g.entries.filter((e) => !e.when || e.when(me)) })).filter((g) => g.entries.length);
  const all = groups.flatMap((g) => g.entries);
  const asked = parts(path)[1] ?? 'edit';
  const current = all.find((e) => e.page && e.id === (ALIASES[asked] ?? asked)) ?? all.find((e) => e.id === 'edit')!;
  const Page = current.page!;
  const needle = q.trim().toLowerCase();
  const found = needle ? all.filter((e) => `${e.label} ${e.sub ?? ''} ${e.words ?? ''}`.toLowerCase().includes(needle)) : [];

  const item = (e: Entry) => (
    <Link key={e.id} to={e.to ?? '/accounts/' + e.id} className={'st-nav-item' + (e.id === current.id ? ' on' : '')}>
      <SIcon name={e.icon} />
      <span className="st-nav-text">
        <span>{e.label}</span>
        {e.sub ? <small>{e.sub}</small> : null}
      </span>
      {e.external ? <SIcon name="external" size={16} /> : null}
    </Link>
  );

  return (
    <div className="st-shell">
      <nav className="st-nav" aria-label="Settings">
        <h2 className="st-nav-title">Settings</h2>
        <label className="st-search">
          <Icon name="search" size={18} />
          <input placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search settings" />
          {q ? (
            <button type="button" className="st-search-clear" aria-label="Clear search" onClick={() => setQ('')}>
              <Icon name="close" size={12} stroke={3} />
            </button>
          ) : null}
        </label>
        <div className="st-nav-list">
          {needle ? (
            found.length ? (
              <div className="st-group">{found.map(item)}</div>
            ) : (
              <div className="st-none">
                <b>No settings found</b>
                <span>Try a different word.</span>
              </div>
            )
          ) : (
            <>
              {groups.map((g) => (
                <div key={g.label} className="st-group">
                  <h3 className="st-group-h">{g.label}</h3>
                  {g.entries.map(item)}
                </div>
              ))}
              <div className="st-group">
                <h3 className="st-group-h">Login</h3>
                <button className="st-nav-item" onClick={() => setSwitching(true)}>
                  <Icon name="swap" />
                  <span className="st-nav-text">
                    <span>Switch accounts</span>
                  </span>
                </button>
                <button
                  className="st-nav-item danger"
                  onClick={async () => {
                    if (await ask('Log out of Community?', '', 'Log out')) auth.signOut();
                  }}
                >
                  <Icon name="logout" />
                  <span className="st-nav-text">
                    <span>Log out</span>
                    <small>Logged in as {me.username}</small>
                  </span>
                </button>
              </div>
            </>
          )}
        </div>
      </nav>
      <div className="st-body">
        <Page key={current.id} />
      </div>
      {switching ? <AccountSwitcher onClose={() => setSwitching(false)} /> : null}
    </div>
  );
}
