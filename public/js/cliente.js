// ─── SITE DO CLIENTE — cliente.js ────────────────────────────
"use strict";

let CARDAPIO = [];
let CARRINHO = {};    // { "id_produto": { produto, qtd } }
let PROMOS_GRUPO = [];
let ALARME_INTERVAL = null;

const $ = id => document.getElementById(id);
const fmt = v => (+v).toLocaleString("pt-BR", { style:"currency", currency:"BRL" });

// ── Inicialização ─────────────────────────────────────────────
async function init() {
  await carregarLogo();
  await carregarCardapio();
  await carregarPromosGrupo();
  bindEventos();
}

// ── Logo + nome sempre juntos ─────────────────────────────────
async function carregarLogo() {
  const img = $("logoImg");
  try {
    const r = await fetch("/api/logo");
    if (r.ok) {
      // pega URL real da resposta (pode ser .jpg, .webp, etc.)
      const url = r.url || "/api/logo";
      img.src = url;
      img.style.display = "block";
      img.onerror = () => { img.style.display = "none"; };
    }
  } catch { /* sem logo, só texto aparece */ }
}

async function carregarCardapio() {
  const main = $("main");
  try {
    const r = await fetch("/api/cardapio");
    CARDAPIO = await r.json();
    montarNav();
    montarCardapio();
  } catch(e) {
    main.innerHTML = `<div class="loading">Erro ao carregar o cardápio. Tente recarregar a página.</div>`;
  }
}

// ── Promoções em grupo ────────────────────────────────────────
async function carregarPromosGrupo() {
  try {
    const r = await fetch("/api/promocoes-grupo");
    PROMOS_GRUPO = await r.json();
    renderBannerPromoGrupo();
  } catch { PROMOS_GRUPO = []; }
}

function renderBannerPromoGrupo() {
  const banner = $("bannerPromoGrupo");
  if (!PROMOS_GRUPO.length) { banner.style.display = "none"; return; }

  banner.style.display = "block";
  banner.innerHTML = `
    <div class="promo-grupo-banner">
      <div class="promo-grupo-titulo">🔥 Promoções em Grupo</div>
      <div class="promo-grupo-lista">
        ${PROMOS_GRUPO.map(pg => `
          <div class="promo-grupo-chip">
            <span class="pgc-qty">${pg.quantidade}x</span>
            <span class="pgc-desc">${pg.titulo}</span>
            <span class="pgc-preco">${fmt(pg.preco_grupo)}</span>
          </div>
        `).join("")}
      </div>
    </div>`;

  // Alarme sonoro se alguma promo tem alarme
  const temAlarme = PROMOS_GRUPO.some(p => p.alarme);
  if (temAlarme && !ALARME_INTERVAL) {
    tocarAlarme();
    ALARME_INTERVAL = setInterval(tocarAlarme, 30000);
  } else if (!temAlarme && ALARME_INTERVAL) {
    clearInterval(ALARME_INTERVAL);
    ALARME_INTERVAL = null;
  }
}

function tocarAlarme() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notas = [523, 659, 784]; // C5 E5 G5
    notas.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = "sine";
      gain.gain.setValueAtTime(0.18, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.18 + 0.25);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.3);
    });
  } catch {}
}

function dicaCarrinho() {
  const dica = $("dicaPromoGrupo");
  if (!dica || !PROMOS_GRUPO.length) return;
  const msgs = [];
  PROMOS_GRUPO.forEach(pg => {
    const qtdCarr = calcQtdParaPromo(pg);
    if (qtdCarr > 0 && qtdCarr < pg.quantidade) {
      const falta = pg.quantidade - qtdCarr;
      msgs.push(`➕ Faltam <strong>${falta}</strong> para "${pg.titulo}" — ${fmt(pg.preco_grupo)}!`);
    }
  });
  if (msgs.length) {
    dica.style.display = "block";
    dica.innerHTML = `<div class="dica-promo-grupo">${msgs.join("<br>")}</div>`;
  } else {
    dica.style.display = "none";
  }
}

function calcQtdParaPromo(pg) {
  let qtd = 0;
  Object.values(CARRINHO).forEach(({ produto, qtd: q }) => {
    if (pg.alvo_tipo === "produto" && produto.id === pg.alvo_id) qtd += q;
    if (pg.alvo_tipo === "categoria" && produto.categoria === pg.alvo_categoria) qtd += q;
  });
  return qtd;
}

// ── Nav de categorias ─────────────────────────────────────────
function montarNav() {
  const nav = $("navCats");
  nav.innerHTML = CARDAPIO.map((c, i) =>
    `<button class="chip${i===0?" on":""}" data-i="${i}">${c.categoria}</button>`
  ).join("");
  nav.querySelectorAll(".chip").forEach(btn => {
    btn.onclick = () => {
      nav.querySelectorAll(".chip").forEach(b => b.classList.remove("on"));
      btn.classList.add("on");
      $(`sec-${btn.dataset.i}`)?.scrollIntoView({ behavior:"smooth" });
    };
  });
}

// ── Cardápio ──────────────────────────────────────────────────
function montarCardapio() {
  const main = $("main");
  main.innerHTML = CARDAPIO.map((cat, i) => `
    <section class="sec-cat" id="sec-${i}">
      <h2 class="sec-cat-titulo">${cat.categoria}</h2>
      <div class="produtos-grid" id="grid-${i}">
        ${cat.itens.map(p => cardProduto(p)).join("")}
      </div>
    </section>
  `).join("");

  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const i = e.target.id.split("-")[1];
        document.querySelectorAll(".chip").forEach(b => b.classList.remove("on"));
        document.querySelector(`.chip[data-i="${i}"]`)?.classList.add("on");
      }
    });
  }, { rootMargin: "-120px 0px -60% 0px" });
  document.querySelectorAll(".sec-cat").forEach(s => obs.observe(s));
}

function cardProduto(p) {
  const temEstoque = p.estoque > 0;
  const precoFinal  = p.preco_promo ?? p.preco;
  const emPromo     = p.preco_promo !== null && p.preco_promo !== undefined;
  const semPreco    = !p.preco && !p.preco_promo;

  const fotoHtml = p.foto_url
    ? `<img class="card-foto" src="${p.foto_url}" alt="${p.nome}" loading="lazy">`
    : `<div class="card-foto-placeholder"><img src="/logo/logo.png" onerror="this.parentElement.innerHTML='<span style=color:var(--muted);font-size:32px>🍹</span>'" alt=""></div>`;

  const promoTagHtml = emPromo && p.promo_titulo
    ? `<span class="promo-tag">🔥 ${p.promo_titulo}</span>` : "";

  // Verifica se produto tem promo em grupo ativa
  const promoGrupo = PROMOS_GRUPO.find(pg =>
    (pg.alvo_tipo === "produto" && pg.alvo_id === p.id) ||
    (pg.alvo_tipo === "categoria" && pg.alvo_categoria === p.categoria)
  );
  const promoGrupoTag = promoGrupo
    ? `<span class="promo-grupo-tag">🎯 ${promoGrupo.quantidade}x ${fmt(promoGrupo.preco_grupo)}</span>` : "";

  let precoHtml = "";
  if (semPreco) {
    precoHtml = `<span class="preco-consultar">consultar no balcão</span>`;
  } else if (emPromo) {
    precoHtml = `
      <div class="precos">
        <span class="preco-original">${fmt(p.preco)}</span>
        <span class="preco-atual promo">${fmt(precoFinal)}</span>
      </div>`;
  } else {
    precoHtml = `<span class="preco-atual">${fmt(precoFinal)}</span>`;
  }

  const acaoHtml = semPreco
    ? ""
    : temEstoque
      ? `<button class="btn-add" id="add-${p.id}" onclick="addItem(${p.id})">+</button>`
      : `<span class="sem-estoque-tag">Sem estoque</span>`;

  return `
    <div class="card-produto${emPromo?" em-promo":""}" id="card-${p.id}">
      ${fotoHtml}
      <div class="card-body">
        ${promoTagHtml}${promoGrupoTag}
        <span class="card-nome">${p.nome}</span>
        ${p.descricao ? `<span class="card-desc">${p.descricao}</span>` : ""}
        <div class="card-footer">
          ${precoHtml}
          <div id="ctrl-${p.id}">${acaoHtml}</div>
        </div>
      </div>
    </div>`;
}

function getProduto(id) {
  for (const cat of CARDAPIO)
    for (const p of cat.itens)
      if (p.id === id || p.id === +id) return p;
  return null;
}

// ── Carrinho ──────────────────────────────────────────────────
function addItem(id) {
  const p = getProduto(id);
  if (!p || p.estoque <= 0) return;
  if (!CARRINHO[id]) CARRINHO[id] = { produto: p, qtd: 0 };
  CARRINHO[id].qtd++;
  renderCtrl(id);
  atualizarBarra();
}

function changeQtd(id, delta) {
  if (!CARRINHO[id]) return;
  CARRINHO[id].qtd += delta;
  if (CARRINHO[id].qtd <= 0) delete CARRINHO[id];
  renderCtrl(id);
  atualizarBarra();
}

function renderCtrl(id) {
  const el = $(`ctrl-${id}`);
  if (!el) return;
  const item = CARRINHO[id];
  if (!item) {
    el.innerHTML = `<button class="btn-add" onclick="addItem(${id})">+</button>`;
  } else {
    el.innerHTML = `
      <div class="ctrl-qtd">
        <button onclick="changeQtd(${id},-1)">−</button>
        <span>${item.qtd}</span>
        <button onclick="changeQtd(${id},1)">+</button>
      </div>`;
  }
}

function totalCarrinho() {
  return Object.values(CARRINHO).reduce((s, x) => {
    const preco = x.produto.preco_promo ?? x.produto.preco ?? 0;
    return s + preco * x.qtd;
  }, 0);
}

function qtdCarrinho() {
  return Object.values(CARRINHO).reduce((s, x) => s + x.qtd, 0);
}

function atualizarBarra() {
  const qtd = qtdCarrinho();
  const barra = $("barraCarrinho");
  if (qtd === 0) { barra.classList.add("hidden"); }
  else {
    barra.classList.remove("hidden");
    $("barraBadge").textContent = qtd;
    $("barraTotal").textContent = fmt(totalCarrinho());
    $("badge").textContent = qtd;
    $("badge").style.display = "flex";
  }
}

// ── Modal carrinho ────────────────────────────────────────────
function abrirCarrinho() {
  renderCarrinho();
  $("overlayCarrinho").classList.remove("hidden");
}

function fecharCarrinho() {
  $("overlayCarrinho").classList.add("hidden");
}

function renderCarrinho() {
  const itens = Object.values(CARRINHO);
  const lista = $("listaCarrinho");
  const form  = $("formArea");

  if (itens.length === 0) {
    lista.innerHTML = `<div class="vazio"><div class="vazio-icon">🥤</div><p>Carrinho vazio! Escolha os drinks.</p></div>`;
    form.style.display = "none";
    return;
  }

  form.style.display = "block";
  $("totalVal").textContent = fmt(totalCarrinho());
  $("titleModal").textContent = `Seu pedido (${qtdCarrinho()})`;

  lista.innerHTML = itens.map(({ produto: p, qtd }) => {
    const preco = p.preco_promo ?? p.preco ?? 0;
    return `
      <div class="item-cart">
        <div class="item-cart-info">
          <div class="item-cart-nome">${p.nome}</div>
          <div class="item-cart-unit">${fmt(preco)} cada</div>
        </div>
        <div class="ctrl-qtd" style="flex-shrink:0">
          <button onclick="changeModal(${p.id},-1)">−</button>
          <span>${qtd}</span>
          <button onclick="changeModal(${p.id},1)">+</button>
        </div>
        <button class="btn-remover-item" onclick="removeItemCarrinho(${p.id})" title="Remover item">✕</button>
      </div>`;
  }).join("");

  dicaCarrinho();
}

function changeModal(id, delta) {
  changeQtd(id, delta);
  renderCarrinho();
}

function removeItemCarrinho(id) {
  delete CARRINHO[id];
  atualizarBarra();
  renderCarrinho();
  renderCtrl(id);
}

// ── Enviar pedido ─────────────────────────────────────────────
async function enviarPedido() {
  const nome = $("fNome").value.trim();
  if (!nome) { $("fNome").focus(); return; }

  const btn = $("btnEnviar");
  btn.disabled = true;
  btn.textContent = "Enviando...";

  const itens = Object.values(CARRINHO).map(({ produto: p, qtd }) => ({
    produto_id: p.id,
    nome: p.nome,
    preco: p.preco_promo ?? p.preco ?? 0,
    qtd,
  }));

  try {
    const r = await fetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify({
        nome_cliente: nome,
        telefone: $("fFone").value.trim(),
        itens,
        total: totalCarrinho(),
        observacao: $("fObs").value.trim(),
      }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.erro || "Erro ao enviar");

    CARRINHO = {};
    atualizarBarra();
    fecharCarrinho();
    montarCardapio();
    $("numPedido").textContent = "#" + String(d.id).padStart(3,"0");
    $("overlaySucesso").classList.remove("hidden");
    document.querySelector("#overlayCarrinho form")?.reset?.();
  } catch(e) {
    alert("Não foi possível enviar: " + e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirmar — pagar na retirada";
  }
}

// ── Bind de eventos ───────────────────────────────────────────
function bindEventos() {
  $("btnCarrinho").onclick   = abrirCarrinho;
  $("barraCarrinho").onclick = abrirCarrinho;
  $("btnFechar").onclick     = fecharCarrinho;
  $("btnEnviar").onclick     = enviarPedido;
  $("btnNovo").onclick       = () => $("overlaySucesso").classList.add("hidden");

  $("overlayCarrinho").onclick = e => { if (e.target===e.currentTarget) fecharCarrinho(); };
  $("overlaySucesso").onclick  = e => { if (e.target===e.currentTarget) e.currentTarget.classList.add("hidden"); };
}

init();
