// The Professional dashboard, laid out like Instagram's 2026 one: pill tabs for Insights (a menu of
// Overview, Content, Audience and Income), Ad tools and Fundraisers, then the chosen tab.
//   /dashboard, /dashboard/content, /dashboard/audience, /dashboard/income   Insights
//   /dashboard/ads, /dashboard/billing                                         Ad tools
//   /dashboard/fundraisers                                                     Fundraisers
import React, { useState } from 'react';
import { nav, parts } from '../lib/router';
import { Billing, AdTools } from './pro-ads';
import { Insights, type Section, SECTIONS, useStats } from './pro-insights';
import { Dropdown } from './pro-kit';
import { FundraisersTab } from './pro-money';

export function Dashboard({ path }: { path?: string }) {
  const sub = parts(path ?? '/dashboard')[1] ?? '';
  const tab = sub === 'ads' || sub === 'billing' ? 'ads' : sub === 'fundraisers' ? 'fundraisers' : 'insights';
  const section: Section = (SECTIONS.find((s) => s.value === sub)?.value ?? 'overview') as Section;
  // The period stays chosen while moving between the parts of Insights.
  const [days, setDays] = useState(30);
  const stats = useStats(days);

  return (
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
      </nav>
      <hr className="pro-rule" />
      {tab === 'insights' ? <Insights section={section} days={days} setDays={setDays} stats={stats} /> : tab === 'fundraisers' ? <FundraisersTab /> : sub === 'billing' ? <Billing /> : <AdTools />}
    </div>
  );
}
