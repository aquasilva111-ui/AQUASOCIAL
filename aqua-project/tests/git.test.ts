import assert from 'node:assert/strict'
import { test } from 'node:test'

import { Volume, createFsFromVolume } from 'memfs'

import { ProjectGit } from '../src/index.ts'

const b = (s: string) => new TextEncoder().encode(s)
const t = (u: Uint8Array | undefined) => new TextDecoder().decode(u)

test('git history per item, same content is not a commit, read an old commit', async () => {
  const g = new ProjectGit(createFsFromVolume(new Volume()) as any)
  await g.init()
  const c1 = await g.commitItem('a', b('v1'), 'primeira')
  assert.ok(c1)
  assert.equal(await g.commitItem('a', b('v1'), 'igual'), null)
  const c2 = await g.commitItem('a', b('v2'), 'segunda')
  await g.commitItem('other', b('x'), 'outro item')
  const h = await g.history('a')
  assert.deepEqual(h.map((x) => x.message), ['segunda', 'primeira'])
  assert.equal(t(await g.readAt('a', c1!)), 'v1')
  assert.equal(t(await g.read('a')), 'v2')
  assert.ok(c2)
})

test('branches keep variations apart', async () => {
  const g = new ProjectGit(createFsFromVolume(new Volume()) as any)
  await g.init()
  await g.commitItem('a', b('base'), 'base')
  await g.branch('variacao')
  await g.commitItem('a', b('variação'), 'teste')
  assert.equal(t(await g.read('a')), 'variação')
  await g.checkout('main')
  assert.equal(t(await g.read('a')), 'base')
  assert.deepEqual((await g.branches()).sort(), ['main', 'variacao'])
})
