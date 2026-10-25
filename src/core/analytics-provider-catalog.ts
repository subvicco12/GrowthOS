export type ProviderKind='ga4'|'search-console'|'youtube-analytics'|'website-analytics'|'advertising'|'affiliate'|'subscription';
export const providerCapabilities:Record<ProviderKind,readonly string[]>={
  'ga4':['analytics.readonly'],'search-console':['webmasters.readonly'],'youtube-analytics':['yt-analytics.readonly'],
  'website-analytics':['analytics.readonly'],'advertising':['ads.readonly'],'affiliate':['affiliate.readonly'],'subscription':['subscriptions.readonly']
};
