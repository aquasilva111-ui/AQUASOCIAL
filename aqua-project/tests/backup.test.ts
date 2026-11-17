import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addItem, createProject, exportProjectBackup, importProjectBackup, MemoryAssetStore, saveItem, updateItemCategory, updateItemTags } from '../src/index.ts'

test('backup restores content, versions, tags and categories into an empty asset store', async () => {
  const source = new MemoryAssetStore()
  const { project, item } = addItem(createProject('Minha criação'), 'doc', 'Roteiro')
  const saved = await saveItem(project, source, item.id, new TextEncoder().encode('Texto do documento'), 'text/plain')
  const tagged = updateItemTags(updateItemCategory(saved.project, item.id, 'Docs'), item.id, ['ideia'])
  const backup = await exportProjectBackup(tagged, source)
  const target = new MemoryAssetStore()
  const restored = await importProjectBackup(JSON.parse(JSON.stringify(backup)), target)
  assert.deepEqual(restored, tagged)
  assert.equal(new TextDecoder().decode((await target.get(restored.items[0].head!))!.bytes), 'Texto do documento')
})

test('invalid, incomplete and corrupt backups cannot replace a project', async () => {
  const source = new MemoryAssetStore()
  const { project, item } = addItem(createProject('P'), 'doc', 'D')
  const saved = await saveItem(project, source, item.id, new TextEncoder().encode('a'), 'text/plain')
  const backup = await exportProjectBackup(saved.project, source)
  await assert.rejects(() => importProjectBackup({items: []}, source), /inválido/)
  await assert.rejects(() => importProjectBackup({...backup, assets: []}, new MemoryAssetStore()), /todos os arquivos/)
  const corrupt = structuredClone(backup)
  corrupt.assets[0].data = btoa('corrompido')
  const empty = new MemoryAssetStore()
  await assert.rejects(() => importProjectBackup(corrupt, empty), /corrompido/)
  assert.equal(await empty.has(saved.ref.hash), false)
  await assert.rejects(() => importProjectBackup({app: 'AQUA Create', version: 1, project: saved.project}, empty), /todos os arquivos/)
})
