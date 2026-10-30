// Plan morning-digest § 1. The contract every part of § 2 starts against: the reader fills it,
// the page and the JSON only render it (ADR 0001: they must never disagree).

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, after parsing at the edge.
export type RunLine = {
  at: string; // ISO 8601 with the log's own offset; never converted to UTC
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One row per job for the night.
export type DigestRow = {
  job: string;
  owner: string | null; // null renders as `—`, the row is kept
  runs: number; // lines for this job, any status
  retries: number; // lines with status `retry`
  lastStatus: RunStatus;
  lastError: string | null; // the latest `error` seen for this job, null if none
  firstAt: string;
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that did not parse: counted, never thrown
};

// Returns null when runs/<night>.jsonl does not exist (the routes answer 404).
// An empty file gives { rows: [], badLines: 0 }.
export type ReadNight = (runsDir: string, night: string) => Night | null;
