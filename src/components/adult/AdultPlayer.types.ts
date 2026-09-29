export type AdultPlayerProps = {
  /** Returns a fresh, signed, absolute playback URL (or undefined if denied). */
  authorize: () => Promise<string | undefined>
  onProgress?: (positionMs: number, durationMs?: number) => void
  autoPlay?: boolean
}
