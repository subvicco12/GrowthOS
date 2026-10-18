'use client';
import * as React from 'react';
import { useState } from 'react';

export interface WebsiteBudgetRow {
  websiteId: string;
  domain: string;
  status: string;
  verified: boolean;
  enabledContentTypes: number;
  weeklyUnits: number;
  configuredMonthlyMinor: string;
  recordedCompletedMinor?: string;
  completedReservationCount?: number;
}
export function WebsiteBudgetPanel({ rows }: {
  rows: readonly WebsiteBudgetRow[];
}) {
  const [search, setSearch] = useState('');
  const filtered = rows.filter(row => row.domain.toLowerCase().includes(search.trim().toLowerCase()));
  return <section aria-labelledby="website-budget-heading" style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
    <h2 id="website-budget-heading">Website AI budgets</h2>
    <p>Read-only overview. Budget changes and production are unavailable until secure database integration is certified.</p>
    <label htmlFor="budget-search">Find a website</label>
    <input id="budget-search" value={search} onChange={event => setSearch(event.target.value)}
      placeholder="Search by domain" style={{ display: 'block', width: '100%', maxWidth: 480, padding: 12, margin: '8px 0 16px' }} />
    <div aria-live="polite">{filtered.length} website{filtered.length === 1 ? '' : 's'}</div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16, marginTop: 16 }}>
      {filtered.map(row => <article key={row.websiteId} style={{ border: '1px solid #9ca3af', borderRadius: 12, padding: 16, overflowWrap: 'anywhere' }}>
        <h3>{row.domain}</h3>
        <p>Status: {row.status}</p>
        <p>Verification: {row.verified ? 'Verified' : 'Not verified'}</p>
        <p>Enabled content types: {row.enabledContentTypes}</p>
        <p>Weekly capacity: {row.weeklyUnits}</p>
        <p>Configured monthly category budget total: {/^\d+$/.test(row.configuredMonthlyMinor) ? new Intl.NumberFormat('en').format(BigInt(row.configuredMonthlyMinor)) + ' minor units' : 'unavailable'} (currency unavailable)</p>
        <p>Recorded completed reservation cost this UTC month: {row.completedReservationCount ? `${row.recordedCompletedMinor} minor units across ${row.completedReservationCount} reservations` : 'No completed reservation costs recorded'}</p>
        <p>Provider billed spend and currency: unavailable</p>
      </article>)}
    </div>
    {filtered.length === 0 && <p>No websites match this search.</p>}
  </section>;
}
