import { exactUnsigned } from './mysql-integer';

export function projectRecordedCosts(rows: readonly { website_id: string; recorded_minor: unknown; completed_count: unknown }[]) {
  return rows.map(row => {
    const count = exactUnsigned(row.completed_count);
    if (count > BigInt(Number.MAX_SAFE_INTEGER)) throw Error('UNSAFE_COST_COUNT');
    return { websiteId: row.website_id, recordedMinor: exactUnsigned(row.recorded_minor).toString(), completedCount: Number(count) };
  });
}
