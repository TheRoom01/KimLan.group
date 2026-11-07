import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import { randomUUID } from 'node:crypto';
import ts from 'typescript';

// Execute the real tracking modules with mocked hooks/transport. No network or
// production writes; effect replay models React StrictMode's setup replay.
function harness(storage = new Map(), clock = { now: 1_800_000 }, browserCrypto = { randomUUID }) {
  const events = [];
  let active;
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
        if (name === './client' || name === '@/lib/analytics/client') return modules.client;
        if (name === '../filterOptions') return load('lib/filterOptions.ts');
        if (name === '../rooms/features') return load('lib/rooms/features.ts');
        if (name === '../rooms/search') return load('lib/rooms/search.ts');
        throw new Error('Unexpected import: ' + name);
      },
      window: {}, crypto: browserCrypto, Date: { now: () => clock.now },
      localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
      fetch: (_url, options) => { events.push(JSON.parse(options.body)); return Promise.resolve({ ok: true }); },
    });
    return exports;
  }
  modules.client = load('lib/analytics/client.ts');
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
    events, room: () => mount(room), track: modules.client.trackVisitorEvent,
    activity: () => load('lib/analytics/activity.ts'),
    count(action) { return events.filter(e => e.action === action).length; },
  };
}

test('opening the listing no longer wires up page view tracking', () => {
  const layout = fs.readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(layout, /VisitorTracker|trackHomePageView/);
});

test('rapid reopen and room changes are distinct views, not throttled', () => {
  const h = harness();
  h.room()('room-a');
  const reopened = h.room();
  reopened('room-a');
  reopened('room-b');
  assert.equal(h.count('page_view'), 0);
  assert.equal(h.count('room_view'), 3);
  assert.equal(new Set(h.events.map(e => e.id)).size, h.events.length);
  assert.equal(new Set(h.events.map(e => e.visitorId)).size, 1);
});

test('direct room load counts once; loading state and effect replay do not duplicate', () => {
  const h = harness();
  const detail = h.room();
  detail(undefined);
  assert.equal(h.events.length, 0);
  detail('room-a');
  detail('room-a');
  assert.equal(h.count('page_view'), 0);
  assert.equal(h.count('room_view'), 1);
});

test('opening a shared room works when the browser has no randomUUID', () => {
  const h = harness(undefined, undefined, {});
  assert.doesNotThrow(() => h.room()('room-a'));
  assert.equal(h.count('room_view'), 0);
});

test('only identical meaningful search/filter submissions are throttled', () => {
  const h = harness();
  h.track('filter_use', undefined, {minPrice: undefined});
  h.track('filter_use', undefined, {minPrice: 3000000});
  h.track('filter_use', undefined, {minPrice: 3000000});
  h.track('filter_use', undefined, {minPrice: 4000000});
  h.track('keyword_search', undefined, {keyword: 'studio'});
  h.track('keyword_search', undefined, {keyword: 'studio'});
  h.track('keyword_search', undefined, {}); // Search with a redacted contact detail still counts.
  assert.deepEqual(h.events.map(e => e.details), [{minPrice: 3000000}, {minPrice: 4000000}, {keyword: 'studio'}, {}]);
});

test('reloads reuse the pseudonymous browser id', () => {
  const storage = new Map();
  const first = harness(storage);
  const reloaded = harness(storage);
  first.room()('room-a');
  reloaded.room()('room-a');
  assert.equal(first.events[0].visitorId, reloaded.events[0].visitorId);
});

test('blocked storage retains an in-memory browser id without breaking navigation', () => {
  const storage = { get() { throw new Error('Blocked'); }, set() { throw new Error('Blocked'); } };
  const h = harness(storage);
  h.room()('room-a');
  h.room()('room-b');
  assert.equal(h.count('room_view'), 2);
  assert.equal(new Set(h.events.map(e => e.visitorId)).size, 1);
});

test('activity payloads retain supported filter values and strip contact or private address details', () => {
  const { customerSearchDetails, customerFilterDetails, changedCustomerFilters } = harness().activity();
  const plain = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(plain(customerSearchDetails('P.13')), {keyword: 'phường 13', ward: '13'});
  assert.deepEqual(plain(customerSearchDetails('Phường Đức Nhuận')), {keyword: 'phường đức nhuận', ward: 'đức nhuận'});
  assert.deepEqual(plain(customerSearchDetails('258 Hoàng Văn Thụ')), {keyword: 'hoàng văn thụ'});
  for (const search of ['thử customer@example.com', 'liên hệ 0912 345 678', 'https://example.com']) {
    assert.deepEqual(plain(customerSearchDetails(search)), {});
  }
  const before = customerFilterDetails({minPrice: 3000000, districts: ['Quận 1']});
  const after = customerFilterDetails({minPrice: 3000000, districts: ['Quận 1', 'injected phone'], roomTypes: ['Studio'], amenities: ['balcony', 'extra']});
  assert.deepEqual(plain(changedCustomerFilters(before, after)), {roomTypes: ['Studio'], amenities: ['balcony']});
});
