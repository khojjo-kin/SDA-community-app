// Community for desktop. Start-up: sign in with Clerk, load (or create) the Community profile,
// then the app with Instagram's desktop layout.
import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { getProfile } from 'shared/api';
import { errText } from 'shared/theme';
import type { Profile } from 'shared/types';
import './app.css';
import { AuthProvider, useAuth } from './lib/auth';
import { MeProvider, useMe } from './lib/me';
import { nav, parts, useRoute } from './lib/router';
import { applyAppearance } from './lib/appearance';
import { touchSession } from './lib/admin';
import { CallProvider } from 'shared/calls';
import { Deactivated, Login, Onboarding, Suspended } from './screens/entry';
import { Explore, Home, PeopleToFollow } from './screens/browse';
import { Shorts } from './screens/shorts';
import { Messages } from './screens/messages';
import { Activity, Churches, Groups, Hymnal, Settings } from './screens/more';
import { Archive, Help } from './screens/account';
import { Dashboard } from './screens/dashboard';
import { Plus } from './screens/plus';
import { Verify } from './screens/verify';
import { FundraiserPage } from './screens/fundraiser';
import { Legal } from './screens/legal';
import { GoLive } from './screens/golive';
import { Admin } from './screens/admin';
import { Bible, Pod, SabbathSchool } from './screens/church';
import { LiveViewer } from './screens/live';
import { ProfilePage } from './screens/profile';
import { AnnouncementBar } from './ui/announce';
import { CreateDialog } from './ui/create';
import { MessagesDock } from './ui/dock';
import { Empty, GlobalLayer, Spinner } from './ui/kit';
import { PayLayer } from './ui/paysheet';
import { PlayerProvider } from './ui/player';
import { PostView } from './ui/post';
import { type CreateMode, type Panel, Sidebar, Wordmark } from './ui/sidebar';

declare const __DEMO__: boolean;

function Boot() {
  const auth = useAuth();
  const [profile, setProfile] = useState<Profile | null | undefined>(undefined);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    if (!auth.user) return;
    setError('');
    setProfile(undefined);
    getProfile(auth.user.id).then(setProfile, (e) => setError(errText(e)));
  }, [auth.user?.id]);
  useEffect(load, [load]);

  if (!auth.ready) return <Splash />;
  if (!auth.user) return <Login />;
  if (error) {
    return (
      <main className="onboard">
        <div className="login-card">
          <Wordmark />
          <h2>Can't reach your account</h2>
          <p className="muted-text">{error}</p>
          <button className="btn block" onClick={load}>
            Try again
          </button>
          <button className="link-btn" onClick={() => auth.signOut()}>
            Log out
          </button>
        </div>
      </main>
    );
  }
  if (profile === undefined) return <Splash />;
  if (profile === null) return <Onboarding onDone={load} />;
  if (profile.deleted_at) return <Deactivated profile={profile} onRestored={load} />;
  if (profile.suspended) return <Suspended />;
  return (
    <MeProvider profile={profile} key={profile.id}>
      {/* The same call code as the iPhone app: calls ring here wherever you are in the app. */}
      <CallProvider>
        <PlayerProvider>
          <Shell />
        </PlayerProvider>
      </CallProvider>
    </MeProvider>
  );
}

function Splash() {
  return (
    <div className="splash">
      <Spinner size={34} />
    </div>
  );
}

function Shell() {
  const { me } = useMe();
  const route = useRoute();
  const [panel, setPanel] = useState<Panel>(null);
  const [post, setPost] = useState<string | null>(null);
  const [create, setCreate] = useState<'post' | 'story' | 'short' | null>(null);
  const seg = parts(route);

  useEffect(() => {
    setPanel(null);
    setPost(null);
    window.scrollTo(0, 0);
  }, [route]);
  // Keyboard: Cmd/Ctrl+N new post, Cmd/Ctrl+K search.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 'n') {
        e.preventDefault();
        setCreate('post');
      }
      if (e.key === 'k') {
        e.preventDefault();
        try {
          sessionStorage.setItem('community.focusSearch', '1');
        } catch {
          // focus by event instead
        }
        nav('/explore');
        window.dispatchEvent(new Event('community:search'));
      }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, []);

  // Note this sign-in (app, address, country, time zone) for the admin console's security view.
  // If the address is blocked the database suspends the account, and the reload shows that.
  useEffect(() => {
    touchSession().then((r) => {
      if (r.blocked) location.reload();
    });
  }, []);

  const onCreate = (mode: CreateMode) => {
    if (mode === 'live') nav('/live/new');
    else if (mode === 'ad') nav('/dashboard/ads');
    else setCreate(mode);
  };

  const openPost = (id: string) => setPost(id);
  let screen: React.ReactNode;
  switch (seg[0]) {
    case undefined:
      screen = <Home openPost={openPost} onCreate={onCreate} />;
      break;
    case 'explore':
      screen = seg[1] === 'people' ? <PeopleToFollow /> : <Explore openPost={openPost} />;
      break;
    case 'shorts':
    case 'reels':
      screen = <Shorts openPost={openPost} />;
      break;
    case 'direct':
      screen = <Messages path={route} openPost={openPost} />;
      break;
    case 'u':
      screen = <ProfilePage username={seg[1] ?? me.username} tab={(['reels', 'shorts', 'saved', 'reposts', 'tagged'].includes(seg[2]) ? (seg[2] === 'shorts' ? 'reels' : seg[2]) : 'posts') as any} openPost={openPost} onCreate={onCreate as any} />;
      break;
    case 'p':
      screen = <PostView id={seg[1]} asPage onClose={() => nav('/')} />;
      break;
    case 'accounts':
      screen = <Settings path={route} />;
      break;
    case 'activity':
      screen = <Activity openPost={openPost} />;
      break;
    case 'hymnal':
      screen = <Hymnal number={seg[1]} />;
      break;
    case 'churches':
      screen = <Churches id={seg[1]} />;
      break;
    case 'groups':
      screen = <Groups id={seg[1]} openPost={openPost} />;
      break;
    case 'bible':
      screen = <Bible book={seg[1]} chapter={seg[2]} />;
      break;
    case 'lessons':
      screen = <SabbathSchool />;
      break;
    case 'pod':
      screen = <Pod />;
      break;
    case 'live':
      screen = seg[1] === 'new' ? <GoLive /> : <LiveViewer id={seg[1]} />;
      break;
    case 'dashboard':
      screen = <Dashboard path={route} />;
      break;
    case 'fundraisers':
      screen = <FundraiserPage id={seg[1]} />;
      break;
    case 'archive':
      screen = <Archive />;
      break;
    case 'plus':
      screen = <Plus />;
      break;
    case 'verify':
      screen = <Verify />;
      break;
    case 'help':
      screen = <Help />;
      break;
    case 'legal':
      screen = <Legal doc={seg[1] ?? 'privacy'} />;
      break;
    case 'admin':
      screen = <Admin path={route} />;
      break;
    default:
      screen = <Empty icon="compass" title="Sorry, this page isn't available." body="The link you followed may be broken, or the page may have been removed." />;
  }

  return (
    <div className={'shell' + (['direct', 'live'].includes(seg[0]) ? ' is-direct' : '') + (['shorts', 'reels'].includes(seg[0]) ? ' is-reels' : '')}>
      {__DEMO__ ? <div className="demo-banner">Demo: sample people and photos. Nothing you do here is saved.</div> : null}
      <Sidebar panel={panel} setPanel={setPanel} onCreate={onCreate} />
      <main className="main">
        {seg[0] !== 'admin' ? <AnnouncementBar /> : null}
        {screen}
      </main>
      <MessagesDock />
      {post ? <PostView id={post} onClose={() => setPost(null)} /> : null}
      {create ? <CreateDialog start={create === 'short' ? 'post' : create} onClose={() => setCreate(null)} /> : null}
      <PayLayer />
    </div>
  );
}

applyAppearance();

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <Boot />
    <GlobalLayer />
  </AuthProvider>,
);
