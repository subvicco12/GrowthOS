import {test} from 'node:test';import {strict as assert} from 'node:assert';import {readFileSync} from 'node:fs';
import {journeySteps,onboardingReadiness,requireSelectedWebsite,type WebsiteSummary} from '../workspace-journey';
import {prepareOnboardingProfile,type OnboardingProfile} from '../local-onboarding-profile';
const site:WebsiteSummary={id:'site-a',domain:'example.com',platform:'wordpress',status:'draft',verifiedAt:null,automationEnabled:false,autoPublishEnabled:false,monthlyBudgetMinor:'0'};
const scope={organizationId:'org-a',websiteId:'site-a',domain:'example.com'};
const profile:OnboardingProfile={organizationId:'org-a',websiteId:'site-a',canonicalDomain:'example.com',name:'Example',category:'Calculators',businessObjective:'Help visitors estimate cost',targetMarket:'United States',subscriptionModel:'free-pro-business',monetizationModel:'mixed',authority:'local-preview-only'};
test('website selection and onboarding status use explicit registry evidence',()=>{
 assert.equal(requireSelectedWebsite({organizationId:'org-a',websites:[site]},site.id),site);
 assert.throws(()=>requireSelectedWebsite({organizationId:'org-a',websites:[site]},'site-b'),/WEBSITE_DENIED/);
 assert.throws(()=>requireSelectedWebsite({organizationId:'',websites:[site]},site.id),/SCOPE_UNAVAILABLE/);
 const states=onboardingReadiness(site);assert.equal(states.checks.find(c=>c.name==='Publishing')?.state,'disabled');assert.equal(states.checks.find(c=>c.name==='Analytics connector')?.state,'unavailable');
 assert.equal(states.checks.find(c=>c.name==='Ownership verification')?.state,'unavailable');
});
test('local profile cannot assert verification, activation or another website scope',()=>{
 const p=prepareOnboardingProfile(profile,scope);assert.equal(p.completeForLocalPlanning,true);assert.equal(p.verified,false);assert.equal(p.activation,'disabled');
 assert.throws(()=>prepareOnboardingProfile(profile,{...scope,websiteId:'site-b'}),/SCOPE_DENIED/);
 assert.throws(()=>prepareOnboardingProfile({...profile,authority:'verified'},scope));
 assert.throws(()=>prepareOnboardingProfile({...profile,name:'<script>alert(1)</script>'},scope));
 assert.deepEqual(prepareOnboardingProfile({...profile,category:''},scope).missing,['Category']);
});
test('journey and responsive shell connect scoped modules without mutation shortcuts',()=>{
 const page=readFileSync('src/app/page.tsx','utf8'),css=readFileSync('src/app/globals.css','utf8');
 assert.ok(journeySteps.some(x=>x.section==='competitors'));assert.ok(journeySteps.some(x=>x.section==='analytics'));
 assert.match(page,/preferredWebsiteId=\{selectedWebsite\}/);assert.match(page,/requireSelectedWebsite\(websiteScope,id\)/);
 assert.match(page,/Switch website\? Unsaved local previews/);
 assert.match(page,/Other local workspaces will be cleared/);
 assert.match(page,/setCompetitorsVisited\(section==='competitors'\)/);
 assert.match(page,/setAnalyticsVisited\(section==='analytics'\)/);assert.match(css,/@media\(max-width:600px\).*\.workspaceSiteBar/);
 assert.match(css,/\.journeyGrid button\{min-height:44px;/);
});
