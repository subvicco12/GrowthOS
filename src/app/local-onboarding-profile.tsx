'use client';
import {prepareOnboardingProfile,type OnboardingProfile} from '../core/local-onboarding-profile';
import {onboardingReadiness,type WebsiteSummary} from '../core/workspace-journey';
export function LocalOnboardingProfile({site,organizationId,profile,onChange,canEdit}:{site:WebsiteSummary;organizationId:string;profile:OnboardingProfile;onChange:(next:OnboardingProfile)=>void;canEdit:boolean}){
 let result:ReturnType<typeof prepareOnboardingProfile>|null=null;
 try{result=prepareOnboardingProfile(profile,{organizationId,websiteId:site.id,domain:site.domain});}catch{result=null;}
 function change<K extends keyof OnboardingProfile>(key:K,value:OnboardingProfile[K]){onChange({...profile,[key]:value});}
 return <div className="onboardingProfile" aria-label="Local website onboarding preparation"><h4>Website profile · unsaved local preview</h4>
  <p>Canonical domain: {site.domain}. This profile does not verify ownership or update website settings.</p>{!canEdit&&<p>Read-only role: local profile editing unavailable.</p>}
  {(['name','category','businessObjective','targetMarket'] as const).map(key=><label key={key}>{key.replaceAll(/([A-Z])/g,' $1')}<input value={profile[key]} disabled={!canEdit} maxLength={200} onChange={e=>change(key,e.target.value)}/></label>)}
  <label>Subscription model<select value={profile.subscriptionModel} disabled={!canEdit} onChange={e=>change('subscriptionModel',e.target.value as OnboardingProfile['subscriptionModel'])}>
    {['unknown','free','free-pro-business','subscription','none'].map(x=><option key={x}>{x}</option>)}</select></label>
  <label>Monetization model<select value={profile.monetizationModel} disabled={!canEdit} onChange={e=>change('monetizationModel',e.target.value as OnboardingProfile['monetizationModel'])}>
    {['unknown','subscription','advertising','affiliate','lead-generation','product-sales','mixed','none'].map(x=><option key={x}>{x}</option>)}</select></label>
  <div role="status">{result?.completeForLocalPlanning?'Profile prepared locally; ownership and activation remain unverified.':'Missing local profile fields: '+(result?.missing.join(', ')??'Invalid profile input')}.</div>
  <ul>{onboardingReadiness(site).checks.map(c=><li key={c.name}>{c.name}: {c.state}</li>)}</ul>
  <p>Next: manual feature inventory → competitor research → intelligence preview → separately certified connector and budget authority.</p>
 </div>;
}
