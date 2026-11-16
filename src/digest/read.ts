import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunStatus } from './types.js';

type Line = { at: string; job: string; status: RunStatus; owner: string | null; error?: string };

const STATUSES: readonly string[] = ['ok', 'retry', 'fail'] satisfies RunStatus[];

function isStatus(v: unknown): v is RunStatus {
  return typeof v === 'string' && STATUSES.includes(v);
}

// Parse at the edge: null for anything that is not a well-formed run line.
function parseLine(text: string): Line | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  const o: Record<string, unknown> = { ...v };
  if (typeof o.at !== 'string' || typeof o.job !== 'string' || !isStatus(o.status)) return null;
  if (o.owner !== null && typeof o.owner !== 'string') return null;
  return { at: o.at, job: o.job, status: o.status, owner: o.owner, ...(typeof o.error === 'string' && { error: o.error }) };
}

export const readNight: ReadNight = (runsDir, night) => {
  // night comes from the URL; the strict shape also blocks path traversal.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(night)) return null;
  let text: string;
  try {
    text = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  const rows = new Map<string, DigestRow>();
  const counts: Night['counts'] = { ok: 0, retry: 0, fail: 0 };
  let badLines = 0;

  // Lines are in time order, so file order gives first/last.
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (!line) {
      badLines++;
      continue;
    }
    counts[line.status]++;
    const row = rows.get(line.job) ?? {
      job: line.job,
      owner: line.owner,
      runs: 0,
      retries: 0,
      lastStatus: line.status,
      lastError: null,
      firstAt: line.at,
      lastAt: line.at,
    };
    row.owner = line.owner;
    row.runs++;
    if (line.status === 'retry') row.retries++;
    row.lastStatus = line.status;
    if (line.error !== undefined) row.lastError = line.error;
    row.lastAt = line.at;
    rows.set(line.job, row);
  }

  return {
    night,
    rows: [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0)),
    badLines,
    counts,
  };
};
