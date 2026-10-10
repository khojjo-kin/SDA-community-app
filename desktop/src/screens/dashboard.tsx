// The Professional dashboard, laid out like Instagram's 2026 one: pill tabs for Insights (a menu of
// Overview, Content, Audience and Income), Ad tools, Fundraisers and Your tools (a menu of
// Inspiration and Best practices, as on the iPhone's dashboard), then the chosen tab.
//   /dashboard, /dashboard/content, /dashboard/audience, /dashboard/income   Insights
//   /dashboard/ads, /dashboard/billing                                         Ad tools
//   /dashboard/fundraisers                                                     Fundraisers
//   /dashboard/inspiration, /dashboard/best-practices                         Your tools
import React, { useEffect, useState } from 'react';
import { nav, parts } from '../lib/router';
import { PostView } from '../ui/post';
import { Billing, AdTools } from './pro-ads';
import { Insights, type Section, SECTIONS, useStats } from './pro-insights';
import { Dropdown, type OpenPost, OpenPostContext } from './pro-kit';
import { FundraisersTab } from './pro-money';
import { BestPractices, Inspiration } from './pro-tools';

const TOOLS = [
  { value: 'inspiration', label: 'Inspiration', hint: "Other people's most liked posts", path: '/dashboard/inspiration' },
  { value: 'best-practices', label: 'Best practices', hint: 'Tips for growing your account', path: '/dashboard/best-practices' },
  { value: 'creator', label: 'Saved replies and questions', hint: 'Creator tools and controls in Settings', path: '/accounts/creator' },
];

/** The post dialog with previous and next arrows, as main.tsx's (it takes the list and onOpen). */
const PostDialog = PostView as unknown as React.ComponentType<{ id: string; list?: string[]; onOpen?: (id: string) => void; onClose: () => void }>;

export function Dashboard({ path, openPost }: { path?: string; openPost?: OpenPost }) {
  const sub = parts(path ?? '/dashboard')[1] ?? '';
  const tool = TOOLS.find((t) => t.value === sub && t.path.startsWith('/dashboard'))?.value;
  const tab = sub === 'ads' || sub === 'billing' ? 'ads' : sub === 'fundraisers' ? 'fundraisers' : tool ? 'tools' : 'insights';
  const section: Section = (SECTIONS.find((s) => s.value === sub)?.value ?? 'overview') as Section;
  // The period stays chosen while moving between the parts of Insights.
  const [days, setDays] = useState(30);
  const stats = useStats(days);
  // Posts open in the app's post dialog when main.tsx passes openPost, otherwise in one of our own.
  const [post, setPost] = useState<{ id: string; list?: string[] } | null>(null);
  const open: OpenPost = openPost ?? ((id, list) => setPost({ id, list }));
  // Moving to another part of the dashboard closes the dialog, as moving page does in main.tsx.
  useEffect(() => setPost(null), [path]);

  let body: React.ReactNode;
  if (tab === 'insights') body = <Insights section={section} days={days} setDays={setDays} stats={stats} />;
  else if (tab === 'fundraisers') body = <FundraisersTab />;
  else if (tab === 'tools') body = tool === 'best-practices' ? <BestPractices /> : <Inspiration />;
  else body = sub === 'billing' ? <Billing /> : <AdTools />;

  return (
    <OpenPostContext.Provider value={open}>
      <div className="page pro-page">
        <h1 className="pro-title">Professional dashboard</h1>
        <nav className="pro-tabs" aria-label="Professional dashboard">
          <Dropdown
            label="Insights"
            active={tab === 'insights'}
            tip={tab === 'insights' ? undefined : 'See how your content is performing.'}
            items={SECTIONS.map((s) => ({ value: s.value, label: s.label }))}
            value={tab === 'insights' ? section : undefined}
            onChange={(v) => nav(SECTIONS.find((s) => s.value === v)!.path)}
            menuLabel="Insights"
          />
          <button className={'pro-pill' + (tab === 'ads' ? ' on' : '')} aria-current={tab === 'ads' ? 'page' : undefined} onClick={() => nav('/dashboard/ads')}>
            Ad tools
          </button>
          <button className={'pro-pill' + (tab === 'fundraisers' ? ' on' : '')} aria-current={tab === 'fundraisers' ? 'page' : undefined} onClick={() => nav('/dashboard/fundraisers')}>
            Fundraisers
          </button>
          <Dropdown
            label="Your tools"
            active={tab === 'tools'}
            tip={tab === 'tools' ? undefined : 'Ideas and tips for creators.'}
            items={TOOLS.map((t) => ({ value: t.value, label: t.label, hint: t.hint }))}
            value={tool}
            onChange={(v) => nav(TOOLS.find((t) => t.value === v)!.path)}
            menuLabel="Your tools"
          />
        </nav>
        <hr className="pro-rule" />
        {body}
      </div>
      {post ? <PostDialog id={post.id} list={post.list} onOpen={(id) => setPost({ id, list: post.list })} onClose={() => setPost(null)} /> : null}
    </OpenPostContext.Provider>
  );
}
