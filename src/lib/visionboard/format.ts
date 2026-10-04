/** "1323" → "1,3 mil" (pt-BR short form used on Visionboard counters). */
export function formatCount(n: number): string {
  if (n < 1000) return String(n)
  const short = (n / 1000).toFixed(1).replace('.', ',')
  return `${short.replace(/,0$/, '')} mil`
}
