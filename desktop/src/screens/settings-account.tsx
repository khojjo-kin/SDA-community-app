// Settings pages about the account itself: Accounts Centre (sign-in and security through Clerk,
// birthday, where you're logged in, the accounts on this computer, deactivating), Account status,
// Family Centre (the under-14 rules) and About.
import React, { useState } from 'react';
import { deactivateAccount, fetchBirthDate, isOnline } from 'shared/api';
import { supabase } from 'shared/supabase';
import { ago } from 'shared/theme';
import { MAX_ACCOUNTS, useAuth } from '../lib/auth';
import type { Session } from '../lib/admin';
import { t, tSplit, tn } from '../lib/i18n';
import { useMe } from '../lib/me';
import { nav } from '../lib/router';
import { Avatar, Failed, Icon, Link, Spinner, Verified, ask, toast, toastError, useLoad } from '../ui/kit';
import { LEGAL_DETAILS } from './legal-docs.gen';
import { AboutCommunity, isPlaceholder } from './legal';
import { BirthdayQuestion, MinorRules } from './settings-birthday';
import { Block, Card, LinkRow, Notice, Page, SIcon, longDate } from './settings-ui';

/* ---------- Accounts Centre ---------- */

export function AccountsCentre() {
  const { me } = useMe();
  const auth = useAuth();
  return (
    <Page title={t('d.settings.accountsCentre')} intro={t('d.settings.accountsCentreIntro')}>
      <div className="st-profile-card">
        <Avatar src={me.avatar_url} name={me.username} size={56} />
        <span className="st-row-text">
          <b>
            {me.username} {me.verified ? <Verified size={13} /> : null}
          </b>
          <span>{me.full_name}</span>
        </span>
        <Link to="/accounts/edit" className="btn quiet">
          {t('profile.editProfile')}
        </Link>
      </div>

      <Block title={t('d.settings.accountSettings')}>
        <Card>
          <LinkRow
            icon="key"
            title={t('d.settings.security')}
            sub={auth.demo ? t('d.settings.securityDemo') : auth.user?.email ? t('d.settings.securitySubEmail', { email: auth.user.email }) : t('d.settings.securitySub')}
            external
            testId="clerk-account"
            onClick={() => (auth.demo ? toast(t('d.settings.securityDemoToast')) : auth.openAccount())}
          />
          <BirthdayRow />
          <LinkRow icon="download" title={t('d.settings.download')} sub={t('d.settings.downloadSub')} to="/help/chat" />
        </Card>
      </Block>

      <LoginActivity />
      <AccountsHere />

      <Block title={t('d.settings.deactivateTitle')} note={t('d.settings.deactivateNote')}>
        <button
          className="btn danger-outline"
          onClick={async () => {
            if (!(await ask(t('d.settings.deactivateQ'), t('d.settings.deactivateQBody'), t('d.settings.deactivate')))) return;
            try {
              await deactivateAccount(me.id);
              await auth.signOut();
            } catch (e) {
              toastError(e);
            }
          }}
        >
          {t('d.settings.deactivateAccount')}
        </button>
      </Block>
    </Page>
  );
}

/** Your birthday: only you (and admins) see it, and once given only support can change it. */
function BirthdayRow() {
  const { me, refresh } = useMe();
  const born = useLoad(() => fetchBirthDate(me.id), []);
  const [asking, setAsking] = useState(false);
  return (
    <div className="st-row">
      <span className="st-row-icon">
        <Icon name="calendar" />
      </span>
      <span className="st-row-text">
        <b>{t('d.settings.birthday')}</b>
        <span>
          {born.loading ? t('d.settings.loading') : born.data ? t('d.settings.birthdaySet', { date: longDate(born.data) }) : t('d.settings.birthdayMissing')}
        </span>
      </span>
      {!born.loading && !born.data ? (
        <button className="btn small" onClick={() => setAsking(true)}>
          {t('feed.add')}
        </button>
      ) : null}
      {asking ? (
        <BirthdayQuestion
          me={me.id}
          onDone={() => {
            setAsking(false);
            born.reload();
            refresh().catch(() => {});
          }}
        />
      ) : null}
    </div>
  );
}

/* ---------- where you're logged in ---------- */

type Place = { id: string; device: string; where: string; when: string; here: boolean; mobile: boolean; revoke?: () => Promise<unknown> };

/** Each platform's name's key. */
const PLATFORMS: Record<string, string> = { mac: 'd.settings.onMac', web: 'd.settings.onWeb', ios: 'd.settings.onIphone', windows: 'd.settings.onWindows', other: 'd.settings.onDesktop' };

/** "Last active 3 days ago": agoLong's words (shared/theme.ts), in the app's language. */
function lastActive(iso: string): string {
  const a = ago(iso); // 'now', or a number and m, h, d or w
  if (a === 'now') return t('d.settings.lastActiveJustNow');
  const unit = ({ m: 'Minutes', h: 'Hours', d: 'Days', w: 'Weeks' } as Record<string, string>)[a.slice(-1)];
  return tn('d.settings.lastActive' + unit, parseInt(a, 10));
}

/** When a device was last seen, in the steps activeLabel uses (shared/api.ts) and then "Last active …", in the app's language. */
function seenLabel(iso: string): string {
  const d = Date.now() - new Date(iso).getTime();
  if (isOnline(iso)) return t('common.activeNow');
  if (d < 3600e3) return t('d.settings.activeMinutesAgo', { count: Math.round(d / 60e3) });
  if (d < 86400e3) return t('d.settings.activeHoursAgo', { count: Math.round(d / 3600e3) });
  if (d < 2 * 86400e3) return t('d.settings.activeYesterday');
  return lastActive(iso);
}

/** Clerk's own list of signed-in devices (the real app), with a way to log any of them out. */
async function clerkPlaces(): Promise<Place[]> {
  const clerk = window.Clerk;
  const all: any[] = await clerk.user.getSessions();
  return all
    .filter((s) => s.status === 'active')
    .map((s) => {
      const a = s.latestActivity ?? {};
      const here = s.id === clerk.session?.id;
      return {
        id: s.id,
        device: a.deviceType || a.browserName || (a.isMobile ? t('d.settings.devicePhone') : t('d.settings.deviceComputer')),
        where: [a.city, a.country].filter(Boolean).join(', ') || t('d.settings.locationUnknown'),
        when: here ? t('common.activeNow') : lastActive(new Date(s.lastActiveAt).toISOString()),
        here,
        mobile: !!a.isMobile,
        revoke: here ? undefined : () => s.revoke(),
      };
    })
    .sort((a, b) => Number(b.here) - Number(a.here));
}

/** The app's own record of where this account opened Community (the demo, or when Clerk can't list them). */
async function appPlaces(me: string): Promise<Place[]> {
  const { data, error } = await supabase.from('community_sessions').select('*').eq('user_id', me).order('last_seen', { ascending: false }).limit(20);
  if (error) throw error;
  return ((data as Session[]) ?? []).map((s) => ({
    id: s.id,
    device: PLATFORMS[s.platform] ? t(PLATFORMS[s.platform]) : 'Community',
    where: [s.device, s.country].filter(Boolean).join(' · ') || t('d.settings.locationUnknown'),
    when: seenLabel(s.last_seen),
    here: false,
    mobile: s.platform === 'ios',
  }));
}

function LoginActivity() {
  const { me } = useMe();
  const auth = useAuth();
  const viaClerk = !auth.demo && typeof window.Clerk?.user?.getSessions === 'function';
  const list = useLoad(() => (viaClerk ? clerkPlaces() : appPlaces(me.id)), []);
  const [ending, setEnding] = useState('');
  const others = (list.data ?? []).filter((p) => p.revoke);
  const end = async (places: Place[], label: string) => {
    if (!(await ask(label, t('d.settings.logOutThere'), t('settings.logOut')))) return;
    setEnding(places.length > 1 ? 'all' : places[0].id);
    const results = await Promise.allSettled(places.map((p) => p.revoke!()));
    const failed = results.filter((r) => r.status === 'rejected').length;
    toast(failed ? tn('d.settings.logOutFailed', failed) : places.length > 1 ? t('d.settings.loggedOutAll') : t('d.settings.loggedOutOf', { device: places[0].device }));
    setEnding('');
    list.reload();
  };
  return (
    <Block title={t('settings.loginActivitySub')} note={viaClerk ? undefined : t('d.settings.loginNote')}>
      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <Failed error={list.error} retry={list.reload} />
      ) : !list.data?.length ? (
        <p className="st-empty-line">{t('d.settings.noDevices')}</p>
      ) : (
        <Card>
          {list.data.map((p) => (
            <div key={p.id} className="st-row">
              <span className="st-row-icon">
                <SIcon name={p.mobile ? 'phone' : 'devices'} />
              </span>
              <span className="st-row-text">
                <b>
                  {p.device}
                  {p.here ? ' · ' + t('d.settings.thisComputer') : ''}
                </b>
                <span>{p.where}</span>
                <span className={p.when === t('common.activeNow') ? 'st-ok' : ''}>{p.when}</span>
              </span>
              {p.revoke ? (
                <button className="btn quiet small" disabled={!!ending} onClick={() => end([p], t('d.settings.logOutOfQ', { device: p.device }))}>
                  {ending === p.id ? t('d.settings.loggingOut') : t('settings.logOut')}
                </button>
              ) : null}
            </div>
          ))}
        </Card>
      )}
      {others.length > 1 ? (
        <button className="btn danger-outline st-gap-top" disabled={!!ending} onClick={() => end(others, t('d.settings.logOutAllQ'))}>
          {t('d.settings.logOutAll')}
        </button>
      ) : null}
    </Block>
  );
}

/** Every account signed in on this computer (up to five), as on the iPhone. */
function AccountsHere() {
  const auth = useAuth();
  const { me } = useMe();
  const [busy, setBusy] = useState('');
  return (
    <Block title={t('d.settings.accountsHere')}>
      <Card>
        {auth.accounts.map((a) => (
          <div key={a.sessionId} className="st-row">
            <Avatar src={a.current ? me.avatar_url || a.imageUrl : a.imageUrl} name={a.username} size={40} />
            <span className="st-row-text">
              <b>{a.current ? me.username : a.username}</b>
              <span>{a.current ? t('d.settings.loggedInNow') : a.name}</span>
            </span>
            {a.current ? (
              <span className="pill">{t('d.settings.inUse')}</span>
            ) : (
              <button
                className="btn quiet small"
                disabled={!!busy}
                onClick={async () => {
                  setBusy(a.sessionId);
                  try {
                    await auth.switchTo(a.sessionId);
                  } catch (e) {
                    setBusy('');
                    toastError(e);
                  }
                }}
              >
                {busy === a.sessionId ? t('d.settings.switching') : t('d.settings.switch')}
              </button>
            )}
          </div>
        ))}
        <LinkRow
          icon="pluscircle"
          title={t('d.settings.addAccount')}
          sub={t('d.settings.addAccountSub', { count: MAX_ACCOUNTS })}
          onClick={() => {
            if (auth.demo) return toast(t('d.settings.demoSwitch'));
            if (auth.accounts.length >= MAX_ACCOUNTS) return toast(t('d.settings.maxAccounts', { count: MAX_ACCOUNTS }));
            auth.addAccount();
          }}
        />
      </Card>
    </Block>
  );
}

/* ---------- Account status ---------- */

export function AccountStatus() {
  const { me } = useMe();
  const facts: [string, string][] = [
    [t('d.settings.joined'), longDate(me.created_at)],
    [t('d.settings.accountType'), me.account_type === 'creator' ? t('d.settings.creator') + (me.category ? ' · ' + me.category : '') : t('d.settings.personal')],
    [t('d.settings.blueTick'), me.verified || me.tick_hidden ? (me.tick_hidden ? t('d.settings.verifiedHidden') : t('common.verified')) : t('d.settings.notVerified')],
    [t('common.communityPlus'), me.plus ? (me.plus_until ? t('d.settings.activeUntil', { date: longDate(me.plus_until) }) : t('settings.plusActive')) : t('d.settings.notSubscribed')],
    [t('d.settings.under14Rules'), me.restricted ? t('d.settings.on') : t('settings.repliesOff')],
    [t('d.settings.privacy'), me.is_private || me.restricted ? t('d.settings.privateAccount') : t('d.settings.publicAccount')],
  ];
  return (
    <Page title={t('d.settings.accountStatus')} intro={t('d.settings.statusIntro')}>
      <div className="st-status">
        <span className="st-status-icon">
          <Icon name="check" size={26} stroke={2.4} />
        </span>
        <div>
          <b>{t('d.settings.goodStanding')}</b>
          <p>{t('d.settings.goodStandingText')}</p>
        </div>
      </div>
      <Block title={t('d.settings.aboutAccount')}>
        <Card>
          {facts.map(([k, v]) => (
            <div key={k} className="st-row st-fact">
              <span className="st-row-text">
                <b>{k}</b>
              </span>
              <span className="st-row-value">{v}</span>
            </div>
          ))}
        </Card>
      </Block>
      <Block title={t('d.settings.keepingSafe')}>
        <Card>
          <LinkRow icon="users" title={t('legal.guidelines')} sub={t('d.settings.guidelinesSub')} to="/legal/guidelines" />
          <LinkRow icon="lifebuoy" title={t('d.settings.askAccount')} sub={t('d.settings.askAccountSub')} to="/help/chat" />
        </Card>
      </Block>
    </Page>
  );
}

/* ---------- Family Centre ---------- */

export function FamilyCentre() {
  const { me } = useMe();
  const email = LEGAL_DETAILS.contact_email ?? '';
  const parentsLine = tSplit('d.settings.parentsText', 'email');
  if (me.restricted) {
    return (
      <Page title={t('settings.under14')} intro={t('d.settings.under14Intro')}>
        <MinorRules />
        <Notice icon="calendar">{t('d.settings.under14Birthday')}</Notice>
      </Page>
    );
  }
  return (
    <Page title={t('d.settings.under14Accounts')} intro={t('d.settings.under14AccountsIntro')}>
      <Block title={t('d.settings.under14Changes')}>
        <MinorRules you={false} />
      </Block>
      <Block title={t('d.settings.parents')}>
        <p className="st-text">
          {parentsLine[0]}
          {isPlaceholder(email) ? email : <a href={'mailto:' + email}>{email}</a>}
          {parentsLine[1]}
        </p>
        <Card>
          <LinkRow icon="shield" title={t('legal.childSafety')} sub={t('d.settings.childSafetySub')} to="/legal/child-safety" />
        </Card>
      </Block>
    </Page>
  );
}

/* ---------- About ---------- */

export function AboutPage() {
  return (
    <Page title={t('settings.about')}>
      <AboutCommunity openDoc={(id) => nav('/legal/' + id)} />
    </Page>
  );
}

