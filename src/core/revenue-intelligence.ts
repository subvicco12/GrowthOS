export interface RevenueEvent { siteId:string; source:string; visitors:number; conversions:number; revenueUsd:number; }
export interface RevenueSummary { siteId:string; visitors:number; conversions:number; revenueUsd:number; conversionRate:number; revenuePerVisitor:number; }
export function summarizeRevenue(events:RevenueEvent[]):RevenueSummary[]{
 const map=new Map<string,RevenueSummary>();
 for(const e of events){
  const row=map.get(e.siteId)??{siteId:e.siteId,visitors:0,conversions:0,revenueUsd:0,conversionRate:0,revenuePerVisitor:0};
  row.visitors+=Math.max(0,e.visitors);row.conversions+=Math.max(0,e.conversions);row.revenueUsd+=Math.max(0,e.revenueUsd);map.set(e.siteId,row);
 }
 for(const row of map.values()){row.conversionRate=row.visitors?row.conversions/row.visitors:0;row.revenuePerVisitor=row.visitors?row.revenueUsd/row.visitors:0;}
 return [...map.values()];
}
