export interface ProductProfile {
 category:string;
 useCases:string[];
 customerTypes:string[];
 featureKeys:string[];
}

export interface CompetitorCandidate {
 name:string;
 domain:string;
 category:string;
 useCases:string[];
 customerTypes:string[];
 featureKeys:string[];
 evidenceUrl:string;
}

export interface ScoredCompetitor extends CompetitorCandidate {
 similarity:number;
 reasons:string[];
}

const overlap=(a:string[],b:string[])=>{
 const A=new Set(a.map(x=>x.toLowerCase()));
 const B=new Set(b.map(x=>x.toLowerCase()));
 if(!A.size||!B.size)return 0;
 let hits=0;for(const x of A)if(B.has(x))hits++;
 return hits/Math.max(A.size,B.size);
};

export function scoreCompetitor(profile:ProductProfile,candidate:CompetitorCandidate):ScoredCompetitor{
 const category=profile.category.toLowerCase()===candidate.category.toLowerCase()?1:0;
 const useCases=overlap(profile.useCases,candidate.useCases);
 const customers=overlap(profile.customerTypes,candidate.customerTypes);
 const features=overlap(profile.featureKeys,candidate.featureKeys);
 const similarity=Math.round((category*.30+useCases*.25+customers*.20+features*.25)*100)/100;
 const reasons:string[]=[];
 if(category)reasons.push('same category');
 if(useCases>0)reasons.push('use-case overlap');
 if(customers>0)reasons.push('customer overlap');
 if(features>0)reasons.push('feature overlap');
 return {...candidate,similarity,reasons};
}

export function selectComparableCompetitors(profile:ProductProfile,candidates:CompetitorCandidate[],minimumSimilarity=.5):ScoredCompetitor[]{
 return candidates.map(c=>scoreCompetitor(profile,c)).filter(c=>c.similarity>=minimumSimilarity).sort((a,b)=>b.similarity-a.similarity||a.domain.localeCompare(b.domain));
}
