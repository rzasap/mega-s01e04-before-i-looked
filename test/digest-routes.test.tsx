import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { DigestRow } from '../src/digest/types.js';

// Fixtures live in a temp dir. runs/ is read-only and never touched here.
let runsDir: string;

const config = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
  runsDir: '',
};

beforeAll(() => {
  runsDir = mkdtempSync(join(tmpdir(), 'rig-digest-'));
  config.runsDir = runsDir;

  // Lines are deliberately not in job order, so sorting is observable.
  // `backup` has owner null on every line: the row is kept, the owner renders as `—`.
  writeFileSync(
    join(runsDir, '2026-01-01.jsonl'),
    [
      '{"at":"2026-01-01T02:00:00+01:00","job":"backup","status":"retry","owner":null,"error":"timeout"}',
      '{"at":"2026-01-01T01:00:00+01:00","job":"sync","status":"ok","owner":"ana"}',
      '{"at":"2026-01-01T00:30:00+01:00","job":"archive","status":"fail","owner":"ben","error":"disk full"}',
      '{"at":"2026-01-01T03:00:00+01:00","job":"backup","status":"ok","owner":null}',
      '',
    ].join('\n'),
  );

  writeFileSync(join(runsDir, '2026-01-02.jsonl'), '');

  // One good job, one line that does not parse.
  writeFileSync(
    join(runsDir, '2026-01-03.jsonl'),
    [
      '{"at":"2026-01-03T01:00:00+01:00","job":"sync","status":"ok","owner":"ana"}',
      'this line is not json',
      '',
    ].join('\n'),
  );
});

afterAll(() => {
  rmSync(runsDir, { recursive: true, force: true });
});

type DigestJson = { night: string; rows: DigestRow[]; badLines: number };

describe('GET /digest/:night', () => {
  it('answers 200 HTML with the lane banner and one row per job, sorted by job', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    const archive = html.indexOf('archive');
    const backup = html.indexOf('backup');
    const sync = html.indexOf('sync');
    expect(archive).toBeGreaterThan(-1);
    expect(backup).toBeGreaterThan(archive);
    expect(sync).toBeGreaterThan(backup);
  });

  it('renders a missing owner as a dash, keeping the row', async () => {
    const res = await createApp(config).request('/digest/2026-01-01');
    const html = await res.text();
    expect(html).toContain('backup');
    expect(html).toContain('—');
  });

  it('answers 404 for a night with no file', async () => {
    const res = await createApp(config).request('/digest/2026-01-09');
    expect(res.status).toBe(404);
  });

  it('answers 200 with "nothing ran" for an empty night', async () => {
    const res = await createApp(config).request('/digest/2026-01-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('answers 200 and still lists the good jobs when a line is bad', async () => {
    const res = await createApp(config).request('/digest/2026-01-03');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('sync');
  });
});

describe('GET /api/digest/:night', () => {
  it('answers 200 JSON { night, rows, badLines } with rows sorted by job', async () => {
    const res = await createApp(config).request('/api/digest/2026-01-01');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(body.night).toBe('2026-01-01');
    expect(body.badLines).toBe(0);
    expect(body.rows.map((r) => r.job)).toEqual(['archive', 'backup', 'sync']);

    const backup = body.rows.find((r) => r.job === 'backup');
    expect(backup).toEqual({
      job: 'backup',
      owner: null,
      runs: 2,
      retries: 1,
      lastStatus: 'ok',
      lastError: 'timeout',
      firstAt: '2026-01-01T02:00:00+01:00',
      lastAt: '2026-01-01T03:00:00+01:00',
    });

    const archive = body.rows.find((r) => r.job === 'archive');
    expect(archive).toEqual({
      job: 'archive',
      owner: 'ben',
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'disk full',
      firstAt: '2026-01-01T00:30:00+01:00',
      lastAt: '2026-01-01T00:30:00+01:00',
    });
  });

  it('answers 404 for a night with no file', async () => {
    const res = await createApp(config).request('/api/digest/2026-01-09');
    expect(res.status).toBe(404);
  });

  it('answers 200 with no rows and zero bad lines for an empty night', async () => {
    const res = await createApp(config).request('/api/digest/2026-01-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('counts a bad line and keeps the good rows', async () => {
    const res = await createApp(config).request('/api/digest/2026-01-03');
    expect(res.status).toBe(200);
    const body = (await res.json()) as DigestJson;
    expect(body.badLines).toBe(1);
    expect(body.rows.map((r) => r.job)).toEqual(['sync']);
  });
});

describe('digest order', () => {
  it('lists the jobs in the page in the same order as the JSON', async () => {
    const app = createApp(config);
    const json = (await (await app.request('/api/digest/2026-01-01')).json()) as DigestJson;
    const html = await (await app.request('/digest/2026-01-01')).text();

    const positions = json.rows.map((r) => html.indexOf(r.job));
    positions.forEach((p) => expect(p).toBeGreaterThan(-1));
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });
});
