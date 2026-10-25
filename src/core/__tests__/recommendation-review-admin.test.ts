import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { RecommendationReviewPanel } from '../../app/recommendation-review-panel';

test('first-party review workspace presents loading, scoped filters and unavailable-safe controls',()=>{
 const html=renderToStaticMarkup(createElement(RecommendationReviewPanel));
 assert.match(html,/Recommendation review/);
 assert.match(html,/Loading websites/);
 assert.match(html,/id="review-site"[^>]*disabled/);
 assert.match(html,/id="review-category"/);
 assert.match(html,/id="review-state"/);
 assert.doesNotMatch(html,/Accept for planning/);
});
