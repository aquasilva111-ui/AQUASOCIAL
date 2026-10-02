export type Drop = {
  id: string
  uri: string
  poster: string
  author: string
  caption: string
  likes: number
  comments: number
}

const mixkit = (id: string) =>
  `https://assets.mixkit.co/videos/${id}/${id}-1080.mp4`
const poster = (id: string) =>
  `https://assets.mixkit.co/videos/${id}/${id}-thumb-720-0.jpg`

const BASE: Omit<Drop, 'id'>[] = [
  ['34487', 'mara.films', 'Golden hour never gets old', 12400, 387],
  ['39767', 'tokyo_nights', 'Shot on a rainy Tuesday', 9200, 214],
  ['1164', 'lensbyleo', 'Slow mornings', 7100, 96],
  ['5271', 'riverside', 'Somewhere between here and there', 5800, 71],
  ['39875', 'nordic.trail', 'First try, no edits', 4300, 52],
  ['34560', 'amelie', 'This view though', 3900, 44],
].map(([v, author, caption, likes, comments]) => ({
  uri: mixkit(v as string),
  poster: poster(v as string),
  author: author as string,
  caption: caption as string,
  likes: likes as number,
  comments: comments as number,
}))

/** Example data until Drops reads the real Aqua feed. */
export function makeDrops(count: number, offset = 0): Drop[] {
  return Array.from({length: count}, (_, i) => {
    const n = offset + i
    return {...BASE[n % BASE.length], id: `drop-${n}`}
  })
}
