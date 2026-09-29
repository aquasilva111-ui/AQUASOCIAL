/**
 * Validates uploads by their real content (magic bytes), not by extension
 * or declared MIME type.
 */
export type SniffedType = {mime: string; kind: 'video' | 'image' | 'captions'}

export function sniff(head: Buffer): SniffedType | undefined {
  const at = (offset: number, bytes: number[]) =>
    bytes.every((b, i) => head[offset + i] === b)
  const ascii = (offset: number, text: string) =>
    head.subarray(offset, offset + text.length).toString('latin1') === text

  if (ascii(4, 'ftyp')) {
    const brand = head.subarray(8, 12).toString('latin1')
    if (brand.startsWith('qt')) return {mime: 'video/quicktime', kind: 'video'}
    return {mime: 'video/mp4', kind: 'video'}
  }
  if (at(0, [0x1a, 0x45, 0xdf, 0xa3]))
    return {mime: 'video/webm', kind: 'video'}
  if (at(0, [0xff, 0xd8, 0xff])) return {mime: 'image/jpeg', kind: 'image'}
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return {mime: 'image/png', kind: 'image'}
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP'))
    return {mime: 'image/webp', kind: 'image'}
  if (ascii(0, 'WEBVTT') || ascii(3, 'WEBVTT'))
    return {mime: 'text/vtt', kind: 'captions'}
  return undefined
}

export const ALLOWED_MIME: Record<string, string[]> = {
  video: ['video/mp4', 'video/webm', 'video/quicktime'],
  image: ['image/jpeg', 'image/png', 'image/webp'],
  captions: ['text/vtt'],
}
