/** Deterministic domain contract. No provider calls, queue dispatch or publication occur here. */
export type ContentStage = 'proposed' | 'researched' | 'drafted' | 'review_required' |
  'quality_passed' | 'approved' | 'scheduled' | 'publication_unknown' | 'published' | 'attributed' | 'cancelled';
export type ContentRole = 'owner' | 'admin' | 'editor' | 'viewer';
export interface SourceEvidence { url: string; observedAt: string; claim: string }
export interface QualityEvidence {
  factual: boolean; original: boolean; rightsCleared: boolean; disclosureChecked: boolean;
  ymylReviewed: boolean; notes: string;
}
export interface ContentRecord {
  id: string; organizationId: string; websiteId: string; contentType: string;
  stage: ContentStage; version: number; eventIds: readonly string[];
  sources: readonly SourceEvidence[]; draft?: string; quality?: QualityEvidence;
  approval?: { actorId: string; at: string }; schedule?: { channel: string; at: string };
  publication?: { providerId: string; url: string; observedAt: string };
  /** Factory approval binds the reviewed research/brief/draft; absent on legacy records. */
  factoryReviewDigest?: string;
  attribution?: { source: string; observedAt: string; conversions: number };
}
type Base = { eventId: string; at: string };
export type ContentEvent = Base & (
  { kind: 'research'; sources: SourceEvidence[] } |
  { kind: 'draft'; text: string } |
  { kind: 'quality'; evidence: QualityEvidence; regulated: boolean } |
  { kind: 'approve' } |
  { kind: 'schedule'; channel: string; publishAt: string } |
  { kind: 'publication_unknown' } |
  { kind: 'confirm_publication'; providerId: string; url: string; observedAt: string } |
  { kind: 'attribute'; source: string; observedAt: string; conversions: number } |
  { kind: 'cancel' }
);
export interface ContentActor { userId: string; organizationId: string; websiteId: string; role: ContentRole; trustedProviderEvidence?: boolean }
const validTime = (value: string) => /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
const https = (value: string) => { try { const url = new URL(value); return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password; } catch { return false; } };
const requireCondition = (condition: unknown, code: string): void => { if (!condition) throw new Error(code); };

export function createContentRecord(input: { id: string; organizationId: string; websiteId: string; contentType: string }): ContentRecord {
  requireCondition([input.id, input.organizationId, input.websiteId, input.contentType].every(x => typeof x === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(x)), 'INVALID_CONTENT_SCOPE');
  return { ...input, stage: 'proposed', version: 0, eventIds: [], sources: [] };
}

export function transitionContent(record: ContentRecord, event: ContentEvent, actor: ContentActor): ContentRecord {
  requireCondition(actor.userId && actor.organizationId === record.organizationId && actor.websiteId === record.websiteId, 'CONTENT_SCOPE_DENIED');
  requireCondition(['owner','admin','editor'].includes(actor.role), 'CONTENT_ROLE_DENIED');
  requireCondition(typeof event.eventId === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(event.eventId) && !record.eventIds.includes(event.eventId) && validTime(event.at), 'INVALID_CONTENT_EVENT');
  const advance = (stage: ContentStage, changes: Partial<ContentRecord> = {}): ContentRecord => ({ ...record, ...changes, stage, version: record.version + 1, eventIds: [...record.eventIds, event.eventId] });
  switch (event.kind) {
    case 'research':
      requireCondition(record.stage === 'proposed' && Array.isArray(event.sources) && event.sources.length > 0 && event.sources.length <= 30 &&
        event.sources.every(s => s && https(s.url) && validTime(s.observedAt) && typeof s.claim === 'string' && s.claim.trim().length > 0 && s.claim.length <= 1000), 'SOURCE_EVIDENCE_REQUIRED');
      return advance('researched', { sources: event.sources.map(s => ({ ...s })) });
    case 'draft':
      requireCondition(record.stage === 'researched' && typeof event.text === 'string' && event.text.trim().length >= 20 && event.text.length <= 50000, 'DRAFT_REQUIRED');
      return advance('drafted', { draft: event.text });
    case 'quality': {
      requireCondition(record.stage === 'drafted' || record.stage === 'review_required', 'INVALID_CONTENT_TRANSITION');
      const e = event.evidence;
      requireCondition(e && typeof e.notes === 'string' && e.notes.length <= 2000 &&
        [e.factual,e.original,e.rightsCleared,e.disclosureChecked,e.ymylReviewed].every(v => typeof v === 'boolean') && typeof event.regulated === 'boolean', 'INVALID_QUALITY_EVIDENCE');
      const passed = e.factual && e.original && e.rightsCleared && e.disclosureChecked && (!event.regulated || e.ymylReviewed);
      return advance(passed ? 'quality_passed' : 'review_required', { quality: { ...e } });
    }
    case 'approve':
      requireCondition(record.stage === 'quality_passed' && ['owner','admin','editor'].includes(actor.role), 'APPROVAL_REQUIRED');
      return advance('approved', { approval: { actorId: actor.userId, at: event.at } });
    case 'schedule':
      requireCondition(record.stage === 'approved' && typeof event.channel === 'string' && event.channel.trim() && event.channel.length <= 80 &&
        validTime(event.publishAt) && Date.parse(event.publishAt) > Date.parse(event.at), 'INVALID_SCHEDULE');
      return advance('scheduled', { schedule: { channel: event.channel, at: event.publishAt } });
    case 'publication_unknown':
      requireCondition(record.stage === 'scheduled', 'INVALID_CONTENT_TRANSITION');
      return advance('publication_unknown');
    case 'confirm_publication':
      requireCondition(actor.trustedProviderEvidence === true && ['scheduled','publication_unknown'].includes(record.stage) && typeof event.providerId === 'string' && event.providerId.trim() &&
        event.providerId.length <= 200 && https(event.url) && validTime(event.observedAt), 'PUBLICATION_EVIDENCE_REQUIRED');
      return advance('published', { publication: { providerId: event.providerId, url: event.url, observedAt: event.observedAt } });
    case 'attribute':
      requireCondition(record.stage === 'published' && typeof event.source === 'string' && event.source.trim() && validTime(event.observedAt) &&
        Number.isSafeInteger(event.conversions) && event.conversions >= 0, 'ATTRIBUTION_EVIDENCE_REQUIRED');
      return advance('attributed', { attribution: { source: event.source, observedAt: event.observedAt, conversions: event.conversions } });
    case 'cancel':
      requireCondition(['proposed','researched','drafted','review_required','quality_passed','approved','scheduled'].includes(record.stage), 'CANCELLATION_REQUIRES_STATUS_CHECK');
      return advance('cancelled');
  }
}

/** Production adapters must implement compare-and-swap under a tenant-scoped transaction. */
export interface ContentMutationEvidence { event: ContentEvent; actor: ContentActor }
export interface ContentStore {
  update(organizationId: string, websiteId: string, recordId: string, version: number,
    apply: (current: ContentRecord) => ContentRecord, evidence?: ContentMutationEvidence): Promise<ContentRecord>;
}
export async function applyContentEvent(store: ContentStore, recordId: string, version: number, event: ContentEvent, actor: ContentActor): Promise<ContentRecord> {
  requireCondition(actor.organizationId && actor.websiteId && actor.userId, 'CONTENT_SCOPE_DENIED');
  return store.update(actor.organizationId, actor.websiteId, recordId, version, current => transitionContent(current, event, actor), { event, actor });
}
