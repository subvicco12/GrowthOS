import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import { websiteDomainSchema } from '../core/website-domain-schema';

/** Conservative IPv4 policy: IPv6-only hosts remain unavailable rather than using an unreviewed address classifier. */
export function publicOwnershipIPv4(value: string): boolean {
  if (isIP(value) !== 4) return false;
  const [a,b] = value.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 0 || b === 168 || b === 88 || b === 2)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0));
}
export interface OwnershipTransport { read(domain: string): Promise<string> }
export type OwnershipNetwork = {
  resolve(domain: string): Promise<string[]>;
  readPinned(domain: string, address: string, signal: AbortSignal): Promise<string>;
};
export const ownershipNetwork: OwnershipNetwork = {
  resolve: async domain => (await lookup(domain, { family: 4, all: true })).map(row => row.address),
  readPinned(domain, address, signal) {
    return new Promise((resolve, reject) => {
      const req = request({ hostname: domain, port: 443, servername: domain, method: 'GET',
        path: '/.well-known/growthos-verification.txt', family: 4, agent: false, rejectUnauthorized: true, signal,
        lookup: (_host, _options, done) => done(null, address, 4),
        headers: { accept: 'text/plain', 'accept-encoding': 'identity', 'user-agent': 'GrowthOS-Ownership/1.0' } }, response => {
          const encoding = response.headers['content-encoding'];
          if (response.statusCode !== 200 || (encoding && encoding !== 'identity')) { response.destroy(); reject(Error('OWNERSHIP_RESPONSE_DENIED')); return; }
          const chunks: Buffer[] = []; let bytes = 0;
          response.on('data', (chunk: Buffer) => {
            bytes += chunk.length;
            if (bytes > 16384) { response.destroy(Error('OWNERSHIP_RESPONSE_TOO_LARGE')); return; }
            chunks.push(chunk);
          });
          response.on('end', () => { try { resolve(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks))); } catch { reject(Error('OWNERSHIP_RESPONSE_DENIED')); } });
          response.on('error', reject);
        });
      req.on('error', reject); req.end();
    });
  }
};
/** Exact operator allowlist, DNS pinning, no redirect following, no custom URLs/ports, 8s total deadline and bounded body. */
export function createOwnershipTransport(allowedHosts: readonly string[], io: OwnershipNetwork = ownershipNetwork): OwnershipTransport {
  return { async read(domain) {
    if (!websiteDomainSchema.safeParse(domain).success || isIP(domain) || domain !== domain.toLowerCase() ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid|example)$/.test(domain) || !allowedHosts.includes(domain)) throw Error('OWNERSHIP_HOST_NOT_ALLOWED');
    // Do not bypass a platform HTTP proxy with a direct socket. No approved pinned CONNECT transport is configured here.
    if (io === ownershipNetwork && (process.env.HTTPS_PROXY || process.env.https_proxy)) throw Error('OWNERSHIP_PROXY_TRANSPORT_UNAVAILABLE');
    const controller = new AbortController(); let rejectDeadline: ((error: Error) => void) | undefined;
    const timer = setTimeout(() => { controller.abort(); rejectDeadline?.(Error('OWNERSHIP_TIMEOUT')); }, 8000);
    const expired = new Promise<never>((_, reject) => { rejectDeadline = reject; });
    try {
      const work = (async () => {
        const addresses = await io.resolve(domain);
        if (!addresses.length || addresses.length > 16 || addresses.some(address => !publicOwnershipIPv4(address))) throw Error('OWNERSHIP_ADDRESS_DENIED');
        if (controller.signal.aborted) throw Error('OWNERSHIP_TIMEOUT');
        const body = await io.readPinned(domain, addresses[0], controller.signal);
        if (Buffer.byteLength(body, 'utf8') > 16384) throw Error('OWNERSHIP_RESPONSE_TOO_LARGE');
        return body;
      })();
      return await Promise.race([work, expired]);
    } finally { clearTimeout(timer); controller.abort(); }
  } };
}
