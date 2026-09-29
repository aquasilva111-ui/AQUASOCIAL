import {type ImageSource} from 'expo-image'

/**
 * Ad slots ("Views Frames") shown on Aqua Views between the topic chips and
 * the live row. Edit this list to change what runs in each frame.
 *
 * To place a creative: add the file under `assets/views-frames/` and set
 * `image: require('../../../assets/views-frames/<file>')`. A frame without
 * an image renders as an empty placeholder.
 */
export type ViewsFrame = {
  id: string
  /** Bundled image (require) or remote URL. */
  image?: ImageSource | number
  /** Where the frame opens: an in-app path (/...) or an https URL. */
  href?: string
  /** Screen-reader description of the creative. */
  alt: string
  /** Marks the frame as paid placement ("Patrocinado"). */
  sponsored?: boolean
}

export const VIEWS_FRAMES: ViewsFrame[] = [
  {id: 'frame-1', alt: 'Espaço de anúncio 1', sponsored: true},
  {id: 'frame-2', alt: 'Espaço de anúncio 2', sponsored: true},
  {id: 'frame-3', alt: 'Espaço de anúncio 3', sponsored: true},
]
