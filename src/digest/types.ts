// Named RunStatus, not Status: src/status.ts already exports Status (the board).
export type RunStatus = 'ok' | 'retry' | 'fail';

// One row per job in runs/<night>.jsonl.
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number; // parsed lines for this job
  retries: number; // lines with status 'retry'
  lastStatus: RunStatus;
  lastError: string | null; // error of the latest line that had one
  firstAt: string; // ISO string as in the log, offset kept
  lastAt: string;
};

export type Night = {
  night: string; // YYYY-MM-DD
  rows: DigestRow[]; // sorted by job
  badLines: number; // lines that did not parse; counted, never thrown
  counts: Record<RunStatus, number>; // parsed lines by status
};

// null = no file for that night (route returns 404), including a night that is not YYYY-MM-DD.
// An empty file is a Night with zero rows.
export type ReadNight = (runsDir: string, night: string) => Night | null;
