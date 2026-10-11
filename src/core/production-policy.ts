import type { ProductionType } from './ai-budget-engine';

export const CONTENT_TYPES: readonly ProductionType[] = [
  'youtube_long', 'youtube_short', 'reel', 'social_post', 'carousel',
  'blog', 'image', 'email', 'audio', 'custom'
] as const;

export interface WebsiteContentPolicy {
  websiteId: string;
  organizationId: string;
  contentType: ProductionType;
  weeklyLimit: number;
  monthlyBudgetMinor: number;
  maximumJobCostMinor: number;
  enabled: boolean;
  autoPublish: boolean;
}

export function validateContentPolicy(input: WebsiteContentPolicy): WebsiteContentPolicy {
  if (!input.websiteId || !input.organizationId ||
      !CONTENT_TYPES.includes(input.contentType) ||
      ![input.weeklyLimit, input.monthlyBudgetMinor, input.maximumJobCostMinor]
        .every(n => Number.isSafeInteger(n) && n >= 0) ||
      typeof input.enabled !== 'boolean' || typeof input.autoPublish !== 'boolean') {
    throw new Error('INVALID_CONTENT_POLICY');
  }
  if (input.autoPublish && !input.enabled) throw new Error('AUTOPUBLISH_REQUIRES_ENABLED_POLICY');
  return { ...input };
}

export function defaultContentPolicies(websiteId: string, organizationId: string): WebsiteContentPolicy[] {
  if (!websiteId || !organizationId) throw new Error('INVALID_SCOPE');
  return CONTENT_TYPES.map(contentType => ({
    websiteId, organizationId, contentType,
    weeklyLimit: 0, monthlyBudgetMinor: 0, maximumJobCostMinor: 0,
    enabled: false, autoPublish: false
  }));
}

export function canQueueProduction(policy: WebsiteContentPolicy): boolean {
  return validateContentPolicy(policy).enabled && policy.weeklyLimit > 0 &&
    policy.monthlyBudgetMinor > 0 && policy.maximumJobCostMinor > 0;
}
