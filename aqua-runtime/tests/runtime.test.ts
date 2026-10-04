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

import { defaultMix, mixAdapter, renderMix, resample, type MixSession, type Pcm } from '../src/index'
import { decodeWav as decodeWavFile } from '../src/render/wav'

const tone = (hz: number, sec: number, rate = 8000): Pcm => ({ sampleRate: rate, channels: [Float32Array.from({ length: Math.floor(sec * rate) }, (_, i) => 0.5 * Math.sin((2 * Math.PI * hz * i) / rate))] })
const rms = (a: Float32Array, from = 0, to = a.length) => Math.sqrt(a.slice(from, to).reduce((s, v) => s + v * v, 0) / Math.max(1, to - from))

test('mix render: placement, pan, mute, solo, fades, gain, resample', () => {
  const m = defaultMix('m')
  m.tracks.push(
    { id: 'a', name: 'A', volumeDb: 0, pan: -1, muted: false, solo: false, clips: [{ id: 'c1', asset: 'x', start: 1, in: 0, out: 1, gainDb: 0, fadeIn: 0, fadeOut: 0 }] },
    { id: 'b', name: 'B', volumeDb: -6.0206, pan: 1, muted: false, solo: false, clips: [{ id: 'c2', asset: 'x', start: 1, in: 0, out: 1, gainDb: 0, fadeIn: 0.5, fadeOut: 0 }] }
  )
  const src = { x: tone(440, 1) }
  const out = renderMix(m, src, 8000)
  assert.equal(out.channels.length, 2)
  assert.equal(out.channels[0].length, 16000) // 2 s: clip placed at 1 s
  assert.ok(rms(out.channels[0], 0, 7000) < 1e-9) // silence before the clip
  const [l, r] = [rms(out.channels[0], 8000, 16000), rms(out.channels[1], 8000, 16000)]
  assert.ok(l > 0.3 && r > 0.1) // A hard left (unity*1.41), B hard right at half amplitude
  // fade-in on B: the first quarter second of the right channel is quieter than the last
  assert.ok(rms(out.channels[1], 8000, 9000) < rms(out.channels[1], 15000, 16000))
  // A is hard left: the left channel carries it, the right channel only has B
  assert.ok(rms(out.channels[0], 8000, 16000) > rms(out.channels[1], 8000, 16000))

  m.tracks[0].muted = true
  assert.ok(rms(renderMix(m, src, 8000).channels[0], 8000, 16000) < 1e-9) // left is only A, which is muted
  m.tracks[0].muted = false
  m.tracks[1].solo = true
  assert.ok(rms(renderMix(m, src, 8000).channels[0], 8000, 16000) < 1e-9) // A is silenced by solo on B
  m.tracks[1].solo = false
  m.masterDb = -20
  assert.ok(rms(renderMix(m, src, 8000).channels[0], 8000, 16000) < l / 5)

  assert.equal(resample(new Float32Array(8000), 8000, 16000).length, 16000)
  assert.equal(renderMix(defaultMix('empty'), {}).channels[0].length, 0)
  assert.equal(renderMix(m, {}).channels[0].length, 88200) // missing source: silent, but the length is still the project's
})

test('mix session: add, move across tracks, trim keeps audio in place, split, export through the runtime', async () => {
  const store = new MemoryAssetStore()
  const wav = (await import('../src/render/wav')).encodeWav(tone(440, 2))
  const ref = await store.put(wav, 'audio/wav')
  const rt = new CreativeRuntime({ project: createProject('M'), store, adapters: [mixAdapter({ loadSource: async (h) => (await store.get(h))?.bytes })] })
  const item = await rt.create('mix', 'Mix')
  const s = (await rt.openItem(item.id)) as MixSession
  const t1 = s.addTrack()
  const t2 = s.addTrack('Voz')
  const c = s.addClip(t1, ref.hash, 2, 1)
  assert.equal(s.duration(), 3)
  s.trimClip(c, 0.5, 1.5) // drop the first half second: the rest stays where it was heard (start 1 -> 1.5)
  assert.deepEqual([s.state.tracks[0].clips[0].start, s.state.tracks[0].clips[0].in, s.state.tracks[0].clips[0].out], [1.5, 0.5, 1.5])
  assert.throws(() => s.trimClip(c, 1, 1.01), /Invalid trim/)
  const second = s.splitClip(c, 2)
  assert.deepEqual(s.state.tracks[0].clips.map((x) => [x.start, x.in, x.out]), [[1.5, 0.5, 1], [2, 1, 1.5]])
  assert.throws(() => s.splitClip(c, 1.5), /inside the clip/)
  s.moveClip(second, 4, t2)
  assert.equal(s.state.tracks[0].clips.length, 1)
  assert.equal(s.state.tracks[1].clips[0].start, 4)
  const out = await rt.exportForLaunch(item.id, 'audio')
  assert.equal(out?.mime, 'audio/wav')
  assert.ok(Math.abs(decodeWavFile(out!.bytes).channels[0].length / 44100 - 4.5) < 0.01) // 4 s + 0.5 s clip
  s.removeClip(c)
  s.removeTrack(t2)
  assert.equal(s.state.tracks.length, 1)
  assert.equal(rt.canUndo(item.id), true)
})

test('music: note editing, solo and clamps', async () => {
  const rt = new CreativeRuntime({ project: createProject('S'), store: new MemoryAssetStore(), adapters: [musicAdapter()] })
  const item = await rt.create('music', 'Song')
  const s = (await rt.openItem(item.id)) as MusicSession
  const a = s.addTrack('A')
  const b = s.addTrack('B')
  s.addNote(a, { beat: 0, pitch: 60, length: 1 })
  s.addNote(b, { beat: 0, pitch: 72, length: 1 })
  s.updateNote(a, 0, { beat: -3, length: 0, pitch: 200, velocity: 5 })
  assert.deepEqual(s.state.tracks[0].notes[0], { beat: 0, pitch: 127, length: 0.0625, velocity: 1 })
  assert.throws(() => s.updateNote(a, 5, {}), /Note not found/)
  s.updateNote(a, 0, { pitch: 60, length: 1, velocity: 0.8 })
  const both = rms(renderSong(s.state).channels[0])
  s.update((d) => void (d.tracks[1].solo = true))
  const onlyB = rms(renderSong(s.state).channels[0])
  assert.ok(onlyB > 0 && onlyB < both * 1.5 && Math.abs(onlyB - both) > 1e-6)
  s.removeNote(a, 0)
  assert.equal(s.state.tracks[0].notes.length, 0)
  s.removeTrack(b)
  assert.equal(s.state.tracks.length, 1)
})

import { docStatsFromBytes, docStatsFromXml, editSessions, wordSeries } from '../src/index'
import * as YY from 'yjs'

test('doc analytics: counts, structure, readability, keywords, sessions', () => {
  const xml =
    '<blockgroup>' +
    '<blockcontainer id="1"><heading level="1" textColor="default">Meu título</heading></blockcontainer>' +
    '<blockcontainer id="2"><paragraph>O gato dorme no sofá. O gato <bold>acorda</bold> cedo! Será que o gato come?</paragraph></blockcontainer>' +
    '<blockcontainer id="3"><heading level="2">Lista</heading></blockcontainer>' +
    '<blockcontainer id="4"><bulletListItem>primeiro gato</bulletListItem></blockcontainer>' +
    '<blockcontainer id="5"><numberedListItem>segundo</numberedListItem></blockcontainer>' +
    '<blockcontainer id="6"><checkListItem checked="true">feito</checkListItem></blockcontainer>' +
    '<blockcontainer id="7"><checkListItem checked="false">falta</checkListItem></blockcontainer>' +
    '<blockcontainer id="8"><image url="data:x"></image></blockcontainer>' +
    '<blockcontainer id="9"><codeBlock>const nao = contar</codeBlock></blockcontainer>' +
    '<blockcontainer id="10"><paragraph></paragraph></blockcontainer>' +
    '</blockgroup>'
  const s = docStatsFromXml(xml)
  assert.deepEqual(s.headings, [{ level: 1, text: 'Meu título' }, { level: 2, text: 'Lista' }])
  assert.equal(s.sentences, 3) // the heading and the code are not sentences
  assert.equal(s.paragraphs, 1) // the empty paragraph does not count
  assert.deepEqual([s.bullets, s.numbered, s.images, s.codeBlocks], [1, 1, 1, 1])
  assert.deepEqual(s.checks, { done: 1, total: 2 })
  assert.equal(s.keywords[0].word, 'gato')
  assert.equal(s.keywords[0].count, 4) // 3 in the paragraph + 1 in the list
  assert.ok(!s.keywords.some((k) => k.word === 'contar')) // code is excluded
  assert.ok(s.words > 15 && s.readingMin > 0 && s.speakingMin > s.readingMin)
  assert.ok(s.uniqueRatio > 0 && s.uniqueRatio < 1)
  assert.ok(['muito fácil', 'fácil'].includes(s.readingLevel)) // short sentences, short words
  assert.equal(docStatsFromXml('').words, 0)
  assert.equal(docStatsFromXml('').readingLevel, '—')

  // from real stored bytes
  const doc = new YY.Doc()
  const frag = doc.getXmlFragment(DOCS_FRAGMENT)
  const para = new YY.XmlElement('paragraph')
  para.insert(0, [new YY.XmlText('uma frase simples aqui.')])
  const bc = new YY.XmlElement('blockcontainer')
  bc.insert(0, [para])
  const bg = new YY.XmlElement('blockgroup')
  bg.insert(0, [bc])
  frag.insert(0, [bg])
  const fromBytes = docStatsFromBytes(docsAdapter.open(YY.encodeStateAsUpdate(doc)).serialize())
  assert.equal(fromBytes.words, 4)
  assert.equal(fromBytes.sentences, 1)

  const series = wordSeries([{ at: '2026-01-02T00:00:00Z', message: 'b', words: 30 }, { at: '2026-01-01T00:00:00Z', message: 'a', words: 10 }])
  assert.deepEqual(series.map((p) => [p.words, p.delta]), [[10, 10], [30, 20]])
  const ed = editSessions(['2026-01-01T10:00:00Z', '2026-01-01T10:10:00Z', '2026-01-01T15:00:00Z', '2026-01-01T15:05:00Z'])
  assert.equal(ed.sessions, 2)
  assert.equal(ed.activeMin, 15)
  assert.deepEqual(editSessions([]), { sessions: 0, activeMin: 0 })
})
