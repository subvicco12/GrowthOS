import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AuthPanel } from '../../app/auth-panel';
import { ConnectorsPanel } from '../../app/connectors-panel';
import { WebsiteBudgetPanel } from '../../app/website-budget-panel';
import { OrganizationDashboard } from '../../app/organization-dashboard';

test('login component does not offer public registration', () => {
  const html = renderToStaticMarkup(createElement(AuthPanel, { onAuthenticated: () => {} }));
  assert.match(html, /password/i);
  assert.doesNotMatch(html, /create account|sign up/i);
});

test('connector component does not claim live health', () => {
  const html = renderToStaticMarkup(createElement(ConnectorsPanel));
  assert.match(html, /unavailable/i);
  assert.doesNotMatch(html, /connected|healthy/i);
});

test('budget component labels configured minor units without inventing a currency', () => {
  const html = renderToStaticMarkup(createElement(WebsiteBudgetPanel, { rows: [{ websiteId: 'synthetic', domain: 'example.invalid', status: 'draft', verified: false, enabledContentTypes: 0, weeklyUnits: 0, configuredMonthlyMinor: 1234 }] }));
  assert.match(html, /1,234 minor units \(currency unavailable\)/);
  assert.doesNotMatch(html, /\$12\.34/);
});

test('portfolio starts with an honest loading state', () => {
  const html = renderToStaticMarkup(createElement(OrganizationDashboard));
  assert.match(html, /Loading workspace overview/);
  assert.doesNotMatch(html, /Registered websites:/);
});
