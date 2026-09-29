import {execFileSync} from 'node:child_process'
import {mkdtempSync, readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

const require = createRequire(import.meta.url)
const ffmpeg: string = require('ffmpeg-static')

let cache: {video: Buffer; preview: Buffer; poster: Buffer} | undefined

/** Real media generated once per run: a 3s clip, a 1s preview, a PNG poster. */
export function fixtures() {
  if (cache) return cache
  const dir = mkdtempSync(join(tmpdir(), 'aqua-fixtures-'))
  const make = (name: string, args: string[]) => {
    const out = join(dir, name)
    execFileSync(ffmpeg, [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      ...args,
      out,
    ])
    return readFileSync(out)
  }
  cache = {
    video: make('video.mp4', [
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=3:size=640x360:rate=24',
      '-f',
      'lavfi',
      '-i',
      'sine=frequency=440:duration=3',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
    ]),
    preview: make('preview.mp4', [
      '-f',
      'lavfi',
      '-i',
      'testsrc=duration=1:size=320x180:rate=24',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
    ]),
    poster: make('poster.png', [
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:size=320x180',
      '-frames:v',
      '1',
    ]),
  }
  return cache
}
