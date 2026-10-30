import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read.js';

describe('readNight on runs/2026-10-28.jsonl', () => {
  const night = readNight('runs', '2026-10-28');

  it('gives 5 jobs sorted by job and 1 bad line', () => {
    expect(night).not.toBeNull();
    expect(night!.night).toBe('2026-10-28');
    expect(night!.badLines).toBe(1);
    const jobs = night!.rows.map((r) => r.job);
    expect(jobs).toHaveLength(5);
    expect(jobs).toEqual([...jobs].sort());
  });

  it('counts runs and retries, keeps the last status', () => {
    const row = night!.rows.find((r) => r.job === 'fixtures/refresh');
    expect(row).toMatchObject({ owner: 'rook', runs: 4, retries: 3, lastStatus: 'ok', lastError: 'upstream 503' });
    expect(row!.firstAt).toBe('2026-10-29T01:30:00+01:00');
    expect(row!.lastAt).toBe('2026-10-29T01:37:00+01:00');
  });

  it('keeps the fail and its error', () => {
    const row = night!.rows.find((r) => r.job === 'notes/backup');
    expect(row).toMatchObject({ runs: 1, lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('keeps a row whose owner is null', () => {
    const row = night!.rows.find((r) => r.job === 'digest/render');
    expect(row).toBeDefined();
    expect(row!.owner).toBeNull();
    expect(row!.lastError).toBeNull();
  });
});

describe('readNight edge cases', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rig-runs-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('returns null for a missing night', () => {
    expect(readNight(dir, '2000-01-01')).toBeNull();
  });

  it('gives no rows and no bad lines for an empty file', () => {
    writeFileSync(join(dir, '2000-01-02.jsonl'), '');
    expect(readNight(dir, '2000-01-02')).toEqual({ night: '2000-01-02', rows: [], badLines: 0 });
  });

  it('counts malformed lines without throwing', () => {
    const lines = [
      '{"at":"2000-01-03T01:00:00+02:00","job":"a","status":"ok","owner":"x"}',
      'not json',
      '{"at":"2000-01-03T01:00:00+02:00","job":"a","status":"weird","owner":"x"}',
      '{"job":"a","status":"ok","owner":"x"}',
      '[]',
    ];
    writeFileSync(join(dir, '2000-01-03.jsonl'), lines.join('\n') + '\n');
    const night = readNight(dir, '2000-01-03');
    expect(night!.badLines).toBe(4);
    expect(night!.rows).toHaveLength(1);
    expect(night!.rows[0]!.lastAt).toBe('2000-01-03T01:00:00+02:00');
  });
});
