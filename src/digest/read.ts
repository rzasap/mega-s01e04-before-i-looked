import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, ReadNight, RunLine, RunStatus } from './types.js';

const STATUSES: readonly RunStatus[] = ['ok', 'retry', 'fail'];

function isStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

// Parse one line at the edge. Anything that is not a well-formed run line gives null.
export function parseLine(text: string): RunLine | null {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const obj = value as Record<string, unknown>;
  if (typeof obj.at !== 'string' || typeof obj.job !== 'string' || !isStatus(obj.status)) return null;
  const line: RunLine = {
    at: obj.at,
    job: obj.job,
    status: obj.status,
    owner: typeof obj.owner === 'string' ? obj.owner : null,
  };
  if (typeof obj.error === 'string') line.error = obj.error;
  return line;
}

export const readNight: ReadNight = (runsDir, night) => {
  const file = join(runsDir, `${night}.jsonl`);
  if (!existsSync(file)) return null;

  const lines = readFileSync(file, 'utf8').split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  const byJob = new Map<string, DigestRow>();
  let badLines = 0;

  for (const raw of lines) {
    const line = parseLine(raw.endsWith('\r') ? raw.slice(0, -1) : raw);
    if (!line) {
      badLines++;
      continue;
    }
    const row = byJob.get(line.job);
    if (!row) {
      byJob.set(line.job, {
        job: line.job,
        owner: line.owner,
        runs: 1,
        retries: line.status === 'retry' ? 1 : 0,
        lastStatus: line.status,
        lastError: line.error ?? null,
        firstAt: line.at,
        lastAt: line.at,
      });
      continue;
    }
    // Lines are in log order: the latest line wins for owner, status and time.
    row.owner = line.owner;
    row.runs++;
    if (line.status === 'retry') row.retries++;
    row.lastStatus = line.status;
    if (line.error !== undefined) row.lastError = line.error;
    row.lastAt = line.at;
  }

  const rows = [...byJob.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows, badLines };
};
