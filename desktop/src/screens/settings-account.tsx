// Settings pages about the account itself: Accounts Centre (sign-in and security through Clerk,
// birthday, where you're logged in, the accounts on this computer, deactivating), Account status,
// Family Centre (the under-14 rules) and About.
import React, { useState } from 'react';
import { activeLabel, deactivateAccount, fetchBirthDate, isOnline } from 'shared/api';
import { supabase } from 'shared/supabase';
import { agoLong } from 'shared/theme';
import { MAX_ACCOUNTS, useAuth } from '../lib/auth';
import type { Session } from '../lib/admin';
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
    <Page title="Accounts Centre" intro="Your sign-in, personal details, where you're logged in and the accounts on this computer.">
      <div className="st-profile-card">
        <Avatar src={me.avatar_url} name={me.username} size={56} />
        <span className="st-row-text">
          <b>
            {me.username} {me.verified ? <Verified size={13} /> : null}
          </b>
          <span>{me.full_name}</span>
        </span>
        <Link to="/accounts/edit" className="btn quiet">
          Edit profile
        </Link>
      </div>

      <Block title="Account settings">
        <Card>
          <LinkRow
            icon="key"
            title="Email, password and security"
            sub={auth.demo ? 'In the real app this opens your sign-in account: email, password, phone number and two-step verification.' : `Change your email${auth.user?.email ? ' (' + auth.user.email + ')' : ''} or password, add a phone number and turn on two-step verification.`}
            external
            testId="clerk-account"
            onClick={() => (auth.demo ? toast('The demo has no sign-in service. In the real app this opens your account settings.') : auth.openAccount())}
          />
          <BirthdayRow />
          <LinkRow icon="download" title="Download your information" sub="Ask our support team for a copy of everything Community keeps about you." to="/help/chat" />
        </Card>
      </Block>

      <LoginActivity />
      <AccountsHere />

      <Block title="Deactivate your account" note="Your profile, posts and messages are hidden straight away. Log in again within 30 days to bring everything back; after that it is deleted for good.">
        <button
          className="btn danger-outline"
          onClick={async () => {
            if (!(await ask('Deactivate your account?', 'Log in again within 30 days to restore it. After that it is deleted permanently.', 'Deactivate'))) return;
            try {
              await deactivateAccount(me.id);
              await auth.signOut();
            } catch (e) {
              toastError(e);
            }
          }}
        >
          Deactivate account
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
        <b>Birthday</b>
        <span>
          {born.loading ? 'Loading…' : born.data ? longDate(born.data) + ". Only you can see it. To change it, ask support." : 'Not added yet. We ask everyone, to keep younger members safe.'}
        </span>
      </span>
      {!born.loading && !born.data ? (
        <button className="btn small" onClick={() => setAsking(true)}>
          Add
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

const PLATFORMS: Record<string, string> = { mac: 'Community for Mac', web: 'Community on the web', ios: 'Community for iPhone', windows: 'Community for Windows', other: 'Community for desktop' };

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
        device: a.deviceType || a.browserName || (a.isMobile ? 'Phone' : 'Computer'),
        where: [a.city, a.country].filter(Boolean).join(', ') || 'Location unknown',
        when: here ? 'Active now' : 'Last active ' + agoLong(new Date(s.lastActiveAt).toISOString()).toLowerCase(),
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
    device: PLATFORMS[s.platform] ?? 'Community',
    where: [s.device, s.country].filter(Boolean).join(' · ') || 'Location unknown',
    when: isOnline(s.last_seen) ? 'Active now' : activeLabel(s.last_seen) || 'Last active ' + agoLong(s.last_seen).toLowerCase(),
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
    if (!(await ask(label, 'Whoever is using Community there will have to log in again.', 'Log out'))) return;
    setEnding(places.length > 1 ? 'all' : places[0].id);
    const results = await Promise.allSettled(places.map((p) => p.revoke!()));
    const failed = results.filter((r) => r.status === 'rejected').length;
    toast(failed ? `${failed} couldn't be logged out. Try again.` : places.length > 1 ? 'Logged out of all other devices' : 'Logged out of ' + places[0].device);
    setEnding('');
    list.reload();
  };
  return (
    <Block title="Where you're logged in" note={viaClerk ? undefined : 'Each time Community opens on a phone or computer, the app notes it here with the approximate country. To log a device out, use Email, password and security.'}>
      {list.loading ? (
        <Spinner />
      ) : list.error ? (
        <Failed error={list.error} retry={list.reload} />
      ) : !list.data?.length ? (
        <p className="st-empty-line">No devices to show yet.</p>
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
                  {p.here ? ' · This computer' : ''}
                </b>
                <span>{p.where}</span>
                <span className={p.when === 'Active now' ? 'st-ok' : ''}>{p.when}</span>
              </span>
              {p.revoke ? (
                <button className="btn quiet small" disabled={!!ending} onClick={() => end([p], `Log out of ${p.device}?`)}>
                  {ending === p.id ? 'Logging out…' : 'Log out'}
                </button>
              ) : null}
            </div>
          ))}
        </Card>
      )}
      {others.length > 1 ? (
        <button className="btn danger-outline st-gap-top" disabled={!!ending} onClick={() => end(others, 'Log out of all other devices?')}>
          Log out of all other devices
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
    <Block title="Accounts on this computer">
      <Card>
        {auth.accounts.map((a) => (
          <div key={a.sessionId} className="st-row">
            <Avatar src={a.current ? me.avatar_url || a.imageUrl : a.imageUrl} name={a.username} size={40} />
            <span className="st-row-text">
              <b>{a.current ? me.username : a.username}</b>
              <span>{a.current ? 'Logged in now' : a.name}</span>
            </span>
            {a.current ? (
              <span className="pill">In use</span>
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
                {busy === a.sessionId ? 'Switching…' : 'Switch'}
              </button>
            )}
          </div>
        ))}
        <LinkRow
          icon="pluscircle"
          title="Log in to an existing account"
          sub={`Keep up to ${MAX_ACCOUNTS} accounts on this computer and switch without logging out.`}
          onClick={() => {
            if (auth.demo) return toast('In the demo, switch between the two sample accounts above.');
            if (auth.accounts.length >= MAX_ACCOUNTS) return toast(`You can add up to ${MAX_ACCOUNTS} accounts.`);
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
    ['Joined', longDate(me.created_at)],
    ['Account type', me.account_type === 'creator' ? 'Creator' + (me.category ? ' · ' + me.category : '') : 'Personal'],
    ['Blue tick', me.verified || me.tick_hidden ? (me.tick_hidden ? 'Verified (hidden)' : 'Verified') : 'Not verified'],
    ['Community Plus', me.plus ? 'Active' + (me.plus_until ? ' until ' + longDate(me.plus_until) : '') : 'Not subscribed'],
    ['Under-14 rules', me.restricted ? 'On' : 'Off'],
    ['Privacy', me.is_private || me.restricted ? 'Private account' : 'Public account'],
  ];
  return (
    <Page title="Account status" intro="Whether your account can use everything on Community, and what applies to it.">
      <div className="st-status">
        <span className="st-status-icon">
          <Icon name="check" size={26} stroke={2.4} />
        </span>
        <div>
          <b>Your account is in good standing</b>
          <p>You can post, message and use every feature open to your account. If an admin ever limits or suspends it, you'll be told when you log in, with the reason and how long it lasts.</p>
        </div>
      </div>
      <Block title="About your account">
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
      <Block title="Keeping Community safe">
        <Card>
          <LinkRow icon="users" title="Community guidelines" sub="What is and isn't allowed, and what happens when something breaks the rules." to="/legal/guidelines" />
          <LinkRow icon="lifebuoy" title="Ask about your account" sub="Chat with support if something doesn't look right." to="/help/chat" />
        </Card>
      </Block>
    </Page>
  );
}

/* ---------- Family Centre ---------- */

export function FamilyCentre() {
  const { me } = useMe();
  const email = LEGAL_DETAILS.contact_email ?? '';
  if (me.restricted) {
    return (
      <Page title="Under-14 account" intro="Your account is set up for members under 14. To help keep you safe on Community:">
        <MinorRules />
        <Notice icon="calendar">These rules come from the birthday you gave. They end on your 14th birthday by themselves. If your birthday is wrong, ask support to correct it.</Notice>
      </Page>
    );
  }
  return (
    <Page title="Under-14 accounts" intro="Community is for people aged 13 and over. Members who are 13 get extra protection until they turn 14, set from the birthday they give when they join.">
      <Block title="What changes for members under 14">
        <MinorRules you={false} />
      </Block>
      <Block title="For parents and guardians">
        <p className="st-text">
          Nobody under 13 can make an account: the app asks for a birthday first and turns them away. If you think a child under 13 is using Community, or that a birthday is wrong, email us at {isPlaceholder(email) ? email : <a href={'mailto:' + email}>{email}</a>} and we'll look into it.
        </p>
        <Card>
          <LinkRow icon="shield" title="Child safety" sub="How we protect children on Community and how to report a concern." to="/legal/child-safety" />
        </Card>
      </Block>
    </Page>
  );
}

/* ---------- About ---------- */

export function AboutPage() {
  return (
    <Page title="About">
      <AboutCommunity openDoc={(id) => nav('/legal/' + id)} />
    </Page>
  );
}

