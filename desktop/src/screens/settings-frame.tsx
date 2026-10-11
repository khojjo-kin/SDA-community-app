// Settings in Instagram's desktop layout: a column on the left titled Settings, with a search box
// and the sections (small grey headings, an icon and a name on each line), and the chosen page on
// the right. Each page has its own address, /accounts/<id>; an unknown one opens Edit profile.
import React, { useState } from 'react';
import type { Profile } from 'shared/types';
import { useAuth } from '../lib/auth';
import { t } from '../lib/i18n';
import { useMe } from '../lib/me';
import { parts } from '../lib/router';
import { AccountSwitcher } from '../ui/accounts';
import { Icon, Link, ask } from '../ui/kit';
import { AboutPage, AccountsCentre, AccountStatus, FamilyCentre } from './settings-account';
import { AdsPayments, CreatorSubscriptions } from './settings-money';
import { Accessibility, Appearance, Archiving, ChatStreaks, ContentPrefs, Language, LikeCounts } from './settings-prefs';
import { AccountPrivacy, ActivityStatus, Blocked, CloseFriends, MessagesReplies, MutedAccounts, Notifications, RestrictedAccounts, StoryAlerts, StoryLiveLocation } from './settings-privacy';
import { ChatWallpaper, ShortsSettings } from './settings-media';
import { CreatorTools, EditProfile, ProfileViewers, Professional } from './settings-profile';
import { SIcon, type SIconName } from './settings-ui';

// Names and lines here are keys for t() (lib/i18n.ts), turned into words where they're drawn.
type Entry = {
  id: string;
  /** The name's key. */
  label: string;
  icon: SIconName;
  /** The key of a line under the name (only Accounts Centre has one, as on Instagram). */
  sub?: string;
  /** More words the search finds it by (English, whatever the app's language; the name and line are searched in the app's language). */
  words?: string;
  /** The page, or `to`: a page elsewhere in the app. */
  page?: () => React.ReactElement;
  to?: string;
  external?: boolean;
  /** Only for some accounts. */
  when?: (me: Profile) => boolean;
  /** A page opened from another one (and found by search), not listed in the column: its line stays highlighted. */
  parent?: string;
};

/** The column's sections; `label` is the heading's key. */
const GROUPS: { label: string; entries: Entry[] }[] = [
  {
    label: 'settings.section.account',
    entries: [
      { id: 'account', label: 'd.settings.accountsCentre', icon: 'account', sub: 'd.settings.accountsCentreSub', words: 'email password security birthday birth date login activity devices sessions where logged in switch add account deactivate delete download information clerk', page: AccountsCentre },
    ],
  },
  {
    label: 'settings.section.howYouUse',
    entries: [
      { id: 'edit', label: 'profile.editProfile', icon: 'user', words: 'name username photo picture website bio gender pronouns category church contact', page: EditProfile },
      { id: 'notifications', label: 'common.notifications', icon: 'bell', words: 'alerts posts stories shorts live mute chats follow', page: Notifications },
    ],
  },
  {
    label: 'settings.section.insights',
    entries: [
      { id: 'professional', label: 'd.settings.professional', icon: 'shop', words: 'creator personal account type category dashboard insights', page: Professional },
      { id: 'creator', label: 'settings.creatorTools', icon: 'chart', words: 'saved replies faq frequently asked questions shortcuts', page: CreatorTools },
      { id: 'subscriptions', label: 'd.settings.creatorSubs', icon: 'crown', words: 'subscribe subscribers monthly price payouts cancel resume exclusive', page: CreatorSubscriptions },
      { id: 'viewers', label: 'settings.profileViewers', icon: 'eye', words: 'who viewed visitors views plus', page: ProfileViewers },
      { id: 'ads', label: 'd.settings.adsPayments', icon: 'card', words: 'ads promote boost payment history plus billing receipts', page: AdsPayments },
    ],
  },
  {
    label: 'settings.section.whoCanSee',
    entries: [
      { id: 'privacy', label: 'd.settings.accountPrivacy', icon: 'lock', words: 'private public followers requests', page: AccountPrivacy },
      { id: 'close-friends', label: 'settings.closeFriends', icon: 'star', words: 'stories list', page: CloseFriends },
      { id: 'blocked', label: 'settings.blocked', icon: 'block', words: 'block unblock accounts', page: Blocked },
      { id: 'story', label: 'd.settings.storyLiveLocation', icon: 'story', words: 'stories archive live broadcast location map share friends where alerts', page: StoryLiveLocation },
      { id: 'story-alerts', label: 'settings.storyAlerts', icon: 'bell', words: 'stories alerts notify told watched viewers views plus', page: StoryAlerts, parent: 'story' },
      { id: 'activity-status', label: 'settings.activityStatus', icon: 'pulse', words: 'active now online last seen green dot presence', page: ActivityStatus },
    ],
  },
  {
    label: 'd.settings.groupInteract',
    entries: [
      { id: 'messages', label: 'd.settings.messagesReplies', icon: 'send', words: 'chat dm story replies read receipts seen calls', page: MessagesReplies },
      { id: 'restricted', label: 'd.social.restrictedAccounts', icon: 'shield', words: 'restrict unrestrict limit comments message requests', page: RestrictedAccounts },
    ],
  },
  {
    label: 'clips.whatYouSee',
    entries: [
      { id: 'muted', label: 'd.social.mutedAccounts', icon: 'mute', words: 'mute unmute muted hide posts stories feed tray', page: MutedAccounts },
      { id: 'content', label: 'd.settings.contentPrefs', icon: 'sliders', words: 'feed for you explore shorts interests topics more less sensitive recommendations', page: ContentPrefs },
      { id: 'shorts', label: 'tabs.clips', icon: 'reels', words: 'shorts videos sound mute muted captions subtitles caption language translate', page: ShortsSettings },
      { id: 'counts', label: 'd.settings.likeCounts', icon: 'counts', words: 'view counts likes hide numbers profile display', page: LikeCounts },
      { id: 'streaks', label: 'settings.chatStreaks', icon: 'flame', words: 'streak fire days messages in a row', page: ChatStreaks },
    ],
  },
  {
    label: 'settings.section.appAndMedia',
    entries: [
      { id: 'appearance', label: 'd.settings.appearance', icon: 'moon', words: 'theme dark white light mode colour color look app font typeface text nunito lora poppins plus', page: Appearance },
      { id: 'chat-wallpaper', label: 'settings.chatWallpaper', icon: 'wallpaper', words: 'chats messages background wallpaper theme plus', page: ChatWallpaper, parent: 'appearance' },
      { id: 'archive', label: 'd.settings.archiving', icon: 'archive', words: 'stories archive saved your activity history', page: Archiving },
      { id: 'language', label: 'language.title', icon: 'globe', words: 'translate english french spanish twi', page: Language },
      { id: 'accessibility', label: 'd.settings.accessibility', icon: 'access', words: 'reduce motion animation keyboard shortcuts zoom text size', page: Accessibility },
    ],
  },
  {
    label: 'd.settings.groupFamily',
    entries: [{ id: 'family', label: 'd.settings.under14Accounts', icon: 'family', words: 'teen child children young minor age parents guardian safety restricted', page: FamilyCentre }],
  },
  {
    label: 'settings.section.support',
    entries: [
      { id: 'help', label: 'd.settings.help', icon: 'lifebuoy', words: 'support chat contact questions problem feedback review rate idea bug', to: '/help' },
      { id: 'privacy-centre', label: 'd.settings.privacyCentre', icon: 'shield', words: 'privacy policy data terms legal', to: '/legal/privacy', external: true },
      { id: 'status', label: 'd.settings.accountStatus', icon: 'status', words: 'suspended warning limits standing restrictions', page: AccountStatus },
      { id: 'about', label: 'settings.about', icon: 'info', words: 'version terms privacy copyright child safety guidelines legal', page: AboutPage },
    ],
  },
];

/** Older addresses, and the iPhone's names for the same pages. */
const ALIASES: Record<string, string> = { replies: 'creator', 'saved-replies': 'creator', faq: 'creator', 'login-activity': 'account', 'account-type': 'professional', 'story-settings': 'story', 'view-counts': 'counts', theme: 'appearance', 'plus-font': 'appearance', 'app-font': 'appearance', 'clips-settings': 'content', 'reel-settings': 'shorts', 'live-location': 'story', 'creator-subscriptions': 'subscriptions', 'profile-viewers': 'viewers', 'under-14': 'family' };

export function Settings({ path }: { path: string }) {
  const { me } = useMe();
  const auth = useAuth();
  const [q, setQ] = useState('');
  const [switching, setSwitching] = useState(false);
  const usable = GROUPS.map((g) => ({ ...g, entries: g.entries.filter((e) => !e.when || e.when(me)) }));
  // Every page, for its address and the search; the column itself leaves out pages opened from another.
  const all = usable.flatMap((g) => g.entries);
  const groups = usable.map((g) => ({ ...g, entries: g.entries.filter((e) => !e.parent) })).filter((g) => g.entries.length);
  const asked = parts(path)[1] ?? 'edit';
  const current = all.find((e) => e.page && e.id === (ALIASES[asked] ?? asked)) ?? all.find((e) => e.id === 'edit')!;
  const Page = current.page!;
  const needle = q.trim().toLowerCase();
  const found = needle ? all.filter((e) => `${t(e.label)} ${e.sub ? t(e.sub) : ''} ${e.words ?? ''}`.toLowerCase().includes(needle)) : [];

  const item = (e: Entry) => (
    <Link key={e.id} to={e.to ?? '/accounts/' + e.id} className={'st-nav-item' + (e.id === (current.parent ?? current.id) ? ' on' : '')}>
      <SIcon name={e.icon} />
      <span className="st-nav-text">
        <span>{t(e.label)}</span>
        {e.sub ? <small>{t(e.sub)}</small> : null}
      </span>
      {e.external ? <SIcon name="external" size={16} /> : null}
    </Link>
  );

  return (
    <div className="st-shell">
      <nav className="st-nav" aria-label={t('d.settings.title')}>
        <h2 className="st-nav-title">{t('d.settings.title')}</h2>
        <label className="st-search">
          <Icon name="search" size={18} />
          <input placeholder={t('common.search')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('settings.search')} />
          {q ? (
            <button type="button" className="st-search-clear" aria-label={t('d.settings.clearSearch')} onClick={() => setQ('')}>
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
                <b>{t('settings.noneFound')}</b>
                <span>{t('settings.tryDifferentWord')}</span>
              </div>
            )
          ) : (
            <>
              {groups.map((g) => (
                <div key={g.label} className="st-group">
                  <h3 className="st-group-h">{t(g.label)}</h3>
                  {g.entries.map(item)}
                </div>
              ))}
              <div className="st-group">
                <h3 className="st-group-h">{t('settings.section.login')}</h3>
                <button className="st-nav-item" onClick={() => setSwitching(true)}>
                  <Icon name="swap" />
                  <span className="st-nav-text">
                    <span>{t('accounts.switchHint')}</span>
                  </span>
                </button>
                <button
                  className="st-nav-item danger"
                  onClick={async () => {
                    if (await ask(t('settings.logOutQuestion'), '', t('settings.logOut'))) auth.signOut();
                  }}
                >
                  <Icon name="logout" />
                  <span className="st-nav-text">
                    <span>{t('settings.logOut')}</span>
                    <small>{t('settings.loggedInAs', { username: me.username })}</small>
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
