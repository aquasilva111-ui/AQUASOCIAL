// server/routes/placeholder/[seed].svg.ts
// Imagem de demonstração autocontida: gradiente azul AQUA determinado pelo "seed".
export default defineEventHandler(event => {
  const seed = (getRouterParam(event, 'seed') || 'aqua').replace(/\.svg$/, '');
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const hue = 205 + (h % 60);
  const a = `hsl(${hue} 85% 55%)`;
  const b = `hsl(${hue + 30} 90% 30%)`;
  setHeader(event, 'Content-Type', 'image/svg+xml; charset=utf-8');
  setHeader(event, 'Cache-Control', 'public, max-age=86400');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="600" height="800" fill="url(#g)"/><path d="M300 270c-70 90-110 150-110 205a110 110 0 0 0 220 0c0-55-40-115-110-205z" fill="#fff" fill-opacity=".25"/></svg>`;
});
