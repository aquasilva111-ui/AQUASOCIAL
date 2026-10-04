import {type Aesthetic} from '#/lib/visionboard/aesthetics'

/**
 * Native: no pixel access without a native module, so there is no signature
 * here yet. Pins saved on native carry no `aesthetic` and are ranked by tags
 * and creator until one exists; web fills it in (see extract.web.ts).
 */
export async function extractAesthetic(
  _url: string,
): Promise<Aesthetic | undefined> {
  return undefined
}
