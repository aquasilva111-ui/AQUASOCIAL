/* Conteúdo das telas. Cada tela é escrita uma vez: render(d) recebe d=true no desktop.
   O CSS (.m / .d) cuida do resto. Para adicionar uma tela: crie em SCREENS e liste em MAP (app.js). */

const P = {
  me:     {n: 'Aqua Silva',    h: 'aqua',    c: ['#1185fe', '#002bef']},
  marina: {n: 'Marina Costa',  h: 'marina',  c: ['#ff7a00', '#f04c24'], v: 1},
  theo:   {n: 'Théo Ramos',    h: 'theo',    c: ['#22c55e', '#0ea5e9']},
  lia:    {n: 'Lia Duarte',    h: 'lia',     c: ['#a855f7', '#ec4899']},
  news:   {n: 'AQUA Notícias', h: 'noticias', c: ['#002bef', '#009eff'], v: 1},
  caio:   {n: 'Caio Menezes',  h: 'caio',    c: ['#eab308', '#f97316']},
  bia:    {n: 'Bia Lacerda',   h: 'bia',     c: ['#14b8a6', '#3b82f6']},
  mare:   {n: 'Estúdio Maré',  h: 'mare',    c: ['#ef4444', '#8b5cf6'], v: 1},
};
const G = [
  'linear-gradient(135deg,#0b3bff,#00c2ff)', 'linear-gradient(135deg,#f04c24,#ffb347)',
  'linear-gradient(135deg,#1b1f3b,#6d28d9)', 'linear-gradient(135deg,#064e3b,#34d399)',
  'linear-gradient(135deg,#7c2d12,#fb923c)', 'linear-gradient(135deg,#0f172a,#38bdf8)',
  'linear-gradient(135deg,#831843,#f472b6)', 'linear-gradient(135deg,#312e81,#60a5fa)',
];
const art = i => `background:${G[i % G.length]}`;
const av = (p, s = 40) => `<span class="av" style="--s:${s}px;background:linear-gradient(135deg,${p.c[0]},${p.c[1]})">${p.n[0]}</span>`;
const ring = (p, s = 52) => `<span class="ring">${av(p, s)}</span>`;
const fmt = n => n >= 1000 ? (n / 1000).toFixed(1).replace('.0', '').replace('.', ',') + ' mil' : String(n);
const verified = p => p.v ? ico('check', 'vf') : '';
const gi = (name, grad) => `<span class="gi" style="background:${grad}">${ico(name)}</span>`;

const POSTS = [
  {id: 1, p: 'marina', t: '12 min', text: 'Primeiro dia testando o novo <em>Drops</em> no AQUA. A rolagem vertical ficou muito mais fluida do que eu esperava 🌊', media: {k: 'video', i: 0, r: '4/5', d: '0:42'}, s: [24, 8, 312]},
  {id: 2, p: 'theo', t: '38 min', text: 'Alguém aqui já conectou o Spotify na aba Música? Quero deixar uma playlist tocando enquanto navego.', s: [41, 3, 96]},
  {id: 3, p: 'news', t: '1 h', text: 'Cúpula do clima termina com acordo parcial. Veja quais Convenções de realidade essa notícia ativa e como a rede reagiu.', media: {k: 'img', i: 5, r: '16/9', cap: 'Notícias'}, s: [58, 77, 541]},
  {id: 4, p: 'lia', t: '2 h', text: 'Montei meu primeiro Visionboard do ano: referências de luz, cor e textura pro novo projeto 🎨', media: {k: 'img', i: 6, r: '1/1'}, s: [12, 5, 188]},
  {id: 5, p: 'mare', t: '3 h', text: 'Novo capítulo de “Maré Alta” já está no Reads. Obrigado a quem acompanhou desde o primeiro rascunho 📖', s: [33, 19, 402]},
  {id: 6, p: 'caio', t: '5 h', text: 'Meu Launch Hub agora publica em três contas de uma vez. Menos abas abertas, mais tempo criando.', s: [9, 2, 74]},
];
const ME = P.me;

/* ---------- componentes ---------- */
function media(m) {
  return `<div class="media ph ${m.r === '4/5' ? 'tall' : ''}" style="aspect-ratio:${m.r};${art(m.i)}">
    ${m.k === 'video' ? `<span class="play"><span>${ico('play')}</span></span><span class="dur">${m.d}</span>` : ''}
    ${m.cap ? `<span class="cap">${m.cap}</span>` : ''}</div>`;
}
function post(o) {
  const p = P[o.p], L = state.liked.has('p' + o.id), R = state.rt.has('p' + o.id);
  return `<article class="post" data-go="thread">
    ${av(p, 44)}
    <div class="pb">
      <div class="ph1"><b>${p.n}</b>${verified(p)}<span class="mut">@${p.h}.aquaapp.online · ${o.t}</span><button class="ib mut" data-act="noop" aria-label="Mais">${ico('more')}</button></div>
      <p class="pt">${o.text}</p>
      ${o.media ? media(o.media) : ''}
      <div class="acts">
        <button class="ac" data-act="noop">${ico('comment')}${o.s[0]}</button>
        <button class="ac rt ${R ? 'on' : ''}" data-act="rt" data-k="p${o.id}">${ico('repeat')}${o.s[1] + (R ? 1 : 0)}</button>
        <button class="ac lk ${L ? 'on' : ''}" data-act="like" data-k="p${o.id}">${ico('heart')}${o.s[2] + (L ? 1 : 0)}</button>
        <button class="ac" data-act="noop">${ico('bookmark')}</button>
        <button class="ac" data-act="noop">${ico('share')}</button>
      </div>
    </div></article>`;
}
function stories() {
  const items = ['marina', 'theo', 'lia', 'caio', 'bia', 'mare'];
  return `<div class="stories">
    <div class="st you" data-act="open" data-v="create"><span class="av" style="--s:56px;background:linear-gradient(135deg,${ME.c[0]},${ME.c[1]})">A<span class="plus">${ico('plus')}</span></span>Seu story</div>
    ${items.map(k => `<div class="st">${ring(P[k], 52)}<span>${P[k].n.split(' ')[0]}</span></div>`).join('')}</div>`;
}
function rows(list) {
  return list.map(r => `<button class="row-item" ${r.go ? `data-go="${r.go}"` : 'data-act="noop"'}>
    ${r.icon ? gi(r.icon, r.grad || 'linear-gradient(135deg,#1185fe,#002bef)') : ''}
    <div class="t"><b>${r.t}</b>${r.s ? `<span>${r.s}</span>` : ''}</div>${ico('chev', 'c')}</button>`).join('');
}

/* ---------- telas ---------- */
const SCREENS = {};

SCREENS.home = {
  title: 'Início', top: 'main', nav: 'home', rail: true, tabs: ['Seguindo', 'Descobrir', 'Feeds'],
  render(d) {
    const t = state.tab.home || 0;
    let list = POSTS.slice();
    if (t === 1) list = list.reverse();
    if (t === 2) list = list.filter(x => x.media);
    return stories() + list.map(post).join('') + `<div class="empty-note">Você chegou ao fim por enquanto 🌊</div>`;
  },
};

SCREENS.thread = {
  title: 'Post', top: 'sub', back: 'home', nav: 'home', rail: true,
  render() {
    const o = POSTS[0], p = P[o.p];
    const replies = [
      ['theo', 'Já estou testando aqui também, a transição entre vídeos ficou ótima.', 7],
      ['lia', 'Dá pra deixar o som ligado por padrão? Seria perfeito.', 3],
      ['caio', 'Compartilha o link do teu Drop quando postar!', 12],
    ];
    return `<div style="padding:14px 16px 0;display:flex;gap:12px;align-items:center">${av(p, 48)}<div><b>${p.n}</b> ${verified(p)}<br><span class="mut">@${p.h}.aquaapp.online</span></div></div>
      <p style="font-size:19px;padding:0 16px;line-height:1.4;margin:12px 0">${o.text}</p>
      <div style="padding:0 16px">${media(o.media)}</div>
      <div class="mut" style="padding:14px 16px;border-bottom:1px solid var(--line)">12 min · <b style="color:var(--ink)">312</b> curtidas · <b style="color:var(--ink)">8</b> reposts</div>
      <div class="acts" style="max-width:none;margin:0;padding:6px 20px;border-bottom:1px solid var(--line)">
        <button class="ac">${ico('comment')}</button><button class="ac">${ico('repeat')}</button><button class="ac lk">${ico('heart')}</button><button class="ac">${ico('bookmark')}</button><button class="ac">${ico('share')}</button></div>
      ${replies.map(r => `<article class="post">${av(P[r[0]], 40)}<div class="pb"><div class="ph1"><b>${P[r[0]].n}</b><span class="mut">· 5 min</span></div><p class="pt">${r[1]}</p>
        <div class="acts"><button class="ac">${ico('comment')}</button><button class="ac">${ico('repeat')}</button><button class="ac">${ico('heart')}${r[2]}</button><span></span></div></div></article>`).join('')}`;
  },
};

const DROPS = [
  {p: 'marina', text: 'Testando a rolagem do novo Drops 🌊 #aqua', snd: 'Som original · Marina Costa', i: 0, n: [2400, 312, 89]},
  {p: 'theo', text: 'Pôr do sol visto do terraço, sem filtro nenhum.', snd: 'Maré Lenta · Estúdio Maré', i: 4, n: [980, 140, 31]},
  {p: 'lia', text: 'Timelapse do meu quadro novo, 6 horas em 30 segundos 🎨', snd: 'Som original · Lia Duarte', i: 6, n: [5100, 802, 204]},
];
SCREENS.drops = {
  title: 'Drops', top: 'none', nav: 'drops', rail: false, full: true, flush: true,
  render(d) {
    const k = state.drop % DROPS.length, o = DROPS[k], p = P[o.p], L = state.liked.has('d' + k);
    const actions = (cls) => `
      <button class="${L ? 'on' : ''}" data-act="like" data-k="d${k}">${cls ? `<span class="rb">${ico('heart')}</span>` : ico('heart')}${fmt(o.n[0] + (L ? 1 : 0))}</button>
      <button data-act="noop">${cls ? `<span class="rb">${ico('comment')}</span>` : ico('comment')}${o.n[1]}</button>
      <button data-act="noop">${cls ? `<span class="rb">${ico('bookmark')}</span>` : ico('bookmark')}Salvar</button>
      <button data-act="noop">${cls ? `<span class="rb">${ico('share')}</span>` : ico('share')}${o.n[2]}</button>`;
    const cap = `<div class="dcap"><div class="who">${av(p, 34)} @${p.h} ${verified(p)} <button class="btn sm" style="background:rgba(255,255,255,.18);margin-left:4px" data-act="noop">Seguir</button></div>
      <p>${o.text}</p><div class="snd">${ico('music')} ${o.snd}</div></div>`;
    if (!d) {
      return `<div class="dcard ph" style="${art(o.i)}" data-act="drop" data-dir="1">
        <div class="grad"></div><div class="dtabs"><span>Seguindo</span><span class="on">Para você</span></div>
        <span class="play" style="position:absolute;inset:0;display:grid;place-items:center;z-index:2;opacity:.0"></span>
        ${cap}<div class="drail" data-stop>${actions('')}</div><div class="dprog"><i></i></div></div>`;
    }
    const comments = [['theo', 'Ficou incrível!', '2 min'], ['lia', 'Qual música é essa?', '5 min'], ['caio', 'Salvei pra ver depois 👏', '8 min'], ['bia', 'Quero fazer um desses', '14 min']];
    return `<div class="dgrid">
      <div class="dcard ph" style="${art(o.i)}"><div class="grad"></div>${cap.replace('right:78px', 'right:16px')}<div class="dprog"><i></i></div>
        <div class="dtabs" style="top:16px"><span>Seguindo</span><span class="on">Para você</span></div></div>
      <div class="dside">${actions('rb')}</div>
      <div class="dnav"><button class="ib" style="background:var(--raised)" data-act="drop" data-dir="-1">${ico('up')}</button><button class="ib" style="background:var(--raised)" data-act="drop" data-dir="1">${ico('down')}</button></div>
      <div class="dcomm"><h4>Comentários · ${o.n[1]}</h4><div class="cl">${comments.map(c => `<div class="cm">${av(P[c[0]], 32)}<div><b>${P[c[0]].n}</b> <span class="mut">${c[2]}</span><p>${c[1]}</p></div></div>`).join('')}</div>
        <div class="cin">${av(ME, 30)} Adicionar comentário…</div></div></div>`;
  },
};

SCREENS.search = {
  title: 'Buscar', top: 'sub', back: 'home', nav: 'search', rail: false,
  render(d) {
    const trends = [['#AquaMusic', '12,4 mil posts'], ['Convenções de realidade', '8,1 mil posts'], ['Drops', '5,7 mil posts'], ['Visionboard', '3,2 mil posts'], ['#MaréAlta', '2,9 mil posts']];
    const ppl = ['marina', 'mare', 'bia', 'theo'];
    return `<div style="padding:12px 16px"><div class="sbox">${ico('search')}<span>Buscar no AQUA</span></div></div>
      <div class="chips"><span class="chip on">Tudo</span><span class="chip">Pessoas</span><span class="chip">Posts</span><span class="chip">Drops</span><span class="chip">Visionboard</span><span class="chip">Notícias</span><span class="chip">Livros</span></div>
      <div class="gl">Em alta agora</div>
      ${trends.map((t, i) => `<button class="row-item" data-act="noop"><span class="mut" style="width:18px">${i + 1}</span><div class="t"><b>${t[0]}</b><span>${t[1]}</span></div>${ico('trend', 'c')}</button>`).join('')}
      <div class="gl">Pessoas para seguir</div>
      ${ppl.map(k => `<div class="row-item">${av(P[k], 44)}<div class="t"><b>${P[k].n} ${verified(P[k])}</b><span>@${P[k].h}.aquaapp.online</span></div><button class="btn sm" data-act="follow" data-k="${k}">${state.follow.has(k) ? 'Seguindo' : 'Seguir'}</button></div>`).join('')}`;
  },
};

SCREENS.notifications = {
  title: 'Notificações', top: 'tab', nav: 'notifications', rail: true, tabs: ['Todas', 'Menções'],
  render() {
    const items = [
      ['heart', 'var(--like)', ['marina', 'theo'], 'curtiram seu post', '“Primeiro dia testando o novo Drops…”', '2 min', 1],
      ['user', 'var(--aqua)', ['lia'], 'começou a seguir você', '', '14 min', 1],
      ['comment', 'var(--aqua)', ['caio'], 'respondeu ao seu post', 'Compartilha o link do teu Drop quando postar!', '32 min', 1],
      ['repeat', 'var(--ok)', ['bia', 'mare', 'news'], 'repostaram seu Visionboard', '', '1 h', 0],
      ['at', 'var(--aqua)', ['mare'], 'mencionou você em “Maré Alta — cap. 12”', '', '3 h', 0],
      ['heart', 'var(--like)', ['news'], 'curtiu seu comentário', '', '5 h', 0],
    ];
    return items.map(n => `<div class="nitem ${n[6] ? 'new' : ''}"><div class="ni"><span style="color:${n[1]}">${ico(n[0] === 'at' ? 'user' : n[0])}</span></div>
      <div style="flex:1;min-width:0"><div style="display:flex;gap:6px;margin-bottom:6px">${n[2].map(k => av(P[k], 32)).join('')}</div>
      <div><b>${P[n[2][0]].n}</b>${n[2].length > 1 ? ' e outros ' + (n[2].length - 1) : ''} ${n[3]}</div>${n[4] ? `<div class="mut" style="margin-top:2px">${n[4]}</div>` : ''}</div>
      <span class="mut" style="font-size:13px">${n[5]}</span></div>`).join('');
  },
};

const CHATS = [
  ['marina', 'Te mando o roteiro amanhã cedo 😉', '9:12', 2], ['mare', 'Capítulo 13 saiu do forno!', '8:40', 1],
  ['theo', 'Fechado, domingo então.', 'Ontem', 0], ['lia', 'Você: Adorei o quadro novo', 'Ontem', 0], ['caio', 'Valeu pela dica do Launch Hub', 'Seg', 0],
];
function chatBody() {
  return `<div class="msgs"><div class="day">Hoje</div>
    <div class="bub in">Oi! Viu o novo Drops?</div><div class="bub out">Vi sim, ficou muito bom 🌊</div>
    <div class="bub in">Pensei em gravar uma série de bastidores.</div><div class="bub out">Faz sentido. Posso editar no Creative Hub.</div>
    <div class="bub in">Te mando o roteiro amanhã cedo 😉</div></div>
    <div class="minput"><span class="ib">${ico('image')}</span><div class="in">Mensagem…</div><span class="ib" style="color:var(--aqua)">${ico('send')}</span></div>`;
}
SCREENS.messages = {
  title: 'Mailssage', top: 'tab', nav: 'messages', rail: false, full: true, flush: true,
  render(d) {
    const list = CHATS.map((c, i) => `<button class="row-item" ${d ? 'data-act="noop"' : 'data-go="chat"'} style="${d && i === 0 ? 'background:var(--surface)' : ''}">${av(P[c[0]], 46)}
      <div class="t"><b>${P[c[0]].n}</b><span style="${c[3] ? 'color:var(--ink);font-weight:600' : ''}">${c[1]}</span></div>
      <div style="text-align:right"><span class="mut" style="font-size:12px">${c[2]}</span>${c[3] ? `<div class="unread" style="margin:6px 0 0 auto"></div>` : ''}</div></button>`).join('');
    if (!d) return `<div style="padding:10px 16px"><div class="sbox">${ico('search')}<span>Buscar conversas</span></div></div>${list}`;
    return `<div class="split"><div class="list"><div style="padding:12px 16px"><div class="sbox">${ico('search')}<span>Buscar conversas</span></div></div>${list}</div>
      <div class="conv"><div class="row-item" style="cursor:default">${av(P.marina, 40)}<div class="t"><b>Marina Costa</b><span>@marina.aquaapp.online</span></div>${ico('more')}</div>${chatBody()}</div></div>`;
  },
};
SCREENS.chat = {
  title: 'Marina Costa', top: 'sub', back: 'messages', nav: 'messages', rail: false, flush: true, mobileOnly: true,
  render() { return `<div style="display:flex;flex-direction:column;height:100%">${chatBody()}</div>`; },
};

SCREENS.profile = {
  title: 'Perfil', top: 'tab', nav: 'profile', rail: true,
  render(d) {
    const tabs = ['Posts', 'Respostas', 'Mídia', 'Vídeos', 'Curtidas'], t = state.tab.profile || 0;
    let body;
    if (t === 2 || t === 3) body = `<div class="mgrid">${[0, 1, 2, 3, 4, 5, 6, 7, 1, 5, 3, 0].map((x, i) => `<div class="ph ${i % 5 === 2 ? 'tall' : ''}" style="${art(x)}"></div>`).join('')}</div>`;
    else body = (t === 4 ? POSTS.slice(0, 4) : POSTS.slice(0, 4).map(x => ({...x, id: 'me' + x.id, p: 'me', media: x.media && x.p === 'marina' ? x.media : undefined}))).map(post).join('');
    return `<div class="pbanner"></div><div class="pinfo"><div class="top"><span class="av" style="--s:84px;background:linear-gradient(135deg,${ME.c[0]},${ME.c[1]})">A</span><button class="btn ghost sm" data-act="noop">Editar perfil</button></div>
      <h2>${ME.n} <span class="vf-wrap"></span></h2><div class="hd">@aqua.aquaapp.online</div>
      <p>Construindo o AQUA 🌊 · criador, designer e curioso. Drops, Reads e muito café.</p>
      <div class="nums"><span><b>248</b> seguindo</span><span><b>1,2 mil</b> seguidores</span><span><b>312</b> posts</span></div></div>
      <div class="tabs" style="margin-top:10px;overflow-x:auto">${tabs.map((x, i) => `<button class="${i === t ? 'on' : ''}" data-act="tab" data-i="${i}" style="flex:none;padding-inline:16px">${x}</button>`).join('')}</div>${body}`;
  },
};

const VIDS = [
  ['Como montamos o AQUA em 30 dias', 'mare', '18:24', '12 mil views · 2 d', 1, 0], ['Show ao vivo — Maré Lenta', 'mare', '', '1,8 mil assistindo', 0, 1],
  ['Tour pelo Creative Hub', 'marina', '9:41', '5,4 mil views · 4 d', 2, 0], ['Pintura em timelapse', 'lia', '6:12', '3,1 mil views · 1 sem', 6, 0],
  ['Review: Launch Hub multi-conta', 'caio', '12:03', '980 views · 3 d', 5, 0], ['Aula: primeiros passos no Docs', 'bia', '22:50', '7,7 mil views · 2 sem', 3, 0],
];
SCREENS.views = {
  title: 'Streams', top: 'sub', back: 'home', nav: 'views', rail: false,
  render() {
    const f = VIDS[1];
    return `<div class="chips"><span class="chip on">Tudo</span><span class="chip">Ao vivo</span><span class="chip">Música</span><span class="chip">Arte</span><span class="chip">Tutoriais</span><span class="chip">Inscrições</span><span class="chip">Histórico</span></div>
      <div class="feat"><div class="big ph" style="${art(2)}"></div><div class="meta"><span class="livebadge">AO VIVO</span><h3>${f[0]}</h3><span style="opacity:.85;font-size:13px">${P[f[1]].n} · ${f[3]}</span></div></div>
      <div class="vgrid">${VIDS.filter((_, i) => i !== 1).map(v => `<div class="vc"><div class="th ph" style="${art(v[4])}"><span class="dur">${v[2]}</span></div>
        <div class="vm">${av(P[v[1]], 36)}<div><b>${v[0]}</b><span>${P[v[1]].n} · ${v[3]}</span></div></div></div>`).join('')}</div>`;
  },
};

SCREENS.visionboard = {
  title: 'Visionboard', top: 'sub', back: 'home', nav: 'visionboard', rail: false,
  render() {
    const h = [1.3, 0.8, 1, 1.5, 0.9, 1.2, 1.4, 0.75, 1.1, 1.35, 0.95, 1.2, 1, 1.45, 0.85];
    const t = ['Luz de fim de tarde', 'Paleta oceano', 'Textura papel', 'Ambiente calmo', 'Tipografia', 'Cabine de som', 'Cores quentes', 'Arquitetura', 'Reflexos', 'Tons de azul', 'Minimal', 'Neon', 'Natureza', 'Retrô', 'Aquarela'];
    return `<div class="chips"><span class="chip on">Para você</span><span class="chip">Meus boards</span><span class="chip">Cor</span><span class="chip">Luz</span><span class="chip">Tipografia</span><span class="chip">Arquitetura</span><span class="chip">+ Novo board</span></div>
      <div class="masonry">${h.map((x, i) => `<div class="vi ph" style="aspect-ratio:1/${x};${art(i)}"><span class="sv">${ico('bookmark')}</span><span class="tt">${t[i]}</span></div>`).join('')}</div>`;
  },
};

SCREENS.reads = {
  title: 'Reads', top: 'sub', back: 'home', nav: 'reads', rail: false,
  render() {
    const books = [['Maré Alta', 'Estúdio Maré', 1], ['O Último Farol', 'Lia Duarte', 2], ['Códigos de Sal', 'Théo Ramos', 5], ['Azul Profundo', 'Bia Lacerda', 7], ['Manual do Criador', 'Aqua Silva', 3], ['Ventos do Sul', 'Caio Menezes', 4]];
    const shelf = list => `<div class="shelf">${list.map(b => `<div class="cover"><div class="bk ph" style="${art(b[2])}"><span>${b[0]}</span></div><small>${b[1]}</small></div>`).join('')}</div>`;
    return `<div class="h-sec"><h3>Continuar lendo</h3></div>
      <div class="cur"><div class="bk ph" style="${art(1)}"></div><div style="flex:1;min-width:0"><b style="font-size:17px">Maré Alta</b><div class="mut">Capítulo 12 de 24 · Estúdio Maré</div><div class="prog"><b style="width:50%"></b></div><div class="mut" style="font-size:12px">50% concluído</div><button class="btn sm" style="margin-top:10px" data-act="noop">Continuar</button></div></div>
      <div class="h-sec"><h3>Em alta</h3><a>Ver tudo</a></div>${shelf(books)}
      <div class="h-sec"><h3>Novos capítulos</h3><a>Ver tudo</a></div>${shelf(books.slice().reverse())}
      <div class="hero"><h3>Escreva no Reads Studio</h3><p>Publique livros por capítulos, receba comentários e acompanhe leituras em tempo real.</p><button class="btn" data-go="hub">Abrir o Studio</button></div>`;
  },
};

SCREENS.noticias = {
  title: 'Notícias', top: 'sub', back: 'home', nav: 'noticias', rail: false,
  render() {
    const n = [
      ['Cúpula do clima termina com acordo parcial', 'Governos assinam metas de emissão, mas adiam o financiamento. Entenda o que muda.', 'Mundo', '1 h', ['Clima', 'Economia'], 5],
      ['Cientistas medem oceano mais quente da série histórica', 'Dados de boias mostram marca recorde pelo terceiro mês seguido.', 'Ciência', '3 h', ['Oceano', 'Clima'], 0],
      ['Cidades testam transporte gratuito aos domingos', 'Piloto em quatro capitais aumenta a circulação no comércio local.', 'Cidades', '5 h', ['Mobilidade'], 3],
      ['Festival de música independente bate recorde de público', 'Mais de 40 mil pessoas passaram pelos três palcos.', 'Cultura', '7 h', ['Música', 'Cultura'], 7],
    ];
    return `<div class="bigtitle">Notícias</div><div class="sub">O que está acontecendo agora. Toque numa notícia para ver as Convenções de realidade que ela ativa.</div>
      <div class="news">${n.map(x => `<article class="nw"><div class="im ph" style="${art(x[5])}"></div><h3>${x[0]}</h3><div class="meta"><b>${x[2]}</b> · ${x[3]}</div><p>${x[1]}</p><div class="rels">${x[4].map(r => `<span>${r}</span>`).join('')}</div></article>`).join('')}</div>
      <div class="h-sec"><h3>Convenções de realidade</h3><a>Ver rede</a></div>
      <div class="conv-strip">${['Clima', 'Economia', 'Oceano', 'Cultura'].map((c, i) => `<div class="cvc" style="background:radial-gradient(circle at 30% 20%,#1b3bff,#050a28 70%)"><span>${c.toLowerCase()} · ${12 + i * 7} ligações</span></div>`).join('')}</div>`;
  },
};

SCREENS.hub = {
  title: 'Creative Hub', top: 'sub', back: 'home', nav: null, rail: false,
  render() {
    const T = [
      ['doc', 'Docs', 'Documentos em blocos, colaboração em tempo real.', 'linear-gradient(135deg,#6d28d9,#3b82f6)', 'ext', '../../aqua-docs/index.html'],
      ['palette', 'Design', 'Editor de design com camadas e exportação.', 'linear-gradient(135deg,#f04c24,#ffb347)', 'ext', '../../aqua-studio/index.html'],
      ['sheet', 'Sheets', 'Planilhas com fórmulas e gráficos.', 'linear-gradient(135deg,#059669,#34d399)', 'ext', '../../aqua-sheets/index.html'],
      ['music', 'Music Studio', 'Produza e mixe suas faixas.', 'linear-gradient(135deg,#002bef,#009eff)', 'ext', '../../docs/music-studio/mockup.html'],
      ['rocket', 'Launch Hub', 'Publique em várias contas de uma vez.', 'linear-gradient(135deg,#be185d,#f472b6)', 'ext', '../../docs/launch-hub/mockup.html'],
      ['book', 'Reads Studio', 'Escreva e publique livros por capítulos.', 'linear-gradient(135deg,#7c2d12,#fb923c)', 'todo'],
    ];
    return `<div class="hero"><h3>Crie sem trocar de app</h3><p>Todas as ferramentas compartilham projetos, assets e colaboração.</p><button class="btn" data-act="open" data-v="create">+ Novo projeto</button></div>
      <div class="tools">${T.map(t => `<${t[4] === 'ext' ? `a href="${t[5]}" target="_blank" rel="noopener"` : 'button data-act="noop"'} class="tool">${gi(t[0], t[3])}<b>${t[1]}</b><span>${t[2]}</span><em class="tg ${t[4] === 'ext' ? 'x' : 'n'}" style="font-style:normal">${t[4] === 'ext' ? 'Mockup próprio · abrir ↗' : 'A desenhar'}</em></${t[4] === 'ext' ? 'a' : 'button'}>`).join('')}</div>
      <div class="gl">Projetos recentes</div>${rows([{t: 'Roteiro — série de bastidores', s: 'Docs · editado há 2 h', icon: 'doc', grad: T[0][3]}, {t: 'Capa do EP “Maré Lenta”', s: 'Design · editado ontem', icon: 'palette', grad: T[1][3]}, {t: 'Orçamento do mês', s: 'Sheets · editado seg', icon: 'sheet', grad: T[2][3]}])}`;
  },
};

SCREENS.music = {
  title: 'Música', top: 'sub', back: 'home', nav: null, rail: false,
  render() {
    const S = [['Spotify', '#1db954', 'Conectado · música completa (Premium)', 1], ['Apple Music', '#fa243c', 'Conectar · música completa', 0], ['Deezer', '#7c3aed', 'Somente prévias de 30 s', 0], ['YouTube Music', '#ef4444', 'Indisponível no AQUA', 0]];
    return `<div class="np"><div class="art ph" style="${art(0)}"></div><div class="t"><b>Maré Lenta</b><div class="mut">Estúdio Maré</div><div class="prog"><b style="width:42%"></b></div></div><span class="ib">${ico('play')}</span></div>
      <div class="gl">Serviços de música</div>
      ${S.map(s => `<div class="svc"><span class="gi" style="background:${s[1]}">${s[0][0]}</span><div class="t"><b>${s[0]}</b><span>${s[2]}</span></div><button class="btn sm ${s[3] ? 'ghost' : ''}" data-act="noop">${s[3] ? 'Desconectar' : 'Conectar'}</button></div>`).join('')}
      <div class="hero" style="margin-top:20px"><h3>Quer produzir?</h3><p>Abra o Music Studio para criar e mixar suas faixas.</p><a class="btn" href="../../docs/music-studio/mockup.html" target="_blank" rel="noopener">Abrir Music Studio ↗</a></div>`;
  },
};

SCREENS.uiai = {
  title: 'IU & AI', top: 'sub', back: 'home', nav: 'uiai', rail: false,
  render() {
    return `<div class="gate"><div class="big-ic">${ico('cpu')}</div><h2>Unidade de Inteligência</h2>
      <p>A U.I. roda no seu computador, com privacidade total. No celular você conhece a unidade e abre a página no navegador.</p>
      <button class="btn" data-act="noop">Abrir no navegador ${ico('ext')}</button></div>`;
  },
};

SCREENS.adult = {
  title: '+18 Content', top: 'sub', back: 'home', nav: 'adult', rail: false,
  render() {
    return `<div class="gate"><div class="big-ic">${ico('lock')}</div><h2>Ambiente +18</h2>
      <p>Este espaço é separado do restante do AQUA e exige verificação de idade. Você pode sair a qualquer momento.</p>
      <button class="btn" data-act="noop">Tenho 18 anos ou mais — verificar</button><button class="btn ghost" data-go="home">Voltar ao AQUA</button>
      <a class="mut" style="font-size:13px" href="../../docs/aqua-adult/mockups.html" target="_blank" rel="noopener">Ver mockups do ambiente ↗</a></div>`;
  },
};

SCREENS.settings = {
  title: 'Configurações', top: 'sub', back: 'home', nav: 'settings', rail: false,
  render() {
    return `<div class="gl">Conta</div>${rows([{t: 'Conta', s: 'E-mail, handle, senha', icon: 'user', grad: G[0]}, {t: 'Privacidade e segurança', s: 'Atividade, 2FA, senhas de app', icon: 'lock', grad: G[2]}, {t: 'Moderação', s: 'Silenciados, bloqueados, listas', icon: 'settings', grad: G[4]}])}
      <div class="gl">Experiência</div>${rows([{t: 'Notificações', s: 'Respostas, menções, curtidas', icon: 'bell', grad: G[1]}, {t: 'Conteúdo e mídia', s: 'Reprodução, embeds, idiomas', icon: 'video', grad: G[5]}, {t: 'Aparência', s: 'Tema, tamanho do texto, ícone', icon: 'palette', grad: G[6]}, {t: 'Feeds salvos', s: 'Ordene e remova feeds', icon: 'news', grad: G[3]}])}
      <div class="gl">Sobre</div>${rows([{t: 'Ajuda e suporte', icon: 'help', grad: G[7]}, {t: 'Termos, Privacidade e Diretrizes', icon: 'doc', grad: G[2]}])}`;
  },
};
