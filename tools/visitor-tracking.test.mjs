import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

// Execute the real tracking modules with mocked hooks/transport. No network or
// production writes; effect replay models React StrictMode's setup replay.
function harness(storage = new Map(), clock = { now: 1_800_000 }, locks, transport = { ok: true }) {
  const events = [];
  let active;
  let segment = null;
  const react = {
    useRef(initial) {
      const index = active.cursor++;
      return active.refs[index] ??= { current: initial };
    },
    useEffect(effect, deps) {
      const index = active.cursor++;
      const previous = active.deps[index];
      if (!previous || deps.some((v, i) => !Object.is(v, previous[i]))) {
        active.deps[index] = deps;
        active.effects.push(effect);
      }
    },
  };
  const modules = {};
  function load(path) {
    const output = ts.transpileModule(fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const exports = {};
    vm.runInNewContext(output, {
      exports, require(name) {
        if (name === 'react') return react;
        if (name === 'next/navigation') return { usePathname: () => segment === null ? '/' : `/${segment}` };
        if (name === './client' || name === '@/lib/analytics/client') return modules.client;
        throw new Error('Unexpected import: ' + name);
      },
      window: {}, crypto: { randomUUID }, Date: { now: () => clock.now }, navigator: { locks },
      localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
      fetch: (_url, options) => { events.push(JSON.parse(options.body)); return Promise.resolve({ ok: transport.ok }); },
    });
    return exports;
  }
  modules.client = load('lib/analytics/client.ts');
  const tracker = load('components/VisitorTracker.tsx').default;
  const room = load('lib/analytics/useRoomView.ts').useRoomView;
  function mount(fn) {
    const instance = { cursor: 0, refs: [], deps: [], effects: [] };
    return arg => {
      active = instance;
      instance.cursor = 0;
      instance.effects = [];
      fn(arg);
      for (const effect of instance.effects) { effect(); effect(); }
    };
  }
  return {
    events, root: mount(tracker), room: () => mount(room),
    home: modules.client.trackHomePageView,
    segment(value) { segment = value; },
    count(action) { return events.filter(e => e.action === action).length; },
  };
}

test('opening and closing an intercepted modal never adds a Home page view', async () => {
  const h = harness();
  h.root();
  assert.equal(h.count('page_view'), 1);
  const detail = h.room();
  h.segment('rooms/room-a'); h.root();
  detail('room-a');
  h.root(); // Main slot remains on home, even while URL points to /rooms/a.
  detail('room-a'); // Render update is not a new opening.
  await new Promise(setImmediate);
  h.segment(null); h.root(); // Back closes modal and restores the existing home.
  await new Promise(setImmediate);
  assert.equal(h.count('page_view'), 1);
  assert.equal(h.count('room_view'), 1);
  assert.equal(new Set(h.events.map(e => e.visitorId)).size, 1);
});

test('rapid reopen and room changes are distinct views, not throttled', () => {
  const h = harness();
  h.segment('map');
  h.root();
  h.room()('room-a');
  h.root();
  const reopened = h.room();
  reopened('room-a');
  reopened('room-b');
  assert.equal(h.count('page_view'), 0);
  assert.equal(h.count('room_view'), 3);
  assert.equal(new Set(h.events.map(e => e.id)).size, h.events.length);
});

test('direct room load counts once; loading state and effect replay do not duplicate', () => {
  const h = harness();
  h.segment('rooms');
  h.root();
  const detail = h.room();
  detail(undefined);
  assert.equal(h.events.length, 0);
  detail('room-a');
  detail('room-a');
  assert.equal(h.count('page_view'), 0);
  assert.equal(h.count('room_view'), 1);
});

test('only Home counts, not map, Reports or admin', () => {
  const h = harness();
  h.root();
  h.segment('map'); h.root();
  h.segment('reports'); h.root();
  h.segment('admin'); h.root();
  h.segment(null); h.root();
  assert.equal(h.count('page_view'), 1);
  assert.equal(h.count('room_view'), 0);
});

test('reloads share cooldown; exactly 30 minutes after last counted visit permits another', async () => {
  const storage = new Map();
  const clock = { now: 1_800_000 };
  const first = harness(storage, clock);
  await first.home();
  assert.equal(first.count('page_view'), 1);
  clock.now += 29 * 60 * 1000;
  const reloaded = harness(storage, clock);
  await reloaded.home();
  assert.equal(reloaded.count('page_view'), 0);
  clock.now += 60 * 1000;
  await reloaded.home();
  assert.equal(reloaded.count('page_view'), 1);
  await reloaded.home();
  assert.equal(reloaded.count('page_view'), 1);
});

test('simultaneous tabs serialize through the browser lock and share one Home view', async () => {
  let queue = Promise.resolve();
  const locks = { request(_key, callback) { queue = queue.then(callback); return queue; } };
  const storage = new Map();
  const clock = { now: 1_800_000 };
  const a = harness(storage, clock, locks);
  const b = harness(storage, clock, locks);
  await Promise.all([a.home(), b.home()]);
  assert.equal(a.count('page_view') + b.count('page_view'), 1);
});

test('failed delivery does not start a 30-minute cooldown', async () => {
  const transport = { ok: false };
  const h = harness(new Map(), { now: 1_800_000 }, undefined, transport);
  await h.home();
  transport.ok = true;
  await h.home();
  assert.equal(h.count('page_view'), 2); // First failed request, then successful retry.
  await h.home();
  assert.equal(h.count('page_view'), 2);
});

test('blocked storage retains in-memory protection without breaking navigation', async () => {
  const storage = { get() { throw new Error('Blocked'); }, set() { throw new Error('Blocked'); } };
  const h = harness(storage);
  await h.home();
  await h.home();
  assert.equal(h.count('page_view'), 1);
});
