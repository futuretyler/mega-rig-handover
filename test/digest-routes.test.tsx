import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const night = '2026-03-02';
const line = (job: string, status: string) =>
  JSON.stringify({ at: '2026-03-02T01:00:00+01:00', job, status, owner: 'lane-07' });

// Temp runs dir per test; runs/ is read-only and never used here.
function runsDir(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

const appFor = (dir: string) =>
  createApp({ adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: dir });

describe('digest routes', () => {
  it('a normal night: page and JSON list both jobs in sorted order', async () => {
    // File order is zeta then alpha; both outputs must sort by job name.
    const dir = runsDir({
      [`${night}.jsonl`]: [line('zeta/job', 'ok'), line('alpha/job', 'fail')].join('\n') + '\n',
    });
    const app = appFor(dir);

    const page = await app.request(`/digest/${night}`);
    const html = await page.text();
    expect(page.status).toBe(200);
    expect(html.indexOf('alpha/job')).toBeGreaterThan(-1);
    expect(html.indexOf('alpha/job')).toBeLessThan(html.indexOf('zeta/job'));

    const api = await app.request(`/api/digest/${night}`);
    expect(api.status).toBe(200);
    const body = (await api.json()) as Night;
    expect(body.rows.map((r) => r.job)).toEqual(['alpha/job', 'zeta/job']);
  });

  it('a night with no file: 404 on both routes', async () => {
    const app = appFor(runsDir({}));
    expect((await app.request(`/digest/${night}`)).status).toBe(404);
    expect((await app.request(`/api/digest/${night}`)).status).toBe(404);
  });

  it('an empty night: page says nothing ran, JSON has no rows', async () => {
    const app = appFor(runsDir({ [`${night}.jsonl`]: '' }));

    const page = await app.request(`/digest/${night}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('nothing ran');

    const api = await app.request(`/api/digest/${night}`);
    expect(api.status).toBe(200);
    expect(((await api.json()) as Night).rows).toEqual([]);
  });

  it('a night with a bad line: still 200, note on the page, badLines counted in JSON', async () => {
    const app = appFor(
      runsDir({ [`${night}.jsonl`]: [line('alpha/job', 'ok'), 'not json'].join('\n') + '\n' }),
    );

    const page = await app.request(`/digest/${night}`);
    expect(page.status).toBe(200);
    expect(await page.text()).toContain('1 line could not be read');

    const api = await app.request(`/api/digest/${night}`);
    expect(api.status).toBe(200);
    expect(((await api.json()) as Night).badLines).toBe(1);
  });
});
