export type DroppedFile = Blob & {name: string}

export type ImageDropZoneProps = {
  onFiles: (files: DroppedFile[]) => void
  /** An upload is running: the zone is shown but ignores new drops. */
  busy?: boolean
  /** Progress text such as "2/5" while busy. */
  progress?: string
  /** One slim row instead of the large empty-state box. */
  compact?: boolean
  /** Text/border colour, so the zone follows the board's theme. */
  color: string
}
