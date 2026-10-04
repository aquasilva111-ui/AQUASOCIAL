/// <reference lib="dom" />
import {type Aesthetic, aestheticFromPixels} from '#/lib/visionboard/aesthetics'

const SIZE = 48
const CACHE_LIMIT = 500
const cache = new Map<string, Aesthetic | undefined>()

/**
 * Reads an image's look in the browser: draws a small copy to a canvas and
 * hands the pixels to the pure extractor. Resolves undefined (never throws)
 * if the image fails to load or the CDN does not allow pixel reads (CORS).
 */
export function extractAesthetic(url: string): Promise<Aesthetic | undefined> {
  if (cache.has(url)) return Promise.resolve(cache.get(url))
  return new Promise(resolve => {
    const done = (value: Aesthetic | undefined) => {
      if (cache.size >= CACHE_LIMIT) cache.delete(cache.keys().next().value!)
      cache.set(url, value)
      resolve(value)
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => {
      try {
        const scale = Math.min(
          1,
          SIZE / Math.max(img.naturalWidth, img.naturalHeight),
        )
        const width = Math.max(1, Math.round(img.naturalWidth * scale))
        const height = Math.max(1, Math.round(img.naturalHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d', {willReadFrequently: true})
        if (!ctx) return done(undefined)
        ctx.drawImage(img, 0, 0, width, height)
        const {data} = ctx.getImageData(0, 0, width, height)
        done(aestheticFromPixels({data, width, height}))
      } catch {
        // A tainted canvas throws on getImageData.
        done(undefined)
      }
    }
    img.onerror = () => done(undefined)
    img.src = url
  })
}
