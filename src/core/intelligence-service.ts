import { discoverFeatureCandidates, type DiscoveredFeatureCandidate, type SitePageEvidence } from './feature-intelligence';
import { selectComparableCompetitors, type CompetitorCandidate, type ProductProfile, type ScoredCompetitor } from './competitor-discovery';
import { comparePackageSnapshots, type PackageComparisonRow, type SitePackageSnapshot } from './package-intelligence';

export interface IntelligenceRepository {
  saveDiscoveredFeatures(siteId:string,snapshotId:string,features:DiscoveredFeatureCandidate[]):Promise<void>;
  saveCompetitors(siteId:string,competitors:ScoredCompetitor[]):Promise<void>;
  savePackageComparison(siteId:string,competitorSnapshotIds:string[],rows:PackageComparisonRow[]):Promise<void>;
}

export interface FeatureDiscoveryResult {
  features:DiscoveredFeatureCandidate[];
  capturedAt:string;
}

export function discoverSiteFeatures(pages:SitePageEvidence[],capturedAt=new Date().toISOString()):FeatureDiscoveryResult {
  return {features:discoverFeatureCandidates(pages),capturedAt};
}

export function discoverComparableCompetitors(
 profile:ProductProfile,
 candidates:CompetitorCandidate[],
 minimumSimilarity=.5,
):ScoredCompetitor[] {
 return selectComparableCompetitors(profile,candidates,minimumSimilarity);
}

export function compareSitePackages(
 site:SitePackageSnapshot,
 competitors:SitePackageSnapshot[],
 featureNames:Record<string,string>,
):PackageComparisonRow[] {
 return comparePackageSnapshots(site,competitors,featureNames);
}

export async function persistFeatureDiscovery(
 repository:IntelligenceRepository,
 siteId:string,
 snapshotId:string,
 pages:SitePageEvidence[],
):Promise<FeatureDiscoveryResult> {
 const result=discoverSiteFeatures(pages);
 await repository.saveDiscoveredFeatures(siteId,snapshotId,result.features);
 return result;
}
