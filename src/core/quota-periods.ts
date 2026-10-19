/** No implicit timezone. The runtime's IANA rules must be pinned by the deployment. */
export function siteQuotaWeek(instant: string, timezone: string) {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(instant) || !Number.isFinite(Date.parse(instant)) || new Date(instant).toISOString() !== instant) throw new Error('INVALID_INSTANT');
  if (!timezone || !/^(UTC|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/.test(timezone)) throw new Error('INVALID_TIMEZONE');
  let formatter: Intl.DateTimeFormat;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); }
  catch { throw new Error('INVALID_TIMEZONE'); }
  const parts = (ms: number) => Object.fromEntries(formatter.formatToParts(ms).map(p => [p.type, p.value]));
  const civil = (ms: number) => { const p = parts(ms); return `${p.year}-${p.month}-${p.day}`; };
  const local = new Date(`${civil(Date.parse(instant))}T00:00:00.000Z`);
  local.setUTCDate(local.getUTCDate() - (local.getUTCDay() + 6) % 7);
  const monday = local.toISOString().slice(0, 10);
  const next = new Date(local.getTime() + 7 * 86400000).toISOString().slice(0, 10);
  // Enumerate plausible offsets, including historical minute/second offsets. Refuse
  // skipped or repeated midnight rather than silently choosing an accounting period.
  const midnight = (date: string) => {
    const nominal = Date.parse(`${date}T00:00:00.000Z`);
    const offsets = new Set<number>();
    for (let t = nominal - 48 * 3600000; t <= nominal + 48 * 3600000; t += 3600000) {
      const p = parts(t);
      offsets.add(Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.000Z`) - t);
    }
    const matches = [...offsets].map(o => nominal - o).filter(t => {
      const p = parts(t); return civil(t) === date && p.hour === '00' && p.minute === '00' && p.second === '00';
    });
    if (matches.length !== 1) throw new Error('AMBIGUOUS_OR_MISSING_WEEK_BOUNDARY');
    return new Date(matches[0]).toISOString();
  };
  if (!process.versions.tz) throw new Error('TIMEZONE_RULES_UNAVAILABLE');
  return { rulesVersion: process.versions.tz, timezone: formatter.resolvedOptions().timeZone, localMonday: monday, startsAt: midnight(monday), endsAt: midnight(next), portfolioMonth: `${instant.slice(0, 7)}-01` };
}
