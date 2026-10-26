import {z} from 'zod';
const text=z.string().trim().max(200).refine(v=>!/[<>\u0000-\u001f]/.test(v));
export const onboardingProfileSchema=z.object({organizationId:z.string().min(1),websiteId:z.string().min(1),canonicalDomain:z.string().min(1).max(253),
 name:text,category:text,businessObjective:text,targetMarket:text,subscriptionModel:z.enum(['unknown','free','free-pro-business','subscription','none']),
 monetizationModel:z.enum(['unknown','subscription','advertising','affiliate','lead-generation','product-sales','mixed','none']),
 authority:z.literal('local-preview-only')}).strict();
export type OnboardingProfile=z.infer<typeof onboardingProfileSchema>;
export function prepareOnboardingProfile(raw:unknown,scope:{organizationId:string;websiteId:string;domain:string}){
 const p=onboardingProfileSchema.parse(raw);
 if(p.organizationId!==scope.organizationId||p.websiteId!==scope.websiteId||p.canonicalDomain!==scope.domain)throw Error('ONBOARDING_SCOPE_DENIED');
 const missing=[...(!p.name?['Website name']:[]),...(!p.category?['Category']:[]),...(!p.businessObjective?['Business objective']:[]),
  ...(!p.targetMarket?['Target market']:[]),...(p.subscriptionModel==='unknown'?['Subscription model']:[]),
  ...(p.monetizationModel==='unknown'?['Monetization model']:[])];
 return {profile:p,missing,completeForLocalPlanning:missing.length===0,verified:false,activation:'disabled' as const};
}

export const emptyOnboardingProfile=(scope:{organizationId:string;websiteId:string;domain:string}):OnboardingProfile=>({organizationId:scope.organizationId,websiteId:scope.websiteId,canonicalDomain:scope.domain,name:'',category:'',businessObjective:'',targetMarket:'',subscriptionModel:'unknown',monetizationModel:'unknown',authority:'local-preview-only'});
