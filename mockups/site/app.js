/* Runtime do mockup: molduras (celular/desktop), navegação, sobreposições e mapa de telas. */

const state = {
  scr: 'home', mode: 'both', light: false, hist: [], tab: {}, ov: null, drop: 0,
  liked: new Set(), rt: new Set(), follow: new Set(),
};

/* [id, rótulo, status?, url externa?]  status: ok (padrão se existir tela) | ext | todo */
const MAP = [
  ['Principal', [['home', 'Início'], ['thread', 'Post e respostas'], ['drops', 'Drops'], ['search', 'Buscar'], ['notifications', 'Notificações'], ['messages', 'Mailssage'], ['chat', 'Conversa (celular)'], ['profile', 'Perfil']]],
  ['Mídia', [['views', 'Streams'], ['visionboard', 'Visionboard'], ['reads', 'Reads'], ['noticias', 'Notícias e Convenções'], ['music', 'Música'], ['_', 'Stories (criar e ver)', 'todo'], ['_', 'Go live', 'todo']]],
  ['Criar', [['hub', 'Creative Hub'], ['_', 'Docs', 'ext', '../../aqua-docs/index.html'], ['_', 'Design', 'ext', '../../aqua-studio/index.html'], ['_', 'Sheets', 'ext', '../../aqua-sheets/index.html'], ['_', 'Music Studio', 'ext', '../../docs/music-studio/mockup.html'], ['_', 'Launch Hub', 'ext', '../../docs/launch-hub/mockup.html'], ['_', 'Reads Studio', 'todo']]],
  ['Comércio', [['_', 'Shops (loja e checkout Pix)', 'todo']]],
  ['Sistema', [['uiai', 'IU & AI'], ['adult', '+18 Content (porta)'], ['_', '+18 interno', 'ext', '../../docs/aqua-adult/mockups.html'], ['settings', 'Configurações'], ['_', 'Entrar, cadastro e onboarding', 'todo'], ['_', 'Wiki', 'todo'], ['_', 'Feeds, listas e starter packs', 'todo'], ['_', 'Perfil de terceiros e seguidores', 'todo'], ['_', 'Moderação', 'todo'], ['_', 'Termos, privacidade e ajuda', 'todo'], ['_', 'Estados: vazio, erro e carregando', 'todo']]],
];
const statusOf = it => it[2] || (SCREENS[it[0]] ? 'ok' : 'todo');

const NAV = [
  ['home', 'Início', 'home'], ['drops', 'Drops', 'drops'], ['search', 'Buscar', 'search'], ['notifications', 'Notificações', 'bell', 3], ['messages', 'Mailssage', 'mail', 2],
  ['views', 'Streams', 'video'], ['visionboard', 'Visionboard', 'image'], ['reads', 'Reads', 'book'], ['noticias', 'Notícias', 'news'],
  ['uiai', 'IU & AI', 'cpu'], ['adult', '+18 Content', 'lock'], ['settings', 'Configurações', 'settings'],
];
const $ = s => document.querySelector(s);
const stage = $('#stage'), side = $('#side');

/* ---------- partes comuns ---------- */
function topM(s) {
  if (s.top === 'none') return '';
  const me = `<button class="ib" data-act="open" data-v="drawer" aria-label="Menu">${av(ME, 32)}</button>`;
  let row;
  if (s.top === 'main') row = `${me}<div class="title"><span class="wm" style="justify-content:center"><i></i>AQUA</span></div><button class="ib" data-go="search" aria-label="Buscar">${ico('search')}</button>`;
  else if (s.top === 'tab') row = `${me}<div class="title">${s.title}</div><button class="ib" data-act="noop">${ico('more')}</button>`;
  else row = `<button class="ib" data-act="back" aria-label="Voltar">${ico('back')}</button><div class="title">${s.title}</div><span class="slot"></span>`;
  return `<div class="mtop"><div class="row">${row}</div>${tabsHtml(s)}</div>`;
}
function tabsHtml(s) {
  if (!s.tabs) return '';
  const t = state.tab[s.id] || 0;
  return `<div class="tabs">${s.tabs.map((x, i) => `<button class="${i === t ? 'on' : ''}" data-act="tab" data-i="${i}">${x}</button>`).join('')}</div>`;
}
function bottomBar(s) {
  const b = (id, icon, extra = '') => `<button class="${s.nav === id ? 'on' : ''}" data-go="${id}" aria-label="${id}">${ico(icon)}${extra}</button>`;
  return `<nav class="bbar">${b('home', 'home')}${b('drops', 'drops')}<button class="mk" data-act="open" data-v="create" aria-label="Criar">${ico('plus')}</button>
    ${b('messages', 'mail', '<span class="badge">2</span>')}${b('notifications', 'bell', '<span class="badge">3</span>')}${b('profile', 'user')}</nav>`;
}
function createSheet() {
  const o = [['pen', 'Post', 'linear-gradient(135deg,#1185fe,#002bef)', 'compose'], ['drops', 'Drop', 'linear-gradient(135deg,#f04c24,#ffb347)', 'drops'], ['story', 'Story', 'linear-gradient(135deg,#a855f7,#ec4899)', 'noop'],
    ['live', 'Ao vivo', 'linear-gradient(135deg,#e11d48,#fb7185)', 'noop'], ['image', 'Visionboard', 'linear-gradient(135deg,#0ea5e9,#22d3ee)', 'visionboard'], ['doc', 'Documento', 'linear-gradient(135deg,#6d28d9,#3b82f6)', 'hub'],
    ['book', 'Livro', 'linear-gradient(135deg,#7c2d12,#fb923c)', 'reads'], ['music', 'Música', 'linear-gradient(135deg,#059669,#34d399)', 'music'], ['grid', 'Creative Hub', 'linear-gradient(135deg,#002bef,#009eff)', 'hub']];
  return `<div class="ovl"><div class="scrim" data-act="close"></div><div class="sheet"><div class="grab"></div><h3>Criar</h3>
    <div class="sgrid">${o.map(x => x[3] === 'compose' ? `<button data-act="open" data-v="compose">${gi(x[0], x[2])}${x[1]}</button>` : x[3] === 'noop' ? `<button data-act="close">${gi(x[0], x[2])}${x[1]}</button>` : `<button data-go="${x[3]}">${gi(x[0], x[2])}${x[1]}</button>`).join('')}</div></div></div>`;
}
function composer(d) {
  const inner = `<div class="mh"><button class="ib" data-act="close" aria-label="Fechar">${ico('x')}</button><button class="btn" data-act="close">Publicar</button></div>
    <div class="composer">${av(ME, 44)}<div class="tx">O que está acontecendo?</div></div>
    <div class="ctools"><span class="ib">${ico('image')}</span><span class="ib">${ico('drops')}</span><span class="ib">${ico('live')}</span><span class="ib">${ico('music')}</span><span class="sp"></span><span class="mut" style="font-size:13px">300</span></div>`;
  return d ? `<div class="modal"><div class="scrim" data-act="close"></div><div class="box">${inner}</div></div>` : `<div class="ovl"><div class="scrim" data-act="close"></div><div class="sheet" style="padding:6px 0 30px">${inner}</div></div>`;
}
function drawer(s) {
  const more = [['hub', 'Creative Hub', 'grid'], ['music', 'Música', 'music']];
  const mk = (id, l, i) => `<button class="menu ${s.nav === id || s.id === id ? 'on' : ''}" data-go="${id}">${ico(i)}${l}</button>`;
  return `<div class="ovl"><div class="scrim" data-act="close"></div><aside class="drawer">
    <div class="me">${ring(ME, 56)}<b>${ME.n}</b><span>@aqua.aquaapp.online</span><div class="fl"><span><b>248</b> seguindo</span><span><b>1,2 mil</b> seguidores</span></div></div><hr>
    ${mk('profile', 'Perfil', 'user')}${mk('views', 'Streams', 'video')}${mk('visionboard', 'Visionboard', 'image')}${mk('reads', 'Reads', 'book')}${mk('noticias', 'Notícias', 'news')}
    ${more.map(m => mk(m[0], m[1], m[2])).join('')}${mk('uiai', 'IU & AI', 'cpu')}${mk('adult', '+18 Content', 'lock')}<hr>${mk('settings', 'Configurações', 'settings')}
    <div class="ft"><span>Feedback</span><span>Ajuda</span><span>Termos</span><span>Privacidade</span></div></aside></div>`;
}

/* ---------- molduras ---------- */
function phone(s) {
  const body = s.render(false);
  const ov = state.ov === 'create' ? createSheet() : state.ov === 'drawer' ? drawer(s) : state.ov === 'compose' ? composer(false) : '';
  const fixed = s.top === 'none' || s.id === 'chat';
  return `<div class="dev m ${state.light ? 'light' : ''}"><div class="phone"><div class="screen">
    <div class="island"></div><div class="sbar ${s.top === 'none' ? 'over' : ''}"><span>9:41</span><span>●●●● 5G ▮</span></div>
    ${topM(s)}<div class="scroll" data-sc="m" ${fixed ? 'style="overflow:hidden"' : ''}>${body}</div>${bottomBar(s)}${ov}</div></div></div>`;
}
function rail() {
  const tr = [['#AquaMusic', '12,4 mil posts'], ['Convenções de realidade', '8,1 mil posts'], ['Drops', '5,7 mil posts']];
  return `<aside class="rail"><div class="sbox">${ico('search')}<span>Buscar</span></div>
    <div class="card"><h3>Hubs</h3>${[['hub', 'grid', 'Creative Hub', 'Docs, Design, Sheets', 'linear-gradient(135deg,#002bef,#009eff)'], ['music', 'music', 'Música', 'Spotify e Apple Music', 'linear-gradient(135deg,#059669,#34d399)']].map(h => `<button class="rw" data-go="${h[0]}" style="width:100%;text-align:left">${gi(h[1], h[4])}<div class="t"><b>${h[2]}</b><span>${h[3]}</span></div></button>`).join('')}</div>
    <div class="card"><h3>Em alta</h3>${tr.map(t => `<div class="rw"><div class="t"><span>Assunto do momento</span><b>${t[0]}</b><span>${t[1]}</span></div></div>`).join('')}<a class="more" data-go="search">Mostrar mais</a></div>
    <div class="card"><h3>Quem seguir</h3>${['mare', 'bia', 'caio'].map(k => `<div class="rw">${av(P[k], 40)}<div class="t"><b>${P[k].n}</b><span>@${P[k].h}.aquaapp.online</span></div><button class="btn sm" data-act="follow" data-k="${k}">${state.follow.has(k) ? 'Seguindo' : 'Seguir'}</button></div>`).join('')}</div>
    <div class="fine"><span>Termos</span><span>Privacidade</span><span>Diretrizes</span><span>© AQUA</span></div></aside>`;
}
function desktop(s0) {
  const s = s0.mobileOnly ? SCREENS.messages : s0;
  const body = s.render(true);
  const head = s.top === 'none' ? '' : `<div class="dhead"><div class="row">${s.top === 'sub' ? `<button class="ib" data-act="back" aria-label="Voltar">${ico('back')}</button>` : ''}<h2>${s.title}</h2><span class="ib">${ico('more')}</span></div>${tabsHtml(s)}</div>`;
  const path = s.id === 'home' ? '' : s.id;
  const nav = NAV.map(n => `<button class="nv ${s.nav === n[0] ? 'on' : ''}" data-go="${n[0]}">${ico(n[2])}<span>${n[1]}</span>${n[3] ? `<span class="badge">${n[3]}</span>` : ''}</button>`).join('');
  const ov = state.ov === 'create' || state.ov === 'compose' ? composer(true) : '';
  return `<div class="dev d ${state.light ? 'light' : ''}"><div class="browser"><div class="chrome"><i></i><i></i><i></i><div class="url">${ico('lock')} aquaapp.online/${path}</div></div>
    <div class="dapp"><div class="dwrap"><aside class="lnav"><div class="wm"><i></i>AQUA</div>${nav}<button class="pub" data-act="open" data-v="compose">Publicar</button>
      <button class="acct" data-go="profile">${av(ME, 40)}<div><b>${ME.n}</b><span>@aqua.aquaapp.online</span></div></button></aside>
      <section class="dcol ${s.rail ? '' : 'full'}">${head}<div class="scroll" data-sc="d" ${s.flush ? 'style="overflow:hidden"' : ''}>${body}</div></section>${s.rail ? rail() : ''}</div>${ov}</div></div></div>`;
}

/* ---------- pintura e encaixe ---------- */
function paint(keep = true) {
  const s = SCREENS[state.scr];
  const sc = {};
  stage.querySelectorAll('[data-sc]').forEach(el => sc[el.dataset.sc] = el.scrollTop);
  const dims = {m: [410, 864], d: [1280, 840]};
  const wrap = (k, html) => `<div class="fx" data-fx="${k}" style="width:${dims[k][0]}px;height:${dims[k][1]}px"><div class="fi">${html}</div></div>`;
  stage.innerHTML = (state.mode !== 'd' ? wrap('m', phone(s)) : '') + (state.mode !== 'm' ? wrap('d', desktop(s)) : '');
  stage.querySelectorAll('[data-sc]').forEach(el => el.scrollTop = keep ? (sc[el.dataset.sc] || 0) : 0);
  fit(); renderSide(); renderBar();
}
function fit() {
  const W = stage.clientWidth - 48, H = stage.clientHeight - 48, m = state.mode;
  let s = m === 'm' ? Math.min(W / 410, H / 864) : m === 'd' ? Math.min(W / 1280, H / 840) : Math.min(W / (410 + 1280 + 40), H / 864);
  s = Math.max(0.28, Math.min(1, s));
  stage.querySelectorAll('.fx').forEach(fx => {
    const k = fx.dataset.fx, d = k === 'm' ? [410, 864] : [1280, 840];
    fx.style.width = d[0] * s + 'px'; fx.style.height = d[1] * s + 'px';
    fx.firstChild.style.transform = `scale(${s})`;
  });
}
function renderSide() {
  side.innerHTML = MAP.map(([g, items]) => `<h4>${g}</h4>` + items.map(it => {
    const st = statusOf(it), on = it[0] === state.scr;
    const attrs = st === 'ok' ? `data-side="${it[0]}"` : st === 'ext' ? `data-ext="${it[3]}"` : '';
    return `<button class="it ${st} ${on ? 'on' : ''}" ${attrs}><span class="dot"></span>${it[1]}${st === 'ext' ? '<small>↗</small>' : ''}</button>`;
  }).join('')).join('') +
    `<div class="legend"><i style="background:#22c55e"></i>Pronta neste mockup<br><i style="background:#eab308"></i>Mockup próprio (abre em outra aba)<br><i style="background:#3a4152"></i>A desenhar</div>`;
}
function renderBar() {
  const all = MAP.flatMap(g => g[1]), ok = all.filter(i => statusOf(i) === 'ok').length, ext = all.filter(i => statusOf(i) === 'ext').length;
  $('#prog').innerHTML = `<span>${ok} prontas · ${ext} externas · ${all.length - ok - ext} a fazer</span><span class="bar"><b style="width:${Math.round((ok + ext * .5) / all.length * 100)}%"></b></span>`;
  document.querySelectorAll('#modeSeg button').forEach(b => b.classList.toggle('on', b.dataset.mode === state.mode));
  history.replaceState(null, '', `#${state.scr}/${state.mode}`);
}

/* ---------- navegação e ações ---------- */
function go(id, push = true) {
  if (!SCREENS[id]) return;
  if (push && id !== state.scr) state.hist.push(state.scr);
  state.scr = id; state.ov = null; paint(false);
}
function back() { go(state.hist.pop() || SCREENS[state.scr].back || 'home', false); }
function toggle(set, k) { set.has(k) ? set.delete(k) : set.add(k); }

stage.addEventListener('click', e => {
  const a = e.target.closest('[data-act]');
  if (a) {
    const d = a.dataset;
    if (d.act === 'like') toggle(state.liked, d.k);
    else if (d.act === 'rt') toggle(state.rt, d.k);
    else if (d.act === 'follow') toggle(state.follow, d.k);
    else if (d.act === 'tab') state.tab[state.scr] = +d.i;
    else if (d.act === 'open') state.ov = d.v;
    else if (d.act === 'close') state.ov = null;
    else if (d.act === 'drop') state.drop = (state.drop + +d.dir + DROPS.length) % DROPS.length;
    else if (d.act === 'back') return back();
    else return;
    e.stopPropagation(); return paint(true);
  }
  const g = e.target.closest('[data-go]');
  if (g) go(g.dataset.go);
});
side.addEventListener('click', e => {
  const b = e.target.closest('[data-side],[data-ext]');
  if (!b) return;
  if (b.dataset.ext) return void window.open(b.dataset.ext, '_blank', 'noopener');
  go(b.dataset.side); if (innerWidth <= 900) side.classList.remove('open');
});
$('#modeSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { state.mode = b.dataset.mode; paint(true); } });
$('#themeBtn').addEventListener('click', () => { state.light = !state.light; paint(true); });
$('#sideToggle').addEventListener('click', () => side.classList.toggle('open'));
addEventListener('resize', fit);

/* estado inicial a partir do hash: #tela/modo */
(() => {
  const [s, m] = location.hash.slice(1).split('/');
  if (SCREENS[s]) state.scr = s;
  if (['m', 'd', 'both'].includes(m)) state.mode = m;
  else if (innerWidth < 1100) state.mode = 'm';
  for (const k in SCREENS) SCREENS[k].id = k;
  paint(false);
})();
