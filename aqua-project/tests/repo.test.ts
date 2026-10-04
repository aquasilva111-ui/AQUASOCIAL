import assert from 'node:assert/strict'
import { test } from 'node:test'

import { MemoryAssetStore, moveItem, addItem, createProject, launchableFor, linkItem, listVersions, liveHashes, removeItem, restoreVersion, saveItem, usedBy } from '../src/index.ts'

const bytes = (s: string) => new TextEncoder().encode(s)

test('same bytes are one asset; identical re-save makes no version', async () => {
  const store = new MemoryAssetStore()
  const a = await store.put(bytes('x'), 'text/plain')
  const b = await store.put(bytes('x'), 'text/plain')
  assert.equal(a.hash, b.hash)
  let { project, item } = addItem(createProject('P'), 'doc', 'Roteiro')
  const r1 = await saveItem(project, store, item.id, bytes('v1'), 'text/plain', 'primeira')
  assert.ok(r1.version)
  const r2 = await saveItem(r1.project, store, item.id, bytes('v1'), 'text/plain')
  assert.equal(r2.version, null)
  assert.equal(listVersions(r2.project, item.id).length, 1)
})

test('restore points head at the old content and keeps history', async () => {
  const store = new MemoryAssetStore()
  let { project, item } = addItem(createProject('P'), 'design', 'Capa')
  const s1 = await saveItem(project, store, item.id, bytes('a'), 'x/y', '', '2026-01-01T00:00:00Z')
  const s2 = await saveItem(s1.project, store, item.id, bytes('b'), 'x/y', '', '2026-01-02T00:00:00Z')
  const restored = restoreVersion(s2.project, s1.version!.id, '2026-01-03T00:00:00Z')
  assert.equal(restored.items[0].head, s1.ref.hash)
  assert.equal(listVersions(restored, item.id).length, 3)
})

test('links, usedBy, removal and live hashes', async () => {
  const store = new MemoryAssetStore()
  let p = createProject('P')
  const d = addItem(p, 'doc', 'Doc'); p = d.project
  const s = addItem(p, 'sheet', 'Tabela'); p = s.project
  p = linkItem(p, d.item.id, { type: 'item', id: s.item.id })
  p = linkItem(p, d.item.id, { type: 'item', id: s.item.id })
  assert.equal(p.items[0].links.length, 1)
  assert.equal(usedBy(p, { type: 'item', id: s.item.id }).length, 1)
  const saved = await saveItem(p, store, s.item.id, bytes('t'), 'x/y')
  assert.equal(liveHashes(saved.project).size, 1)
  const gone = removeItem(saved.project, s.item.id)
  assert.equal(gone.items[0].links.length, 0)
  assert.equal(liveHashes(gone).size, 0)
})

test('launchableFor maps tools to Launch Hub capabilities', () => {
  const items = [{ id: '1', kind: 'design' as const }, { id: '2', kind: 'audio' as const }, { id: '3', kind: 'presentation' as const }]
  assert.deepEqual(launchableFor(items, 'image').map((i) => i.id), ['1'])
  assert.deepEqual(launchableFor(items, 'carousel').map((i) => i.id), ['3'])
})

import 'fake-indexeddb/auto'
import { IdbAssetStore } from '../src/index.ts'

test('IdbAssetStore: dedupes by hash, round-trips bytes, collects orphans', async () => {
  const store = new IdbAssetStore('t-' + Math.random())
  const a = await store.put(bytes('um'), 'text/plain')
  const again = await store.put(bytes('um'), 'text/plain')
  const b = await store.put(bytes('dois'), 'text/plain')
  assert.equal(a.hash, again.hash)
  assert.equal(new TextDecoder().decode((await store.get(a.hash))!.bytes), 'um')
  assert.equal(await store.has('nope'), false)
  assert.equal(await store.collect(new Set([a.hash])), 1)
  assert.equal(await store.has(b.hash), false)
  assert.equal(await store.has(a.hash), true)
})

test('moveItem reorders without mutating the input and clamps the index', () => {
  let p = createProject('P')
  const ids: string[] = []
  for (const n of ['a', 'b', 'c']) {
    const r = addItem(p, 'doc', n)
    p = r.project
    ids.push(r.item.id)
  }
  const names = (x: typeof p) => x.items.map((i) => i.name).join('')
  assert.equal(names(moveItem(p, ids[2], 0)), 'cab')
  assert.equal(names(moveItem(p, ids[0], 99)), 'bca')
  assert.equal(names(moveItem(p, ids[1], -5)), 'bac')
  assert.equal(names(moveItem(p, ids[1], 1)), 'abc') // same place
  assert.equal(names(p), 'abc') // input untouched
  assert.throws(() => moveItem(p, 'nope', 0), /Item not found/)
})
