import assert from 'node:assert/strict'
import { test } from 'node:test'

import { SceneGraph } from '../src/scene-graph/index.ts'
import { colorToCss } from '../src/fabric/convert.ts'

test('scene graph holds a page with nodes and updates them', () => {
  const g = new SceneGraph()
  const page = g.getPages()[0]
  const r = g.createNode('RECTANGLE', page.id, { x: 10, y: 20, width: 100, height: 50 })
  g.updateNode(r.id, { x: 30 })
  assert.equal(g.getNode(r.id)?.x, 30)
  assert.equal(g.getChildren(page.id).length, 1)
})

test('colorToCss maps 0-1 channels to css rgba', () => {
  assert.equal(colorToCss({ r: 1, g: 0, b: 0, a: 1 }, 0.5), 'rgba(255,0,0,0.5)')
})

import { AQUA, AQUA_BRAND_KIT, addTitle, createAquaDocument, hexToColor, mergeBrandKit } from '../src/brand/index.ts'

test('hexToColor and brand tokens', () => {
  assert.deepEqual(hexToColor(AQUA.blue), { r: 0, g: 43 / 255, b: 239 / 255, a: 1 })
})

test('createAquaDocument builds an artboard in the format size with a title', () => {
  const doc = createAquaDocument('story')
  assert.equal(doc.artboard.width, 1080)
  assert.equal(doc.artboard.height, 1920)
  const t = addTitle(doc, 'Olá')
  assert.equal(t.fontFamily, 'Inter')
  assert.equal(doc.graph.getChildren(doc.artboard.id).length, 1)
})

test('mergeBrandKit keeps AQUA defaults for what the user does not set', () => {
  const k = mergeBrandKit({ name: 'Marca', colors: ['#111111'] })
  assert.deepEqual(k.colors, ['#111111'])
  assert.equal(k.gradients, AQUA_BRAND_KIT.gradients)
})

import { deserializeDocument, serializeDocument } from '../src/serialize.ts'

test('design document survives a serialize/deserialize round trip', () => {
  const doc = createAquaDocument('post')
  addTitle(doc, 'Olá')
  const back = deserializeDocument(serializeDocument(doc.graph))
  const page = back.getPages()[0]
  const frame = back.getChildren(page.id)[0]
  assert.equal(frame.width, 1080)
  assert.equal(back.getChildren(frame.id)[0].text, 'Olá')
  assert.throws(() => deserializeDocument(new TextEncoder().encode('{}')))
})

import { addSlide, createPresentation, getNotes, setNotes, slidesOf, toPptx, toRevealHtml } from '../src/presentation.ts'

test('presentation: slides in order, notes, reveal html and pptx', async () => {
  const p = createPresentation('Lançamento <Aqua>')
  const s2 = addSlide(p, '#002BEF')
  p.graph.createNode('ELLIPSE', s2.id, { x: 100, y: 100, width: 200, height: 200, fills: [{ type: 'SOLID', color: { r: 1, g: 0, b: 0, a: 1 }, opacity: 1, visible: true }] })
  setNotes(p, s2.id, 'Falar do preço')
  assert.deepEqual(slidesOf(p).map((s) => s.name), ['Slide 1', 'Slide 2'])
  assert.equal(getNotes(slidesOf(p)[1]), 'Falar do preço')

  const html = toRevealHtml(p)
  assert.equal((html.match(/<section /g) ?? []).length, 2)
  assert.ok(html.includes('Lançamento &lt;Aqua&gt;'))
  assert.ok(html.includes('<aside class="notes">Falar do preço</aside>'))

  const pptx = await toPptx(p)
  assert.equal(String.fromCharCode(pptx[0], pptx[1]), 'PK') // zip container
  assert.ok(pptx.byteLength > 5000)
})
