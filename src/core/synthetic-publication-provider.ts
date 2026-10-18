/** Offline fixture only. No network, credential loading, queue or outbound publication method. */
export class SyntheticPublicationStatusProbe {
  private readonly failures = new Set<string>();
  fail(claimKey: string): void { this.failures.add(claimKey); }
  private readonly observations = new Map<string, { kind: 'published'; providerId: string; url: string } | { kind: 'absent' }>();
  set(claimKey: string, observation: { kind: 'published'; providerId: string; url: string } | { kind: 'absent' }): void {
    if (!claimKey.startsWith('publish:')) throw Error('INVALID_SYNTHETIC_CLAIM');
    this.observations.set(claimKey, Object.freeze({ ...observation }));
  }
  async probe(claimKey: string): Promise<{ kind: 'published'; providerId: string; url: string } | { kind: 'absent' } | { kind: 'unknown' }> {
    if (this.failures.has(claimKey)) throw Error('SYNTHETIC_PROVIDER_UNAVAILABLE');
    return this.observations.get(claimKey) ?? { kind: 'unknown' };
  }
}
