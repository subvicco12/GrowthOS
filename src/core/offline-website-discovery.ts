/** Provider-independent, offline-only discovery. A production transport is intentionally absent. */
import { createHash } from 'node:crypto';

export type DiscoveryState = 'complete' | 'cancelled' | 'unavailable' | 'unknown';
export type DiscoveryPage = { url: string; status: number; observedAt: string; bodyHash: string; depth: number };
export type DiscoveryResult = { organizationId: string; websiteId: string; jobKey: string; state: DiscoveryState;
  pages: DiscoveryPage[]; warnings: string[] };
export type TransportResponse = { finalUrl: string; redirects: string[]; status: number; body: string; observedAt: string };
export interface SyntheticDiscoveryTransport {
  /** This interface takes relative paths only. It must not be wired to a live HTTP client. */
  read(path: string, signal: AbortSignal): Promise<TransportResponse>;
}
export interface DiscoveryAuthority {
  assertCurrent(input: { organizationId: string; websiteId: string; host: string; jobKey: string }): Promise<void>;
  claim(input: { organizationId: string; websiteId: string; jobKey: string }): Promise<'new' | 'duplicate'>;
  rateLimit(input: { organizationId: string; websiteId: string }): Promise<void>;
}
export type DiscoveryInput = { organizationId: string; websiteId: string; host: string; jobKey: string;
  maxPages: number; maxDepth: number; timeoutMs: number };

function safeUrl(raw: string, host: string): URL {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hostname.toLowerCase() !== host.toLowerCase() ||
    u.hash || u.search || /%2f|%5c|\\/i.test(raw)) throw Error('DISCOVERY_DESTINATION_DENIED');
  return u;
}
function safePath(path: string): string {
  if (!path.startsWith('/') || path.startsWith('//') || /[?#\\]|%2f|%5c/i.test(path)) throw Error('DISCOVERY_PATH_DENIED');
  return path;
}
function robotsAllowed(text: string, path: string): boolean {
  if (text.length > 32768) throw Error('ROBOTS_OVERSIZED');
  let applies = false; const rules: { prefix: string; allow: boolean }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const match = /^(user-agent|allow|disallow)\s*:\s*(.*)$/i.exec(line);
    if (!match) continue;
    const key = match[1].toLowerCase(), value = match[2].trim();
    if (key === 'user-agent') { applies = value === '*'; continue; }
    if (!applies || !value) continue;
    if (!value.startsWith('/') || /[?*\[\]$\\]/.test(value)) throw Error('ROBOTS_POLICY_UNSUPPORTED');
    rules.push({ prefix: value, allow: key === 'allow' });
  }
  const matching = rules.filter(rule => path.startsWith(rule.prefix)).sort((a,b) => b.prefix.length-a.prefix.length || Number(b.allow)-Number(a.allow));
  return matching[0]?.allow ?? true;
}
function sitemapPaths(xml: string, host: string): string[] {
  if (xml.length > 131072) throw Error('SITEMAP_OVERSIZED');
  if (/<!|<\?|&|<sitemapindex\b/i.test(xml) || !/^\s*<urlset(?:\s[^<>]*)?>[\s\S]*<\/urlset>\s*$/i.test(xml)) throw Error('SITEMAP_UNSUPPORTED');
  const stripped = xml.replace(/<loc>\s*https:\/\/[^<>\s]+\s*<\/loc>/gi,'').replace(/<\/?(?:url|urlset)(?:\s[^<>]*)?>/gi,'').trim();
  if (stripped) throw Error('SITEMAP_UNSUPPORTED');
  const paths: string[] = [];
  for (const match of xml.matchAll(/<loc>\s*(https:\/\/[^<>\s]+)\s*<\/loc>/gi)) {
    const u = safeUrl(match[1],host); paths.push(safePath(u.pathname));
    if (paths.length > 100) throw Error('SITEMAP_OVERSIZED');
  }
  return paths;
}
function within(ms: number, signal: AbortSignal): { signal: AbortSignal; close: () => void } {
  // AbortSignal.timeout uses an unref'ed timer on Node 22. A stalled provider
  // promise could otherwise leave no active handle and cancel the test/job.
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), ms);
  return { signal: AbortSignal.any([signal,timeout.signal]), close: () => clearTimeout(timer) };
}

/** Every authority check precedes transport use. No live transport implementation is provided. */
export async function discoverSyntheticWebsite(input: DiscoveryInput, authority: DiscoveryAuthority,
  transport: SyntheticDiscoveryTransport, signal: AbortSignal): Promise<DiscoveryResult> {
  if (!/^[a-z0-9.-]+$/i.test(input.host) || input.host.startsWith('.') || input.host.endsWith('.') ||
    !input.host.includes('.') || /(?:^|\.)(?:localhost|local|internal)$/i.test(input.host) ||
    /^\d+\.\d+\.\d+\.\d+$/.test(input.host) ||
    !/^[0-9a-f-]{36}$/i.test(input.organizationId) || !/^[0-9a-f-]{36}$/i.test(input.websiteId) ||
    !/^[a-z0-9_-]{8,100}$/i.test(input.jobKey) || !Number.isInteger(input.maxPages) || input.maxPages < 1 || input.maxPages > 20 ||
    !Number.isInteger(input.maxDepth) || input.maxDepth < 0 || input.maxDepth > 3 ||
    !Number.isInteger(input.timeoutMs) || input.timeoutMs < 100 || input.timeoutMs > 10000) throw Error('DISCOVERY_INPUT_DENIED');
  await authority.assertCurrent(input); // Owner verification, tenant membership and feature policy are external mandatory authorities.
  await authority.rateLimit(input);
  if (await authority.claim(input) !== 'new') throw Error('DISCOVERY_DUPLICATE_JOB');
  const deadline = within(input.timeoutMs,signal);
  const scoped = deadline.signal;
  const result: DiscoveryResult = { organizationId:input.organizationId,websiteId:input.websiteId,jobKey:input.jobKey,
    state:'unknown',pages:[],warnings:[] };
  const read = async(path:string) => {
    if (scoped.aborted) throw Error('DISCOVERY_ABORTED');
    let abort: (() => void) | undefined;
    const aborted = new Promise<never>((_,reject) => { abort = () => reject(Error('DISCOVERY_ABORTED'));
      scoped.addEventListener('abort',abort,{once:true}); });
    let response: TransportResponse;
    try { response = await Promise.race([transport.read(safePath(path),scoped),aborted]); }
    finally { if (abort) scoped.removeEventListener('abort',abort); }
    if (scoped.aborted) throw Error('DISCOVERY_ABORTED');
    if (response.redirects.length > 3 || response.body.length > 131072 || !Number.isInteger(response.status) ||
      response.status < 100 || response.status > 599 || !Number.isFinite(Date.parse(response.observedAt))) throw Error('DISCOVERY_RESPONSE_DENIED');
    for (const target of [...response.redirects,response.finalUrl]) safeUrl(target,input.host);
    safePath(new URL(response.finalUrl).pathname);
    return response;
  };
  try {
    const robots = await read('/robots.txt');
    if (robots.status !== 200) { result.state='unavailable';result.warnings.push('ROBOTS_UNAVAILABLE');return result; }
    const sitemap = await read('/sitemap.xml');
    if (sitemap.status !== 200) { result.state='unavailable';result.warnings.push('SITEMAP_UNAVAILABLE');return result; }
    const paths = [...new Set(sitemapPaths(sitemap.body,input.host))];
    for (const path of paths) {
      if (result.pages.length >= input.maxPages) break;
      const depth = path.split('/').filter(Boolean).length;
      if (depth > input.maxDepth || !robotsAllowed(robots.body,path)) continue;
      await authority.assertCurrent(input); await authority.rateLimit(input);
      const response = await read(path);
      result.pages.push({url:response.finalUrl,status:response.status,observedAt:response.observedAt,
        bodyHash:createHash('sha256').update(response.body).digest('hex'),depth});
    }
    result.state='complete';return result;
  } catch(error) {
    result.state = scoped.aborted ? 'cancelled' : 'unknown';
    result.pages=[];result.warnings.push(error instanceof Error ? error.message : 'DISCOVERY_FAILURE');return result;
  } finally { deadline.close(); }
}
