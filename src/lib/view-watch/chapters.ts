/**
 * Chapters for the View watch page, read from the video's own text — the
 * same convention creators already use: one line per chapter, a timestamp
 * then a title, the first one at 0:00.
 *
 *   0:00 Saída
 *   0:48 A subida
 *   10:12 A cachoeira
 */

export type Chapter = {startSec: number; title: string}

const LINE =
  /^\s*(?:[-•*]\s*)?\(?((?:\d{1,2}:)?\d{1,2}:\d{2})\)?\s*[-–—:]?\s*(.+?)\s*$/

/** "1:02:03" / "12:48" → seconds; undefined when malformed. */
export function parseTimestamp(value: string): number | undefined {
  const parts = value.split(':').map(Number)
  if (parts.some(n => !Number.isInteger(n) || n < 0)) return undefined
  if (parts.length === 2) {
    const [m, s] = parts
    return s < 60 ? m * 60 + s : undefined
  }
  if (parts.length === 3) {
    const [h, m, s] = parts
    return m < 60 && s < 60 ? h * 3600 + m * 60 + s : undefined
  }
  return undefined
}

/**
 * Chapters only when the list is real: starts at 0:00, at least two
 * entries, strictly increasing, and (when the duration is known) inside it.
 */
export function parseChapters(text: string, durationSec?: number): Chapter[] {
  const found: Chapter[] = []
  for (const line of text.split('\n')) {
    const m = line.match(LINE)
    if (!m) continue
    const startSec = parseTimestamp(m[1])
    const title = m[2].trim().slice(0, 100)
    if (startSec === undefined || !title) continue
    found.push({startSec, title})
  }
  if (found.length < 2 || found[0].startSec !== 0) return []
  for (let i = 1; i < found.length; i++)
    if (found[i].startSec <= found[i - 1].startSec) return []
  if (durationSec && found[found.length - 1].startSec >= durationSec) return []
  return found
}

export function chapterAt(chapters: Chapter[], sec: number): number {
  let index = -1
  for (let i = 0; i < chapters.length; i++)
    if (chapters[i].startSec <= sec) index = i
  return index
}

/** 192 → "3:12", 3723 → "1:02:03". */
export function formatTime(totalSec: number): string {
  const sec = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  const ss = String(s).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`
}

/** Share-at-time parameter: "192", "192s", "3m12s", "1h2m3s". */
export function parseStartParam(value: unknown): number | undefined {
  if (typeof value !== 'string' || !value) return undefined
  if (/^\d+s?$/.test(value)) return parseInt(value, 10)
  const m = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!m || (!m[1] && !m[2] && !m[3])) return undefined
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
}

/**
 * Posts have no separate title field: the first line is the title (capped),
 * the rest is the description.
 */
export function splitTitle(text: string): {title: string; description: string} {
  const trimmed = text.trim()
  if (!trimmed) return {title: '', description: ''}
  const newline = trimmed.indexOf('\n')
  const first = newline === -1 ? trimmed : trimmed.slice(0, newline)
  if (first.length <= 100)
    return {
      title: first.trim(),
      description: newline === -1 ? '' : trimmed.slice(newline + 1).trim(),
    }
  const cut = first.lastIndexOf(' ', 100)
  const end = cut > 40 ? cut : 100
  return {title: `${first.slice(0, end).trim()}…`, description: trimmed}
}
