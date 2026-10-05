import {type ImageDropZoneProps} from './ImageDropZone.types'

export type {DroppedFile, ImageDropZoneProps} from './ImageDropZone.types'

/**
 * Native: dragging files in is a desktop-web gesture, so there is no drop
 * zone here. (A picker button for phones is a separate step.)
 */
export function ImageDropZone(_props: ImageDropZoneProps) {
  return null
}
