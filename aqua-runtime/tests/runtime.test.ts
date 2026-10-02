import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as Y from 'yjs'

import { MemoryAssetStore, createProject } from 'aqua-project/src/index'

import { CreativeRuntime, DOCS_FRAGMENT, MemoryHub, ToolNotAvailableError, type DesignSession, designAdapter, docSession, docsAdapter } from '../src/index'

const make = (extra: Partial<ConstructorParameters<typeof CreativeRuntime>[0]> = {}) =>
  new CreativeRuntime({
    project: createProject('Campanha'),
    store: new MemoryAssetStore(),
    adapters: [designAdapter('design', { renderPng: async () => new Uint8Array([137, 80, 78, 71]) }), docsAdapter],
    ...extra
  })

test('create saves a first version; reopening from the store restores the content', async () => {
  const rt = make()
  const item = await rt.create('design', 'Capa')
  assert.ok(item.head)
  assert.equal(rt.project.versions.length, 1)
  rt.close(item.id)
  const s = await rt.openItem(item.id)
  assert.ok(s.serialize().byteLength > 0)
})

test('design edits are snapshot-undoable and redoable', async () => {
  const rt = make()
  const item = await rt.create('design', 'Capa')
  const s = (await rt.openItem(item.id)) as DesignSession
  const page = s.graph.getPages()[0]
  const frame = s.graph.getChildren(page.id)[0]
  const count = () => s.graph.getChildren(frame.id).length
  const start = count()
  s.graph.createNode('RECTANGLE', frame.id, { width: 10, height: 10 })
  assert.equal(count(), start + 1)
  assert.equal(rt.canUndo(item.id), true)
  assert.equal(rt.undo(item.id), true)
  assert.equal(count(), start) // s.graph is the restored graph
  assert.equal(rt.redo(item.id), true)
  assert.equal(count(), start + 1)
  assert.equal(rt.undo(item.id) && rt.undo(item.id), false) // nothing further back than the creation
})

test('docs: native undo, autosave version and remote sync between two runtimes', async () => {
  const hub = new MemoryHub()
  const a = make({ transport: hub.connect() })
  const item = await a.create('doc', 'Roteiro')
  const sa = (await a.openItem(item.id)) as ReturnType<typeof docSession>

  const b = make({ transport: hub.connect(), project: a.project, store: (a as any).opts.store })
  const sb = (await b.openItem(item.id)) as ReturnType<typeof docSession>

  sa.doc.getXmlFragment(DOCS_FRAGMENT).insert(0, [new Y.XmlText('olá')])
  assert.equal(sb.doc.getXmlFragment(DOCS_FRAGMENT).length, 1) // arrived through the transport
  assert.equal(a.canUndo(item.id), true)
  assert.equal(b.canUndo(item.id), false) // remote edits are not B's to undo

  await a.flush()
  assert.equal(a.project.versions.filter((v) => v.itemId === item.id).length, 2)
  assert.equal(a.undo(item.id), true)
  assert.equal(sa.doc.getXmlFragment(DOCS_FRAGMENT).length, 0)
})

test('launch export: renders design as image; unsupported tools say so', async () => {
  const rt = make()
  const d = await rt.create('design', 'Post')
  const png = await rt.exportForLaunch(d.id, 'image')
  assert.equal(png?.mime, 'image/png')
  assert.equal(await rt.exportForLaunch(d.id, 'audio'), undefined)
  assert.deepEqual(rt.launchable('image').map((i) => i.id), [d.id])
})

test('tools not built yet fail clearly; picker lists saved items', async () => {
  const rt = make()
  await assert.rejects(() => rt.create('sheet', 'Tabela'), ToolNotAvailableError)
  const d = await rt.create('design', 'A')
  const e = await rt.create('doc', 'B')
  assert.deepEqual(rt.pickable(['design']).map((i) => i.id), [d.id])
  assert.equal(rt.pickable(undefined, e.id).length, 1)
  rt.link(e.id, { type: 'item', id: d.id })
  assert.equal(rt.project.items.find((i) => i.id === e.id)!.links.length, 1)
})

test('presentation item: slides, pptx and reveal export through the runtime', async () => {
  const rt = new CreativeRuntime({
    project: createProject('Deck'),
    store: new MemoryAssetStore(),
    adapters: [designAdapter('presentation')]
  })
  const item = await rt.create('presentation', 'Lançamento')
  const s = (await rt.openItem(item.id)) as DesignSession
  assert.equal(String.fromCharCode(...(await s.toPptx()).slice(0, 2)), 'PK')
  assert.ok(s.toRevealHtml().includes('Lançamento'))
  rt.close(item.id)
  const again = (await rt.openItem(item.id)) as DesignSession
  assert.equal(again.presentation().graph.getChildren(again.presentation().pageId).length, 1)
})

import { audioAdapter, chartAdapter, musicAdapter, type AudioSession, type ChartSession, type MusicSession } from '../src/index'

const hubRt = () =>
  new CreativeRuntime({
    project: createProject('Hub'),
    store: new MemoryAssetStore(),
    adapters: [
      chartAdapter({ rasterize: async () => new Uint8Array([1, 2, 3]) }),
      musicAdapter(),
      audioAdapter()
    ]
  })

test('chart: ECharts SSR svg, undoable edit, png export through the Launch Hub path', async () => {
  const rt = hubRt()
  const item = await rt.create('chart', 'Vendas')
  const s = (await rt.openItem(item.id)) as ChartSession
  assert.ok(s.toSvg().startsWith('<svg'))
  s.update((d) => void (d.type = 'pie'))
  assert.equal(s.state.type, 'pie')
  assert.equal(rt.undo(item.id), true)
  assert.equal(s.state.type, 'bar')
  assert.equal((await rt.exportForLaunch(item.id, 'image'))?.mime, 'image/png')
})

test('music: tracks and notes persist across close/open; audio export via injected renderer', async () => {
  const rt = hubRt()
  const item = await rt.create('music', 'Beat')
  const s = (await rt.openItem(item.id)) as MusicSession
  const t = s.addTrack('Lead')
  s.addNote(t, { beat: 0, pitch: 60, length: 1 })
  assert.equal(s.duration(), 16)
  await rt.save(item.id, 'notas')
  rt.close(item.id)
  const again = (await rt.openItem(item.id)) as MusicSession
  assert.equal(again.state.tracks[0].notes.length, 1)
  assert.equal((await rt.exportForLaunch(item.id, 'audio'))?.mime, 'audio/wav')
})

test('audio: non-destructive regions; no renderer means no export', async () => {
  const rt = hubRt()
  const item = await rt.create('audio', 'Podcast')
  const s = (await rt.openItem(item.id)) as AudioSession
  s.setSource('abc123', 60)
  s.keepRegion(10, 20)
  s.keepRegion(30, 45)
  assert.equal(s.resultDuration(), 25)
  assert.throws(() => s.keepRegion(5, 5))
  assert.equal(await rt.exportForLaunch(item.id, 'audio'), undefined)
})

import { applyAudioEdit, decodeWav, encodeWav, renderSong } from '../src/index'

test('wav encode/decode round trip', () => {
  const pcm = { sampleRate: 8000, channels: [Float32Array.from([0, 0.5, -0.5, 1])] }
  const back = decodeWav(encodeWav(pcm))
  assert.equal(back.sampleRate, 8000)
  assert.equal(back.channels[0].length, 4)
  assert.ok(Math.abs(back.channels[0][1] - 0.5) < 0.001)
})

test('music renders real audio: right length, sound where notes are, silence elsewhere', () => {
  const song = { title: 't', bpm: 120, beatsPerBar: 4, bars: 1, tracks: [{ id: 'a', name: 'L', instrument: 'pluck' as const, volumeDb: 0, muted: false, notes: [{ beat: 0, pitch: 69, length: 1, velocity: 1 }] }] }
  const pcm = renderSong(song, 8000)
  const ch = pcm.channels[0]
  const energy = (a: number, b: number) => ch.slice(a, b).reduce((e, x) => e + Math.abs(x), 0)
  assert.ok(ch.length >= 2 * 8000) // one bar at 120 bpm = 2 s
  assert.ok(energy(0, 4000) > 100) // first beat (0.5 s) sounds
  assert.ok(energy(12000, 14000) < 1e-6) // long after the note and its release: silent
})

test('audio edit keeps regions, applies gain and fades', () => {
  const src = { sampleRate: 100, channels: [new Float32Array(1000).fill(0.5)] } // 10 s
  const edit = { title: 'e', source: 'h', durationSec: 10, gainDb: -6.0206, fadeInSec: 1, fadeOutSec: 0, keep: [{ id: 'r', start: 2, end: 6, label: '' }] }
  const out = applyAudioEdit(src, edit)
  assert.equal(out.channels[0].length, 400) // 4 s kept
  assert.ok(Math.abs(out.channels[0][399] - 0.25) < 0.01) // -6 dB halves the amplitude
  assert.equal(out.channels[0][0], 0) // fade-in starts silent
})

test('audio export end to end from a WAV asset in the store', async () => {
  const store = new MemoryAssetStore()
  const wav = encodeWav({ sampleRate: 100, channels: [new Float32Array(1000).fill(0.5)] })
  const ref = await store.put(wav, 'audio/wav')
  const rt = new CreativeRuntime({
    project: createProject('A'),
    store,
    adapters: [audioAdapter({ loadSource: async (h) => (await store.get(h))?.bytes })]
  })
  const item = await rt.create('audio', 'Corte')
  const s = (await rt.openItem(item.id)) as AudioSession
  s.setSource(ref.hash, 10)
  s.keepRegion(0, 2)
  const out = await rt.exportForLaunch(item.id, 'audio')
  assert.equal(out?.mime, 'audio/wav')
  assert.equal(decodeWav(out!.bytes).channels[0].length, 200)
})

import { buildFfmpegArgs, plotToSvg, vegaLiteToSvg, videoAdapter, type VideoSession } from '../src/index'

test('video: model edits and ffmpeg plan (trim, fit to canvas, concat, mixed audio)', async () => {
  const rt = new CreativeRuntime({
    project: createProject('V'),
    store: new MemoryAssetStore(),
    adapters: [videoAdapter({ render: async () => new Uint8Array([0, 0, 0, 24]) })]
  })
  const item = await rt.create('video', 'Reels')
  const s = (await rt.openItem(item.id)) as VideoSession
  const a = s.addClip('h1', 10)
  const b = s.addClip('h2', 5)
  s.trim(a, 2, 6)
  s.moveClip(b, 0)
  s.addAudio('m1', 1, -8)
  assert.equal(s.duration(), 9) // 5 + 4
  assert.deepEqual(s.state.clips.map((c) => c.id), [b, a])
  assert.throws(() => s.trim(a, 6, 2))

  const args = buildFfmpegArgs(s.state, { h1: '/m/h1.mp4', h2: '/m/h2.mp4', m1: '/m/m1.mp3' }, '/out.mp4')
  const graph = args[args.indexOf('-filter_complex') + 1]
  assert.deepEqual(args.filter((x) => x === '-i').length, 3)
  assert.ok(graph.includes('trim=start=2:end=6') && graph.includes('concat=n=2:v=1:a=1'))
  assert.ok(graph.includes('adelay=1000|1000') && graph.includes('volume=-8dB'))
  assert.equal(args[args.indexOf('-map') + 1], '[vout]')
  assert.equal(args.at(-1), '/out.mp4')
  assert.throws(() => buildFfmpegArgs(s.state, {}, '/o'), /No file for asset/)

  assert.equal((await rt.exportForLaunch(item.id, 'short_video'))?.mime, 'video/mp4')
  s.update((d) => void (d.clips[0].out = 400)) // > 3 min: not a short video
  assert.equal(await rt.exportForLaunch(item.id, 'short_video'), undefined)
  assert.ok(await rt.exportForLaunch(item.id, 'long_video'))
})

test('data viz: vega-lite and plot render svg without a browser', async () => {
  const data = [{ k: 'A', v: 3 }, { k: 'B', v: 5 }]
  const vl = await vegaLiteToSvg({ data: { values: data }, mark: 'bar', encoding: { x: { field: 'k', type: 'nominal' }, y: { field: 'v', type: 'quantitative' } } })
  assert.ok(vl.startsWith('<svg') && vl.includes('<path'))
  const pl = plotToSvg({ mark: 'barY', data, x: 'k', y: 'v' })
  assert.ok(pl.includes('<svg') && pl.includes('rect'))
})

import { sheetAdapter, type SheetSession } from '../src/index'

test('sheet: snapshot + cells persist, undo works, image export needs a renderer', async () => {
  const rt = new CreativeRuntime({ project: createProject('S'), store: new MemoryAssetStore(), adapters: [sheetAdapter({ renderImage: async () => new Uint8Array([1]) })] })
  const item = await rt.create('sheet', 'Orçamento')
  const s = (await rt.openItem(item.id)) as SheetSession
  s.setCell(1, 2, 42)
  assert.deepEqual(s.state.values[1], [null, null, 42])
  s.setSnapshot({ id: 'wb', sheets: {} }, [[1]])
  await rt.save(item.id)
  rt.close(item.id)
  const again = (await rt.openItem(item.id)) as SheetSession
  assert.equal((again.state.workbook as { id: string }).id, 'wb')
  assert.equal(rt.canUndo(item.id), false) // history belongs to an open session; reopening starts clean
  again.setCell(0, 0, 'x')
  assert.equal(rt.undo(item.id), true)
  assert.equal(again.state.values[0][0], 1)
  assert.equal((await rt.exportForLaunch(item.id, 'image'))?.mime, 'image/png')
})

test('design collab: two people edit one design; concurrent additions both survive; remote edits are not local undo', async () => {
  const hub = new MemoryHub()
  const store = new MemoryAssetStore()
  const mk = () => new CreativeRuntime({ project: createProject('C'), store, adapters: [designAdapter('design')], transport: hub.connect() })
  const a = mk()
  const item = await a.create('design', 'Capa')
  const b = new CreativeRuntime({ project: a.project, store, adapters: [designAdapter('design')], transport: hub.connect() })
  const sa = (await a.openItem(item.id)) as DesignSession
  const sb = (await b.openItem(item.id)) as DesignSession

  const frameOf = (s: DesignSession) => s.graph.getChildren(s.graph.getPages()[0].id)[0]
  const kids = (s: DesignSession) => s.graph.getChildren(frameOf(s).id).map((n) => n.id).sort()
  const start = kids(sa).length

  sa.graph.createNode('RECTANGLE', frameOf(sa).id, { name: 'da A', width: 10, height: 10 })
  assert.equal(kids(sb).length, start + 1) // arrived at B
  assert.equal(sb.graph.getNode(kids(sb).find((id) => sb.graph.getNode(id)!.name === 'da A')!)!.width, 10)
  assert.equal(b.canUndo(item.id), false) // B did not make that edit

  sb.graph.createNode('ELLIPSE', frameOf(sb).id, { name: 'do B', width: 20, height: 20 })
  assert.deepEqual(kids(sa), kids(sb)) // converged
  assert.equal(kids(sa).length, start + 2)

  const rect = [...sa.graph.getAllNodes()].find((n) => n.name === 'da A')!
  sa.graph.updateNode(rect.id, { x: 123 })
  assert.equal([...sb.graph.getAllNodes()].find((n) => n.name === 'da A')!.x, 123)
  sb.graph.deleteNode([...sb.graph.getAllNodes()].find((n) => n.name === 'do B')!.id)
  assert.deepEqual(kids(sa), kids(sb))
  assert.equal(kids(sa).length, start + 1)
})

test('video: split keeps total duration, fades move to the right half, texts and effects reach ffmpeg', async () => {
  const rt = new CreativeRuntime({ project: createProject('V'), store: new MemoryAssetStore(), adapters: [videoAdapter()] })
  const item = await rt.create('video', 'Edit')
  const s = (await rt.openItem(item.id)) as VideoSession
  const c1 = s.addClip('h1', 10)
  s.update((d) => Object.assign(d.clips[0], { fadeIn: 1, fadeOut: 2, brightness: 0.1 }))
  const c2 = s.splitClip(c1, 4)
  assert.equal(s.duration(), 10)
  assert.deepEqual(s.state.clips.map((c) => [c.in, c.out, c.fadeIn, c.fadeOut]), [[0, 4, 1, 0], [4, 10, 0, 2]])
  assert.equal(s.state.clips[1].id, c2)
  assert.throws(() => s.splitClip(c1, 0), /inside the clip/)
  assert.throws(() => s.splitClip(c1, 4), /inside the clip/) // the first half is now 4 s long
  s.addText('Olá', 1, 3)
  const args = buildFfmpegArgs(s.state, { h1: '/in' }, '/out', { fontFile: '/f.ttf', textFiles: { [s.state.texts![0].id]: '/t.txt' } })
  const graph = args[args.indexOf('-filter_complex') + 1]
  assert.match(graph, /fade=t=in:st=0:d=1/)
  assert.match(graph, /fade=t=out:st=4:d=2/)
  assert.match(graph, /eq=brightness=0\.1/)
  assert.match(graph, /drawtext=expansion=none/)
  assert.match(graph, /\[vout\]/)
  assert.throws(() => buildFfmpegArgs(s.state, { h1: '/in' }, '/out'), /font file/)
  s.removeText(s.state.texts![0].id)
  assert.equal(s.state.texts!.length, 0)
})

import { keyframeExpr, parseSrt } from '../src/index'

test('video: speed changes duration, split respects speed, SRT import, overlays, keyframe expression', async () => {
  const rt = new CreativeRuntime({ project: createProject('V'), store: new MemoryAssetStore(), adapters: [videoAdapter()] })
  const item = await rt.create('video', 'Edit')
  const s = (await rt.openItem(item.id)) as VideoSession
  const c = s.addClip('h', 10)
  s.update((d) => void (d.clips[0].speed = 2))
  assert.equal(s.duration(), 5)
  s.splitClip(c, 2) // 2 s of timeline = 4 s of source
  assert.deepEqual(s.state.clips.map((x) => [x.in, x.out]), [[0, 4], [4, 10]])
  assert.equal(s.duration(), 5)

  assert.equal(s.importSrt('1\n00:00:01,000 --> 00:00:02,500\nOi\n\n2\n00:00:03,000 --> 00:00:04,000\nTchau', 0.5), 2)
  assert.deepEqual(s.state.texts!.map((t) => [t.id, t.start, t.end]), [['cap_0', 1.5, 3], ['cap_1', 3.5, 4.5]])
  assert.equal(s.importSrt('1\n00:00:00,000 --> 00:00:01,000\nSó um'), 1) // replaces earlier captions
  assert.equal(s.state.texts!.length, 1)

  const o = s.addOverlay('h2', 3, 1)
  assert.equal(s.state.overlays![0].id, o)
  s.removeOverlay(o)
  assert.equal(s.state.overlays!.length, 0)

  assert.equal(keyframeExpr([{ t: 0, v: 1 }], 'T'), 'if(lt(T,0),1,1)')
  const e = keyframeExpr([{ t: 2, v: 1 }, { t: 0, v: 0 }], 'T') // unsorted input
  assert.match(e, /^if\(lt\(T,0\),0,if\(lt\(T,2\),0\+\(1\)\*\(T-0\)\/2,1\)\)$/)
  assert.throws(() => keyframeExpr([], 'T'))
  assert.deepEqual(parseSrt('garbage\n\nno times here'), [])
})
