import assert from 'node:assert/strict'
import test from 'node:test'

import { hrefFor, parseCreatePath } from '../src/create/route.ts'
import { TOOLS } from '../src/create/tools.ts'

test('parseCreatePath matches the launcher and workspace routes', () => {
  assert.equal(parseCreatePath('/'), null)
  assert.deepEqual(parseCreatePath('/create'), { name: 'launcher' })
  assert.deepEqual(parseCreatePath('/create/'), { name: 'launcher' })
  assert.deepEqual(parseCreatePath('/create/design'), { name: 'workspace', tool: 'design', itemId: undefined })
  assert.deepEqual(parseCreatePath('/create/music/itm_abc'), { name: 'workspace', tool: 'music', itemId: 'itm_abc' })
  assert.deepEqual(parseCreatePath('/create/nope'), { name: 'launcher' })
  assert.deepEqual(parseCreatePath('/profile'), null)
})

test('hrefFor keeps the room query and encodes the item id', () => {
  assert.equal(hrefFor({ name: 'launcher' }, '?room=sala'), '/create?room=sala')
  assert.equal(hrefFor({ name: 'workspace', tool: 'write', itemId: 'a b' }), '/create/write/a%20b')
})

test('the launcher lists the ten tools from the spec', () => {
  assert.deepEqual(
    TOOLS.map((tool) => tool.id),
    ['design', 'write', 'slides', 'sheet', 'music', 'mix', 'audio', 'video', 'chart', 'cube']
  )
  assert.equal(TOOLS.find((tool) => tool.id === 'music')?.chip, 'Melody Lab')
  assert.equal(TOOLS.find((tool) => tool.id === 'cube')?.kind, null)
  assert.equal(TOOLS.every((tool) => tool.chip === 'IA' || tool.chip === 'Melody Lab'), true)
})
