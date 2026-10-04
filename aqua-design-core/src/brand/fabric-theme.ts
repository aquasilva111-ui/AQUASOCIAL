import { FabricObject } from 'fabric'

import { AQUA } from './tokens'

export const AQUA_CANVAS = {
  /** Workspace behind the artboard. */
  backgroundLight: AQUA.surface,
  backgroundDark: AQUA.darkBg
} as const

/**
 * Selection handles and borders in AQUA blue (round white-filled corners, no heavy chrome).
 * Call once before creating a canvas; it changes Fabric's global object defaults.
 */
export function applyAquaFabricTheme(): void {
  Object.assign(FabricObject.ownDefaults, {
    borderColor: AQUA.blue,
    borderScaleFactor: 1.5,
    cornerColor: AQUA.white,
    cornerStrokeColor: AQUA.blue,
    cornerStyle: 'circle',
    cornerSize: 10,
    transparentCorners: false,
    padding: 0,
    borderOpacityWhenMoving: 0.6,
    lockUniScaling: false
  })
}
