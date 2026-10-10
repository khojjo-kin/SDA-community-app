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
import { Deactivated, Login, Onboarding, Suspended } from './screens/entry';
import { AnnouncementBar } from './ui/announce';
import { touchSession } from './lib/admin';
import { Explore, Home, PeopleToFollow, Reels } from './screens/browse';
import { Messages } from './screens/messages';
import { Activity, Churches, Groups, Hymnal, Settings } from './screens/more';
import { Archive, Dashboard, Help, Plus } from './screens/account';
import { Admin } from './screens/admin';
import { Bible, Pod, SabbathSchool } from './screens/church';
import { LiveViewer } from './screens/live';
import { CallProvider } from 'shared/calls';
import { PlayerProvider } from './ui/player';
import { ProfilePage } from './screens/profile';
import { CreateDialog } from './ui/create';
import { Empty, GlobalLayer, Spinner } from './ui/kit';
import { PostView } from './ui/post';
import { Sidebar, type Panel, Wordmark } from './ui/sidebar';

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
  const [create, setCreate] = useState<'post' | 'story' | null>(null);
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
        setPanel('search');
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

  const openPost = (id: string) => setPost(id);
  let screen: React.ReactNode;
  switch (seg[0]) {
    case undefined:
      screen = <Home openPost={openPost} onCreate={setCreate} />;
      break;
    case 'explore':
      screen = seg[1] === 'people' ? <PeopleToFollow /> : <Explore openPost={openPost} />;
      break;
    case 'reels':
      screen = <Reels openPost={openPost} />;
      break;
    case 'direct':
      screen = <Messages path={route} openPost={openPost} />;
      break;
    case 'u':
      screen = <ProfilePage username={seg[1] ?? me.username} tab={(['reels', 'saved', 'reposts'].includes(seg[2]) ? seg[2] : 'posts') as any} openPost={openPost} onCreate={setCreate} />;
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
      screen = <LiveViewer id={seg[1]} />;
      break;
    case 'dashboard':
      screen = <Dashboard />;
      break;
    case 'archive':
      screen = <Archive />;
      break;
    case 'plus':
      screen = <Plus />;
      break;
    case 'help':
      screen = <Help />;
      break;
    case 'admin':
      screen = <Admin path={route} />;
      break;
    default:
      screen = <Empty icon="compass" title="Sorry, this page isn't available." body="The link you followed may be broken, or the page may have been removed." />;
  }

  return (
    <div className={'shell' + (['direct', 'live'].includes(seg[0]) ? ' is-direct' : '') + (seg[0] === 'reels' ? ' is-reels' : '')}>
      {__DEMO__ ? <div className="demo-banner">Demo: sample people and photos. Nothing you do here is saved.</div> : null}
      <Sidebar panel={panel} setPanel={setPanel} onCreate={setCreate} />
      <main className="main">
        {seg[0] !== 'admin' ? <AnnouncementBar /> : null}
        {screen}
      </main>
      {post ? <PostView id={post} onClose={() => setPost(null)} /> : null}
      {create ? <CreateDialog start={create} onClose={() => setCreate(null)} /> : null}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <Boot />
    <GlobalLayer />
  </AuthProvider>,
);
