import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import * as official from '../../../lib/zalo-reader/official';

// Execute the actual runner with an in-memory filesystem and fake HTTP/Reader.
// No live browser, real API, checkpoint or production data is accessed.
async function scenario(options: { cycle?: any; unavailable?: boolean; notReady?: boolean; profileBusy?: boolean; readerFails?: boolean; reportFails?: boolean; control?: boolean } = {}) {
  const root = path.resolve('.zalo-reader/offline-preflight-fixture');
  const directory = path.join(root, '.zalo-reader/official');
  const cycleFile = path.join(directory, 'cycle-state.json');
  const checkpointFile = path.join(directory, 'checkpoints', 'preserved.json');
  const files = new Map<string, string>([
    [path.join(root, 'tools/zalo-reader/production.config.json'), fs.readFileSync('tools/zalo-reader/production.config.json', 'utf8')],
    [path.join(root, 'tools/zalo-reader/config.json'), fs.readFileSync('tools/zalo-reader/config.json', 'utf8')],
    [checkpointFile, '{"receipt":"keep"}'],
  ]);
  if (options.cycle) files.set(cycleFile, JSON.stringify(options.cycle));
  let readerCalls = 0, fetchCalls = 0, released = 0;
  const logs: string[] = [];
  const fakeFs = { existsSync: (file: string) => files.has(file), readFileSync: (file: string) => { assert.ok(files.has(file), file); return files.get(file); }, mkdirSync() {},
    appendFileSync: (file: string, text: string) => files.set(file, (files.get(file) || '') + text) };
  class Session {
    runId = 'offline-run'; summaries: any[] = [];
    async heartbeat() {} async finishGroup() {}
  }
  const dependencies: Record<string, any> = {
    'node:fs': fakeFs, 'node:path': path, 'node:crypto': { randomUUID: () => 'offline-id' },
    'node:child_process': { spawnSync: () => { assert.equal(options.profileBusy, true); return { status: 12 }; } },
    'node:readline/promises': { createInterface() { throw new Error('Test must not prompt'); } },
    '../../lib/zalo-reader/official': official,
    './official-runtime': { OfficialSession: Session, acquireReaderLock: () => () => { released++; },
      atomicJson: (file: string, value: any) => files.set(file, JSON.stringify(value)), setOfficialSession() {}, safeConsole: () => () => {} },
    './parsers': {}, './zalo-reader.before-semantic-parser': { runReader: async () => { readerCalls++; if (options.readerFails) throw new Error('READER_FIXTURE_FAILURE'); } },
  };
  const module = { exports: {} as any };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('tools/zalo-reader/official-runner.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText, {
    module, exports: module.exports, require: (name: string) => { assert.ok(name in dependencies, name); return dependencies[name]; },
    __filename: path.resolve('tools/zalo-reader/official-runner.ts'),
    process: { cwd: () => root, argv: ['node', 'offline-test'], env: { ZALO_READER_INTERNAL_SECRET: 'offline-secret' }, platform: options.profileBusy ? 'win32' : 'linux' },
    URL, AbortSignal, Date, setInterval: () => ({ unref() {} }), clearInterval() {},
    console: { log: (line: string) => logs.push(line), warn: (line: string) => logs.push(line), error: (line: string) => logs.push(line) },
    fetch: async (_url: URL, request: any) => {
      fetchCalls++;
      if (options.unavailable || (options.reportFails && request?.method === 'POST')) throw new TypeError('fetch failed');
      return { ok: true, json: async () => ({ ready: !options.notReady }) };
    },
  });
  let error: any;
  try { await module.exports.main(options.control ? ['--production', '--report-enabled'] : ['--production', '--confirm-production']); } catch (caught) { error = caught; }
  assert.equal(released, options.control ? 0 : 1, 'runner lock is released on scans; status control never acquires the scan lock');
  assert.equal(files.get(checkpointFile), '{"receipt":"keep"}', 'no checkpoint reset');
  return { error, readerCalls, fetchCalls, logs, cycle: files.get(cycleFile) ? JSON.parse(files.get(cycleFile)!) : null };
}
async function main() {
  const control = await scenario({ control: true });
  assert.equal(control.error, undefined); assert.equal(control.readerCalls, 0); assert.equal(control.fetchCalls, 1); assert.equal(control.cycle, null, 'production status control never starts a scan');
  const unavailable = await scenario({ unavailable: true });
  assert.match(unavailable.error?.message, /READER_API_UNREACHABLE[\s\S]*npm run dev/);
  assert.equal(unavailable.readerCalls, 0); assert.equal(unavailable.cycle, null, 'API preflight failure never creates a 60-minute cooldown');
  assert.equal(unavailable.logs.some(line => line.includes('READER_NEXT_RUN_REPORT_UNAVAILABLE')), false);
  const future = new Date(Date.now() + 3600000).toISOString();
  const oldFailure = { finishedAt: new Date().toISOString(), nextEligibleAt: future, runId: null };
  const recovered = await scenario({ cycle: oldFailure });
  assert.equal(recovered.error, undefined); assert.equal(recovered.readerCalls, 1, 'old preflight-only cooldown does not block a real run');
  assert.equal(recovered.cycle.runId, 'offline-run');
  assert.equal(Date.parse(recovered.cycle.nextEligibleAt) - Date.parse(recovered.cycle.finishedAt), 3600000);
  const completed = { ...oldFailure, runId: 'previous-real-run' };
  const waiting = await scenario({ cycle: completed });
  assert.equal(waiting.readerCalls, 0); assert.equal(waiting.fetchCalls, 0); assert.deepEqual(waiting.cycle, completed);
  assert.ok(waiting.logs.some(line => line.includes('READER_CYCLE_NOT_DUE') && line.includes('Có thể chạy lại từ')));
  for (const options of [{ notReady: true }, { profileBusy: true }]) {
    const preflight = await scenario(options); assert.ok(preflight.error); assert.equal(preflight.readerCalls, 0); assert.equal(preflight.cycle, null);
  }
  const partial = await scenario({ readerFails: true, reportFails: true });
  assert.match(partial.error?.message, /READER_FIXTURE_FAILURE/); assert.equal(partial.cycle.runId, 'offline-run', 'an actually started scan retains the 60-minute interval even if it fails');
  assert.ok(partial.logs.some(line => line.includes('READER_NEXT_RUN_REPORT_UNAVAILABLE') && line.includes('ở máy này')));
  console.log('Runner preflight: API down / old null-run recovery / real-run cooldown / DB readiness / profile busy / failure after start / no checkpoint writes: PASS (offline)');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
