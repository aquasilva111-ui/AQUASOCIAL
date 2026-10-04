import type { Cue, Keyframe } from 'aqua-runtime/src/adapters/video'

/** Same interpolation as the render's `keyframeExpr`: linear, constant outside the keyed range. */
export function sample(keys: Keyframe[] | undefined, t: number, fallback: number): number {
  if (!keys?.length) return fallback
  const k = [...keys].sort((a, b) => a.t - b.t)
  if (t <= k[0].t) return k[0].v
  for (let i = 1; i < k.length; i++) {
    if (t < k[i].t) return k[i - 1].v + ((k[i].v - k[i - 1].v) * (t - k[i - 1].t)) / Math.max(k[i].t - k[i - 1].t, 0.001)
  }
  return k[k.length - 1].v
}

/** Two keyframes: the value at the start and at `end` seconds. Empty when both are the same. */
export const twoKeys = (from: number, to: number, end: number): Keyframe[] | undefined => (from === to ? undefined : [{ t: 0, v: from }, { t: Math.max(end, 0.1), v: to }])

let asr: Promise<(audio: Float32Array, opts: Record<string, unknown>) => Promise<{ chunks?: { text: string; timestamp: [number, number | null] }[] }>> | null = null

/**
 * Speech to subtitles, fully in the browser (Whisper tiny through transformers.js). The model
 * (~40 MB) is downloaded once from the Hugging Face hub and cached by the browser.
 */
export async function transcribe(bytes: Uint8Array, language: string, onStatus: (s: string) => void): Promise<Cue[]> {
  onStatus('Decodificando áudio…')
  const ctx = new AudioContext({ sampleRate: 16000 })
  let audio: Float32Array
  try {
    audio = (await ctx.decodeAudioData(bytes.slice().buffer)).getChannelData(0).slice()
  } finally {
    void ctx.close()
  }
  onStatus('Baixando modelo de voz (só na primeira vez)…')
  asr ??= import('@huggingface/transformers').then(async ({ pipeline }) => (await pipeline('automatic-speech-recognition', 'Xenova/whisper-tiny', { dtype: 'q8' })) as never)
  const run = await asr
  onStatus('Transcrevendo…')
  const out = await run(audio, { return_timestamps: true, chunk_length_s: 30, stride_length_s: 5, ...(language ? { language, task: 'transcribe' } : {}) })
  return (out.chunks ?? [])
    .map((c) => ({ start: c.timestamp[0], end: c.timestamp[1] ?? c.timestamp[0] + 2, text: c.text.trim() }))
    .filter((c) => c.text && c.end > c.start)
}
