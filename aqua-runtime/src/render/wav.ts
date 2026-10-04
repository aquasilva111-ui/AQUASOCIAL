export interface Pcm {
  sampleRate: number
  /** One Float32Array per channel, samples in -1..1. */
  channels: Float32Array[]
}

/** 16-bit PCM WAV. */
export function encodeWav(pcm: Pcm): Uint8Array {
  const ch = pcm.channels.length
  const frames = pcm.channels[0]?.length ?? 0
  const dataSize = frames * ch * 2
  const buf = new ArrayBuffer(44 + dataSize)
  const v = new DataView(buf)
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + dataSize, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, ch, true)
  v.setUint32(24, pcm.sampleRate, true)
  v.setUint32(28, pcm.sampleRate * ch * 2, true)
  v.setUint16(32, ch * 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, dataSize, true)
  let o = 44
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, pcm.channels[c][i]))
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      o += 2
    }
  }
  return new Uint8Array(buf)
}

export function decodeWav(bytes: Uint8Array): Pcm {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') throw new Error('Not a WAV file')
  let o = 12
  let ch = 0
  let rate = 0
  let bits = 0
  while (o + 8 <= bytes.byteLength) {
    const id = tag(o)
    const size = v.getUint32(o + 4, true)
    if (id === 'fmt ') {
      if (v.getUint16(o + 8, true) !== 1) throw new Error('Only PCM WAV is supported')
      ch = v.getUint16(o + 10, true)
      rate = v.getUint32(o + 12, true)
      bits = v.getUint16(o + 22, true)
    } else if (id === 'data') {
      if (bits !== 16) throw new Error('Only 16-bit WAV is supported')
      const frames = Math.floor(size / (ch * 2))
      const channels = Array.from({ length: ch }, () => new Float32Array(frames))
      let p = o + 8
      for (let i = 0; i < frames; i++)
        for (let c = 0; c < ch; c++) {
          const s = v.getInt16(p, true)
          channels[c][i] = s < 0 ? s / 0x8000 : s / 0x7fff
          p += 2
        }
      return { sampleRate: rate, channels }
    }
    o += 8 + size + (size % 2)
  }
  throw new Error('WAV has no data chunk')
}
