import type { Night } from './types.js';

export type NightCounts = { ok: number; retry: number; fail: number };

// retry = sum(retries); fail = rows whose lastStatus is 'fail'; ok = sum(runs) - retry - fail.
export function nightCounts(night: Night): NightCounts {
  const retry = night.rows.reduce((n, r) => n + r.retries, 0);
  const fail = night.rows.filter((r) => r.lastStatus === 'fail').length;
  const runs = night.rows.reduce((n, r) => n + r.runs, 0);
  return { ok: runs - retry - fail, retry, fail };
}
