// ─── PAINEL ADMIN — admin.js ──────────────────────────────────
"use strict";

const $ = id => document.getElementById(id);
const fmt = v => (+v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});
const fmtData = s => s ? new Date(s+"T12:00:00").toLocaleDateString("pt-BR") : "—";
const fmtHora = s => s ? new Date(s.replace(" ","T")).toLocaleString("pt-BR") : "—";

let PEDIDOS    = [];
let PRODUTOS   = [];
let PROMOCOES  = [];
let ABA_ATUAL  = "pedidos";
let FILTRO_PEDIDO = "ativos";
let ADMIN_INFO = {};
let POLL_ID    = null;

const LABEL_STATUS = { novo:"Novo", preparando:"Preparando", pronto:"Pronto p/ retirada", entregue:"Entregue", cancelado:"Cancelado" };
const PROX_STATUS  = { novo:"preparando", preparando:"pronto", pronto:"entregue" };
const LABEL_AVANCAR= { novo:"Iniciar preparo", preparando:"Marcar como pronto", pronto:"Marcar como entregue" };

// ══════════════════════════════════════════════════════════════
// AUTH
// ══════════════════════════════════════════════════════════════

async function verificarSession() {
  try {
    const r = await fetch("/api/admin/me");
    if (r.ok) { ADMIN_INFO = await r.json(); mostrarPainel(); }
    else mostrarLogin();
  } catch { mostrarLogin(); }
}

function mostrarLogin() {
  $("body").className = "login-page";
  $("telaLogin").style.display = "";
  $("painelAdmin").style.display = "none";
}

function mostrarPainel() {
  $("body").className = "";
  $("telaLogin").style.display = "none";
  $("painelAdmin").style.display = "flex";
  carregarProdutos();
  iniciarPoll();
  carregarNotificacoes();
  irAba("pedidos");
}

$("btnLogin").onclick = async () => {
  const usuario = $("lUser").value.trim();
  const senha   = $("lSenha").value.trim();
  const erroEl  = $("loginErro");
  erroEl.style.display = "none";
  const r = await fetch("/api/admin/login", {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ usuario, senha }),
  });
  if (r.ok) {
    ADMIN_INFO = await r.json();
    mostrarPainel();
  } else {
    const d = await r.json();
    erroEl.textContent = d.erro || "Erro ao entrar";
    erroEl.style.display = "block";
  }
};
$("lSenha").onkeydown = e => { if(e.key==="Enter") $("btnLogin").click(); };

$("btnLogout").onclick = async () => {
  await fetch("/api/admin/logout", { method:"POST" });
  clearInterval(POLL_ID);
  mostrarLogin();
};

// ══════════════════════════════════════════════════════════════
// NAVEGAÇÃO DE ABAS
// ══════════════════════════════════════════════════════════════

document.querySelectorAll(".nav-item").forEach(btn => {
  btn.onclick = () => irAba(btn.dataset.aba);
});

function irAba(aba) {
  ABA_ATUAL = aba;
  document.querySelectorAll(".aba").forEach(a => a.classList.remove("on"));
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("on"));
  $(`aba-${aba}`)?.classList.add("on");
  document.querySelector(`.nav-item[data-aba="${aba}"]`)?.classList.add("on");
  $("topbarTitulo").textContent = { pedidos:"Pedidos", produtos:"Produtos", estoque:"Estoque",
    promocoes:"Promoções", "promo-grupo":"Combos / Grupo", relatorio:"Relatório de Vendas", compras:"Lista de Compras", perfil:"Perfil" }[aba] || aba;

  $("sidebar").classList.remove("aberta");

  if (aba === "produtos")  renderProdutos();
  if (aba === "estoque")   renderEstoque();
  if (aba === "promocoes") { carregarPromocoes(); }
  if (aba === "promo-grupo")   carregarPromoGrupo();
  if (aba === "compras")   carregarCompras();
  if (aba === "perfil")    carregarPerfil();
}

$("btnMenu").onclick = () => $("sidebar").classList.toggle("aberta");

// ══════════════════════════════════════════════════════════════
// POLLING (pedidos + notificações)
// ══════════════════════════════════════════════════════════════

function iniciarPoll() {
  carregarPedidos();
  POLL_ID = setInterval(() => {
    carregarPedidos();
    carregarNotificacoes();
  }, 5000);
}

// ══════════════════════════════════════════════════════════════
// PEDIDOS
// ══════════════════════════════════════════════════════════════

async function carregarPedidos() {
  const r = await fetch("/api/admin/pedidos");
  PEDIDOS = await r.json();
  if (ABA_ATUAL === "pedidos") renderPedidos();
}

// Filtros
$("filtrosPedidos").querySelectorAll(".chip").forEach(c => {
  c.onclick = () => {
    $("filtrosPedidos").querySelectorAll(".chip").forEach(x => x.classList.remove("on"));
    c.classList.add("on");
    FILTRO_PEDIDO = c.dataset.f;
    renderPedidos();
  };
});

function renderPedidos() {
  let lista = PEDIDOS;
  if (FILTRO_PEDIDO === "ativos")    lista = lista.filter(p => !["entregue","cancelado"].includes(p.status));
  else if (FILTRO_PEDIDO !== "todos") lista = lista.filter(p => p.status === FILTRO_PEDIDO);

  const el = $("gradePedidos");
  if (!lista.length) { el.innerHTML = `<p style="color:var(--muted);padding:40px">Nenhum pedido aqui.</p>`; return; }

  el.innerHTML = lista.map(p => {
    const prox = PROX_STATUS[p.status];
    return `
    <div class="card-pedido s-${p.status}">
      <div class="pedido-head">
        <div>
          <div class="pedido-num">#${String(p.id).padStart(3,"0")}</div>
          <div class="pedido-nome">${p.nome_cliente}</div>
        </div>
        <div class="pedido-hora">${fmtHora(p.criado_em)}</div>
      </div>
      <span class="status-tag ${p.status}">${LABEL_STATUS[p.status]}</span>
      <div class="pedido-itens">
        ${p.itens.map(i=>`<div class="pedido-linha"><span><span class="qtd">${i.qtd}x</span>${i.nome}</span><span>${fmt(i.preco*i.qtd)}</span></div>`).join("")}
      </div>
      ${p.observacao ? `<div class="pedido-obs">📝 ${p.observacao}</div>` : ""}
      <div class="pedido-total"><span>Total</span><span>${fmt(p.total)}</span></div>
      <div class="pedido-acoes">
        ${prox ? `<button class="btn-acao btn-acao-main" onclick="avancarPedido(${p.id},'${prox}')">${LABEL_AVANCAR[p.status]}</button>` : ""}
        <button class="btn-acao btn-acao-whats" onclick="avisarWhats(${p.id})">📱 WhatsApp</button>
        ${!["entregue","cancelado"].includes(p.status) ? `<button class="btn-acao btn-acao-cancel" onclick="cancelarPedido(${p.id})">Cancelar</button>` : ""}
      </div>
    </div>`;
  }).join("");
}

async function avancarPedido(id, status) {
  await fetch(`/api/admin/pedidos/${id}/status`, {
    method:"PATCH", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ status }),
  });
  await carregarPedidos();
  await carregarProdutos(); // estoque pode ter mudado
}

async function cancelarPedido(id) {
  if (!confirm("Cancelar este pedido?")) return;
  await avancarPedido(id, "cancelado");
}

function avisarWhats(id) {
  const p = PEDIDOS.find(x => x.id === id);
  if (!p) return;
  const itenstxt = p.itens.map(i=>`${i.qtd}x ${i.nome}`).join(", ");
  const status   = LABEL_STATUS[p.status];
  const whats    = (ADMIN_INFO.whatsapp||"61984889679").replace(/\D/g,"");
  let numero = whats, msg;

  if (p.telefone) {
    numero = p.telefone.replace(/\D/g,"");
    msg = `Oi ${p.nome_cliente}! 🌴 Aqui é da Pipa Ceilândia.\nSeu pedido #${String(p.id).padStart(3,"0")} (${itenstxt}) está: *${status}*.\nPagamento na retirada. Obrigado!`;
  } else {
    msg = `Pedido #${String(p.id).padStart(3,"0")} - ${p.nome_cliente}\n${itenstxt}\nTotal: ${fmt(p.total)}\nStatus: ${status}`;
  }
  window.open(`https://wa.me/55${numero}?text=${encodeURIComponent(msg)}`, "_blank");
}

// ══════════════════════════════════════════════════════════════
// PRODUTOS
// ══════════════════════════════════════════════════════════════

async function carregarProdutos() {
  const r = await fetch("/api/admin/produtos");
  PRODUTOS = await r.json();
  if (ABA_ATUAL === "produtos") renderProdutos();
  if (ABA_ATUAL === "estoque")  renderEstoque();
  popularCats();
}

function popularCats() {
  // also populate grupo promo selects
  const pgProd = $("pgProduto");
  const pgCat  = $("listaCatsGrupo");
  if (pgProd) pgProd.innerHTML = PRODUTOS.map(p=>`<option value="${p.id}">${p.categoria} — ${p.nome}</option>`).join("");
  if (pgCat)  { const cats=[...new Set(PRODUTOS.map(p=>p.categoria))]; pgCat.innerHTML=cats.map(c=>`<option value="${c}">`).join(""); }
  const cats = [...new Set(PRODUTOS.map(p=>p.categoria))];
  $("listaCats").innerHTML = cats.map(c=>`<option value="${c}">`).join("");
  const sel = $("prProduto");
  if (sel) sel.innerHTML = PRODUTOS.map(p=>`<option value="${p.id}">${p.categoria} — ${p.nome}</option>`).join("");
}

function renderProdutos() {
  const busca = ($("buscaProduto")?.value||"").toLowerCase();
  const lista = PRODUTOS.filter(p =>
    (!busca || p.nome.toLowerCase().includes(busca) || p.categoria.toLowerCase().includes(busca))
  );
  const el = $("listaProdutos");
  if (!lista.length) { el.innerHTML=`<p style="color:var(--muted);padding:20px">Nenhum produto encontrado.</p>`; return; }

  // Agrupar por categoria
  const cats = {};
  lista.forEach(p => { if(!cats[p.categoria]) cats[p.categoria]=[]; cats[p.categoria].push(p); });

  el.innerHTML = Object.entries(cats).map(([cat, prods]) => `
    <div style="margin-bottom:24px">
      <h3 style="font-size:14px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:10px">${cat}</h3>
      ${prods.map(p => {
        const eb = p.estoque <= 0 ? "estoque-zero" : p.estoque <= p.estoque_minimo ? "estoque-baixo" : "estoque-ok";
        const ebTxt = p.estoque <= 0 ? "Sem estoque" : p.estoque <= p.estoque_minimo ? `⚠️ ${p.estoque}` : p.estoque;
        const fotoEl = p.foto_url
          ? `<img class="prod-foto-thumb" src="${p.foto_url}" alt="">`
          : `<div class="prod-foto-placeholder">🍹</div>`;
        return `
        <div class="prod-linha${!p.ativo?" prod-oculto":""}">
          ${fotoEl}
          <div class="prod-info">
            <div class="prod-nome">${p.nome}</div>
            <div class="prod-cat">${p.categoria}</div>
            <div class="prod-preco">${p.preco?fmt(p.preco):"consultar"}</div>
          </div>
          <span class="${eb}">${ebTxt}</span>
          ${!p.ativo?'<span class="badge-oculto">OFF · ESGOTADO</span>':""}
          <div class="prod-acoes">
            <button class="btn-sm btn-sm-edit" onclick="editarProduto(${p.id})">Editar</button>
            <button class="btn-sm btn-sm-off"  onclick="toggleAtivo(${p.id},${!p.ativo})">${p.ativo?"Ocultar":"Ativar"}</button>
            <button class="btn-sm btn-sm-delete" onclick="deletarProduto(${p.id})">Excluir</button>
          </div>
        </div>`;
      }).join("")}
    </div>
  `).join("");
}

$("buscaProduto")?.addEventListener("input", renderProdutos);

// ── Modal produto ─────────────────────────────────────────────
$("btnNovoProduto").onclick = () => abrirModalProduto();

function abrirModalProduto(id) {
  const p = id ? PRODUTOS.find(x=>x.id===id) : null;
  $("mpId").value       = p?.id||"";
  $("mpCategoria").value= p?.categoria||"";
  $("mpNome").value     = p?.nome||"";
  $("mpDesc").value     = p?.descricao||"";
  $("mpPreco").value    = p?.preco||"";
  $("mpEstoque").value  = p?.estoque||"";
  $("mpEstMin").value   = p?.estoque_minimo||5;
  $("mpAtivo").value    = p ? String(!!p.ativo) : "true";
  $("mpFotoPreview").style.display = p?.foto_url ? "block" : "none";
  $("mpFotoPreview").src = p?.foto_url||"";
  const btnRemFoto = $("btnRemoverFoto");
  if (btnRemFoto) btnRemFoto.style.display = p?.foto_url ? "inline-flex" : "none";
  $("modalProdutoTitulo").textContent = p ? "Editar Produto" : "Novo Produto";
  $("modalProduto").classList.remove("hidden");
}
function fecharModalProduto() { $("modalProduto").classList.add("hidden"); $("mpFoto").value=""; }

async function removerFotoProduto() {
  const id = $("mpId").value;
  if (!id) return;
  if (!confirm("Remover a foto deste produto?")) return;
  const r = await fetch(`/api/admin/produtos/${id}/foto`, { method: "DELETE" });
  if (r.ok) {
    $("mpFotoPreview").src = "";
    $("mpFotoPreview").style.display = "none";
    $("btnRemoverFoto").style.display = "none";
    await carregarProdutos();
  }
}

$("mpFoto").onchange = e => {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = ev => { $("mpFotoPreview").src=ev.target.result; $("mpFotoPreview").style.display="block"; };
  reader.readAsDataURL(f);
};

async function salvarProduto(e) {
  e.preventDefault();
  const id  = $("mpId").value;
  const fd  = new FormData();
  fd.append("categoria",      $("mpCategoria").value.trim());
  fd.append("nome",           $("mpNome").value.trim());
  fd.append("descricao",      $("mpDesc").value.trim());
  fd.append("preco",          $("mpPreco").value||0);
  fd.append("estoque",        $("mpEstoque").value||0);
  fd.append("estoque_minimo", $("mpEstMin").value||5);
  fd.append("ativo",          $("mpAtivo").value);
  const foto = $("mpFoto").files[0];
  if (foto) fd.append("foto", foto);

  const url    = id ? `/api/admin/produtos/${id}` : "/api/admin/produtos";
  const method = id ? "PUT" : "POST";
  const r = await fetch(url, { method, body: fd });
  if (r.ok) { fecharModalProduto(); await carregarProdutos(); }
  else { const d=await r.json(); alert(d.erro||"Erro ao salvar"); }
}

async function editarProduto(id) { await carregarProdutos(); abrirModalProduto(id); }

async function toggleAtivo(id, ativo) {
  const fd = new FormData();
  fd.append("ativo", String(ativo));
  await fetch(`/api/admin/produtos/${id}`, { method:"PUT", body:fd });
  await carregarProdutos();
}

async function deletarProduto(id) {
  const p = PRODUTOS.find(x=>x.id===id);
  if (!confirm(`Excluir "${p?.nome}"? Esta ação não pode ser desfeita.`)) return;
  await fetch(`/api/admin/produtos/${id}`, { method:"DELETE" });
  await carregarProdutos();
}

// ══════════════════════════════════════════════════════════════
// ESTOQUE
// ══════════════════════════════════════════════════════════════

function renderEstoque() {
  const busca = ($("buscaEstoque")?.value||"").toLowerCase();
  const lista = PRODUTOS.filter(p =>
    !busca || p.nome.toLowerCase().includes(busca) || p.categoria.toLowerCase().includes(busca)
  ).sort((a,b) => a.estoque - b.estoque); // menor estoque primeiro

  const el = $("listaEstoque");
  el.innerHTML = lista.map(p => {
    const cls = p.estoque <= 0 ? "estoque-zero" : p.estoque <= p.estoque_minimo ? "estoque-baixo" : "estoque-ok";
    return `
    <div class="est-linha">
      <div class="est-info">
        <div class="est-nome">${p.nome}</div>
        <div class="est-cat">${p.categoria} · mín: ${p.estoque_minimo}</div>
      </div>
      <div class="est-qtd"><span class="${cls}">${p.estoque}</span></div>
      <button class="btn-sm btn-sm-edit" onclick="abrirEntrada(${p.id})">+ Lançar entrada</button>
    </div>`;
  }).join("");
}

$("buscaEstoque")?.addEventListener("input", renderEstoque);

let PROD_ESTOQUE_ID = null;
function abrirEntrada(id) {
  PROD_ESTOQUE_ID = id;
  const p = PRODUTOS.find(x=>x.id===id);
  $("modalEstoqueTitulo").textContent = `Lançar — ${p?.nome}`;
  $("esProdNome").textContent = p ? `${p.nome} · estoque atual: ${p.estoque}` : "";
  $("esProdId").value = id;
  $("esQtd").value    = "";
  $("esObs").value    = "";
  $("modalEstoque").classList.remove("hidden");
}
function fecharModalEstoque() { $("modalEstoque").classList.add("hidden"); }

async function salvarEstoque(e) {
  e.preventDefault();
  const id   = $("esProdId").value;
  const qtd  = parseInt($("esQtd").value)||0;
  const tipo = $("esTipo").value;
  const obs  = $("esObs").value.trim();
  if (qtd <= 0) { alert("Quantidade deve ser maior que 0."); return; }

  const r = await fetch(`/api/admin/produtos/${id}/estoque`, {
    method:"POST", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ quantidade:qtd, tipo, obs }),
  });
  if (r.ok) { fecharModalEstoque(); await carregarProdutos(); renderEstoque(); }
  else { const d=await r.json(); alert(d.erro||"Erro ao lançar"); }
}

// ══════════════════════════════════════════════════════════════
// PROMOÇÕES
// ══════════════════════════════════════════════════════════════

async function carregarPromocoes() {
  await carregarProdutos();
  const r = await fetch("/api/admin/promocoes");
  PROMOCOES = await r.json();
  renderPromocoes();
}

function renderPromocoes() {
  const el = $("listaPromos");
  if (!PROMOCOES.length) { el.innerHTML=`<p style="color:var(--muted);padding:30px">Nenhuma promoção cadastrada.</p>`; return; }
  el.innerHTML = PROMOCOES.map(p => {
    let periodo = "";
    if (p.tipo==="diaria")     periodo = `⏰ Diária ${p.hora_inicio||""}–${p.hora_fim||""}`;
    if (p.tipo==="temporaria") periodo = `📅 ${fmtData(p.data_inicio)} até ${fmtData(p.data_fim)}`;
    return `
    <div class="promo-card" style="${!p.ativo?"opacity:.45":""}">
      <div class="promo-info">
        <div class="promo-nome">${p.titulo} — <em style="color:var(--muted);font-style:normal">${p.produto_nome}</em></div>
        <div class="promo-detalhe">${periodo}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px;flex-shrink:0">
        <span class="promo-preco">${fmt(p.preco_promo)}</span>
        <button class="btn-sm btn-sm-off" onclick="togglePromo(${p.id},${!p.ativo})">${p.ativo?"Pausar":"Ativar"}</button>
        <button class="btn-sm btn-sm-delete" onclick="deletarPromo(${p.id})">Excluir</button>
      </div>
    </div>`;
  }).join("");
}

$("btnNovaPromo").onclick = () => {
  $("prId").value        = "";
  $("prProduto").value   = "";
  $("prTitulo").value    = "";
  $("prPreco").value     = "";
  $("prTipo").value      = "temporaria";
  $("prDataIni").value   = "";
  $("prDataFim").value   = "";
  $("prHoraIni").value   = "";
  $("prHoraFim").value   = "";
  toggleCamposPromo();
  $("modalPromoTitulo").textContent = "Nova Promoção";
  $("modalPromo").classList.remove("hidden");
};

function fecharModalPromo() { $("modalPromo").classList.add("hidden"); }

function toggleCamposPromo() {
  const t = $("prTipo").value;
  $("camposTemporaria").style.display = t==="temporaria" ? "" : "none";
  $("camposDiaria").style.display     = t==="diaria"     ? "" : "none";
}

async function salvarPromo(e) {
  e.preventDefault();
  const id = $("prId").value;
  const payload = {
    produto_id:  $("prProduto").value,
    titulo:      $("prTitulo").value||"Promoção",
    preco_promo: parseFloat($("prPreco").value)||0,
    tipo:        $("prTipo").value,
    hora_inicio: $("prHoraIni").value||null,
    hora_fim:    $("prHoraFim").value||null,
    data_inicio: $("prDataIni").value||null,
    data_fim:    $("prDataFim").value||null,
  };
  const url    = id ? `/api/admin/promocoes/${id}` : "/api/admin/promocoes";
  const method = id ? "PUT" : "POST";
  const r = await fetch(url, { method, headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
  if (r.ok) { fecharModalPromo(); await carregarPromocoes(); }
  else { const d=await r.json(); alert(d.erro||"Erro ao salvar promoção"); }
}

async function togglePromo(id, ativo) {
  await fetch(`/api/admin/promocoes/${id}`, {
    method:"PUT", headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ ativo }),
  });
  await carregarPromocoes();
}

async function deletarPromo(id) {
  if (!confirm("Excluir esta promoção?")) return;
  await fetch(`/api/admin/promocoes/${id}`, { method:"DELETE" });
  await carregarPromocoes();
}

// ══════════════════════════════════════════════════════════════
// RELATÓRIO
// ══════════════════════════════════════════════════════════════

// Data padrão: últimos 30 dias
const hoje = new Date().toISOString().slice(0,10);
const ha30 = new Date(Date.now()-30*86400000).toISOString().slice(0,10);
$("relDe").value  = ha30;
$("relAte").value = hoje;

$("btnRelatorio").onclick = async () => {
  const de  = $("relDe").value;
  const ate = $("relAte").value;
  const r   = await fetch(`/api/admin/relatorio?de=${de}&ate=${ate}`);
  const d   = await r.json();
  renderRelatorio(d);
};

function renderRelatorio(d) {
  const totalPedidos = d.porStatus.reduce((s,x)=>s+x.qtd,0);
  const cancelados   = (d.porStatus.find(x=>x.status==="cancelado")||{}).qtd||0;

  $("relConteudo").innerHTML = `
    <div class="rel-cards">
      <div class="rel-card">
        <div class="rel-card-label">Faturamento</div>
        <div class="rel-card-val">${fmt(d.faturamento)}</div>
      </div>
      <div class="rel-card">
        <div class="rel-card-label">Pedidos totais</div>
        <div class="rel-card-val">${totalPedidos}</div>
      </div>
      <div class="rel-card">
        <div class="rel-card-label">Cancelados</div>
        <div class="rel-card-val" style="color:var(--pink)">${cancelados}</div>
      </div>
    </div>
    <h3 style="font-family:var(--ff-title);margin-bottom:14px">Produtos mais vendidos</h3>
    <table class="rel-tabela">
      <thead><tr><th>#</th><th>Produto</th><th>Unidades vendidas</th></tr></thead>
      <tbody>
        ${d.porProduto.map((p,i)=>`
          <tr>
            <td style="color:var(--muted)">${i+1}</td>
            <td>${p.produto_nome}</td>
            <td><strong style="color:var(--lime)">${p.total_un}</strong></td>
          </tr>`).join("")}
      </tbody>
    </table>`;
}

// ══════════════════════════════════════════════════════════════
// LISTA DE COMPRAS
// ══════════════════════════════════════════════════════════════

$("btnRecarregarCompras").onclick = carregarCompras;

async function carregarCompras() {
  const r = await fetch("/api/admin/lista-compras");
  const d = await r.json();
  renderCompras(d);
}

function renderCompras(lista) {
  const el = $("listaCompras");
  if (!lista.length) { el.innerHTML=`<p style="color:var(--muted);padding:30px">Nenhum produto para comprar agora. Estoque em dia! 🎉</p>`; return; }

  // Botão de envio pro WhatsApp
  const linhasWa = lista.map(x=>
    `${x.nome}: comprar ${x.sugestao_compra} un. (estoque: ${x.estoque_atual})`
  ).join("\n");
  const msgWa = `🛒 *Lista de Compras — Pipa Ceilândia*\n${new Date().toLocaleDateString("pt-BR")}\n\n${linhasWa}`;
  const whats = (ADMIN_INFO.whatsapp||"61984889679").replace(/\D/g,"");

  el.innerHTML = `
    <div style="margin-bottom:16px">
      <a href="https://wa.me/55${whats}?text=${encodeURIComponent(msgWa)}" target="_blank"
         style="display:inline-flex;align-items:center;gap:8px;background:#1a5c32;color:#fff;padding:11px 20px;border-radius:8px;font-weight:700;font-size:14px">
        📱 Enviar lista pelo WhatsApp
      </a>
    </div>
    <div style="overflow-x:auto">
    <table class="compras-tabela">
      <thead>
        <tr>
          <th>Produto</th><th>Estoque</th><th>Vendido 30d</th>
          <th>Média/dia</th><th>Dias p/ zerar</th><th>Comprar</th>
        </tr>
      </thead>
      <tbody>
        ${lista.map(x=>`
          <tr class="${x.urgente?"urgente":""}">
            <td>
              <div style="font-weight:600">${x.nome}</div>
              <div style="font-size:11.5px;color:var(--muted)">${x.categoria}</div>
              ${x.urgente?`<span class="estoque-baixo" style="font-size:11px">⚠️ urgente</span>`:""}
            </td>
            <td><span class="${x.estoque_atual<=0?"estoque-zero":x.urgente?"estoque-baixo":"estoque-ok"}">${x.estoque_atual}</span></td>
            <td>${x.total_vendido_30d}</td>
            <td>${x.media_diaria}</td>
            <td>${x.dias_ate_zerar > 100 ? "∞" : x.dias_ate_zerar + "d"}</td>
            <td><span class="sugestao-qtd">${x.sugestao_compra}</span></td>
          </tr>`).join("")}
      </tbody>
    </table>
    </div>`;
}

// ══════════════════════════════════════════════════════════════
// NOTIFICAÇÕES
// ══════════════════════════════════════════════════════════════

async function carregarNotificacoes() {
  const r = await fetch("/api/admin/notificacoes");
  const lista = await r.json();
  const badge = $("notifBadge");
  if (lista.length) { badge.textContent = lista.length; badge.style.display="flex"; }
  else badge.style.display = "none";

  const el = $("notifLista");
  if (!lista.length) { el.innerHTML=`<p style="color:var(--muted);padding:16px;font-size:13px">Nenhum alerta pendente.</p>`; return; }

  el.innerHTML = lista.map(n => `
    <div class="notif-item" id="notif-${n.id}">
      <div style="white-space:pre-wrap;font-size:13px">${n.mensagem}</div>
      <div class="notif-actions">
        <a href="${n.link_whats}" target="_blank" class="btn-whats-notif">📱 Enviar no WhatsApp</a>
        <button class="btn-lida" onclick="marcarLida(${n.id})">✓ Marcar como lida</button>
      </div>
    </div>`).join("");
}

$("btnNotif").onclick = () => {
  $("notifPanel").classList.toggle("hidden");
};
function fecharNotif() { $("notifPanel").classList.add("hidden"); }

async function marcarLida(id) {
  await fetch(`/api/admin/notificacoes/${id}/lida`, { method:"PATCH" });
  await carregarNotificacoes();
}

// ══════════════════════════════════════════════════════════════
// PERFIL
// ══════════════════════════════════════════════════════════════

function carregarPerfil() {
  $("pNome").value    = ADMIN_INFO.nome    || "";
  $("pUsuario").value = ADMIN_INFO.usuario || "";
  $("pWhats").value   = ADMIN_INFO.whatsapp|| "";
}

$("btnSalvarPerfil").onclick = async () => {
  const payload = {
    nome:       $("pNome").value.trim(),
    usuario:    $("pUsuario").value.trim(),
    whatsapp:   $("pWhats").value.trim(),
    senha_atual:$("pSenhaAtual").value,
    nova_senha: $("pNovaSenha").value,
  };
  const r = await fetch("/api/admin/perfil", {
    method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload),
  });
  const msg = $("perfilMsg");
  if (r.ok) {
    ADMIN_INFO = { ...ADMIN_INFO, ...payload };
    msg.textContent = "✅ Dados salvos!"; msg.style.color="var(--lime)";
    $("pSenhaAtual").value=""; $("pNovaSenha").value="";
  } else {
    const d=await r.json();
    msg.textContent = "❌ " + (d.erro||"Erro ao salvar"); msg.style.color="#ff5555";
  }
};

$("btnUploadLogo").onclick = async () => {
  const f = $("logoInput").files[0];
  if (!f) { alert("Escolha um arquivo de imagem."); return; }
  const fd = new FormData();
  fd.append("logo", f);
  const r = await fetch("/api/admin/logo", { method:"POST", body:fd });
  const msg = $("logoMsg");
  if (r.ok) { msg.textContent="✅ Logo enviada! Recarregue o site do cliente para ver."; msg.style.color="var(--lime)"; }
  else { const d=await r.json(); msg.textContent="❌ "+(d.erro||"Erro"); msg.style.color="#ff5555"; }
};

// ══════════════════════════════════════════════════════════════
// PROMOÇÕES EM GRUPO (COMBOS)
// ══════════════════════════════════════════════════════════════

let PROMOS_GRUPO = [];

async function carregarPromoGrupo() {
  await carregarProdutos();
  const r = await fetch("/api/admin/promocoes-grupo");
  PROMOS_GRUPO = await r.json();
  renderPromoGrupo();
}

const DIAS_NOMES = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function renderPromoGrupo() {
  const el = $("listaPromoGrupo");
  if (!PROMOS_GRUPO.length) {
    el.innerHTML = `<p style="color:var(--muted);padding:30px">Nenhum combo cadastrado ainda.</p>`;
    return;
  }
  el.innerHTML = PROMOS_GRUPO.map(pg => {
    // Alvo
    let alvo = "";
    if (pg.alvo_tipo === "produto") alvo = `Produto: <em>${pg.produto_nome || pg.alvo_id}</em>`;
    else if (pg.alvo_tipo === "categoria") alvo = `Categoria: <em>${pg.alvo_categoria}</em>`;
    else if (pg.alvo_tipo === "multiplos") {
      const ids = JSON.parse(pg.produtos_ids||"[]");
      const nomes = ids.map(id => { const p = PRODUTOS.find(x=>x.id===+id); return p?p.nome:id; });
      alvo = `Produtos: <em>${nomes.join(", ") || "—"}</em>`;
    }
    // Agenda
    let agenda = "";
    const ta = pg.tipo_agenda || "sempre";
    if (ta === "diaria") agenda = pg.hora_inicio ? `⏰ ${pg.hora_inicio}–${pg.hora_fim||"..."}` : "⏰ diária";
    else if (ta === "semanal") {
      const dias = JSON.parse(pg.dias_semana||"[]").map(d=>DIAS_NOMES[d]).join(" · ");
      agenda = `📅 ${dias}${pg.hora_inicio ? ` ${pg.hora_inicio}–${pg.hora_fim}` : ""}`;
    } else if (ta === "temporaria") {
      const di = pg.data_inicio ? pg.data_inicio.split("-").reverse().join("/") : "?";
      const df = pg.data_fim    ? pg.data_fim.split("-").reverse().join("/")    : "?";
      agenda = `📆 ${di} → ${df}`;
    }
    const repetirTag = pg.repetir
      ? `<span style="font-size:11px;color:var(--lime);opacity:.7">🔁 repete</span>`
      : `<span style="font-size:11px;color:var(--muted)">⏸ pausa ao fim</span>`;
    const alarmeTag = pg.alarme
      ? `<span style="font-size:11px;background:rgba(255,136,0,.15);color:var(--orange);border:1px solid rgba(255,136,0,.3);border-radius:6px;padding:2px 7px">🔔 alarme</span>`
      : "";
    const ativoNow = pg.ativo_agora;
    return `
    <div class="promo-card" style="${!pg.ativo?"opacity:.45":""}">
      <div class="promo-info">
        <div class="promo-nome">
          ${pg.quantidade}x — ${pg.titulo} ${alarmeTag}
          ${ativoNow && pg.ativo ? '<span style="font-size:11px;background:rgba(198,255,0,.12);color:var(--lime);border:1px solid rgba(198,255,0,.3);border-radius:6px;padding:2px 7px">● ativa agora</span>' : ""}
        </div>
        <div class="promo-detalhe">${alvo} · ${fmt(pg.preco_grupo)}</div>
        ${agenda ? `<div style="font-size:11px;color:var(--muted);margin-top:3px">${agenda} ${repetirTag}</div>` : ""}
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end">
        <button class="btn-sm" onclick="editarPromoGrupo(${pg.id})">Editar</button>
        <button class="btn-sm btn-sm-off" onclick="togglePromoGrupo(${pg.id},${!pg.ativo})">${pg.ativo?"Pausar":"Ativar"}</button>
        <button class="btn-sm" style="background:rgba(255,136,0,.12);color:var(--orange);border:1px solid rgba(255,136,0,.25)" onclick="toggleAlarmeGrupo(${pg.id},${!pg.alarme})">${pg.alarme?"🔔 Sem alarme":"🔕 Com alarme"}</button>
        <button class="btn-sm btn-sm-delete" onclick="deletarPromoGrupo(${pg.id})">Excluir</button>
      </div>
    </div>`;
  }).join("");
}

$("btnNovaPromoGrupo").onclick = () => { abrirModalPromoGrupo(); };

function abrirModalPromoGrupo(id) {
  const pg = id ? PROMOS_GRUPO.find(x=>x.id===id) : null;
  $("pgId").value        = pg?.id||"";
  $("pgTitulo").value    = pg?.titulo||"";
  $("pgQtd").value       = pg?.quantidade||2;
  $("pgPreco").value     = pg?.preco_grupo||"";
  $("pgAlvoTipo").value  = pg?.alvo_tipo||"produto";
  $("pgCategoria").value = pg?.alvo_categoria||"";
  $("pgTipoAgenda").value= pg?.tipo_agenda||"sempre";
  $("pgHoraIni").value   = pg?.hora_inicio||"";
  $("pgHoraFim").value   = pg?.hora_fim||"";
  $("pgRepetir").checked = pg ? !!pg.repetir : true;
  $("pgAlarme").checked  = pg ? !!pg.alarme  : false;

  // Datas em DD/MM/AAAA
  $("pgDataIni").value = pg?.data_inicio ? pg.data_inicio.split("-").reverse().join("/") : "";
  $("pgDataFim").value = pg?.data_fim    ? pg.data_fim.split("-").reverse().join("/")    : "";

  // Dias da semana
  const dias = JSON.parse(pg?.dias_semana||"[]");
  $("pgDiasSemana").querySelectorAll("input[type=checkbox]").forEach(cb => {
    cb.checked = dias.includes(parseInt(cb.value));
  });

  // Populate produto select
  const sel = $("pgProduto");
  sel.innerHTML = PRODUTOS.map(p => `<option value="${p.id}">${p.categoria} — ${p.nome}</option>`).join("");
  if (pg?.alvo_id) sel.value = pg.alvo_id;

  // Populate multi-produto lista
  const multiIds = JSON.parse(pg?.produtos_ids||"[]").map(Number);
  $("pgMultiLista").innerHTML = PRODUTOS.map(p => `
    <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text2)">
      <input type="checkbox" value="${p.id}" ${multiIds.includes(p.id)?"checked":""} style="width:16px;height:16px">
      ${p.categoria} — ${p.nome}
    </label>
  `).join("");

  // Populate categoria datalist
  const cats = [...new Set(PRODUTOS.map(p=>p.categoria))];
  $("listaCatsGrupo").innerHTML = cats.map(c=>`<option value="${c}">`).join("");

  $("modalPromoGrupoTitulo").textContent = pg ? "Editar Combo" : "Novo Combo / Promo Grupo";
  toggleAlvoGrupo();
  toggleAgendaGrupo();
  $("modalPromoGrupo").classList.remove("hidden");
}

function fecharModalPromoGrupo() { $("modalPromoGrupo").classList.add("hidden"); }

function toggleAlvoGrupo() {
  const t = $("pgAlvoTipo").value;
  $("campoAlvoProduto").style.display    = t === "produto"    ? "" : "none";
  $("campoAlvoCategoria").style.display  = t === "categoria"  ? "" : "none";
  $("campoAlvoMultiplos").style.display  = t === "multiplos"  ? "" : "none";
}

function toggleAgendaGrupo() {
  const t = $("pgTipoAgenda").value;
  $("campoPgHorario").style.display = (t === "diaria" || t === "semanal") ? "" : "none";
  $("campoPgDias").style.display    = t === "semanal"    ? "" : "none";
  $("campoPgDatas").style.display   = t === "temporaria" ? "" : "none";
}

async function salvarPromoGrupo(e) {
  e.preventDefault();
  const id = $("pgId").value;
  const tipo = $("pgAlvoTipo").value;

  // Coleta dias marcados
  const diasMarcados = [...$("pgDiasSemana").querySelectorAll("input:checked")].map(cb=>parseInt(cb.value));

  // Coleta produtos múltiplos
  const multisIds = [...$("pgMultiLista").querySelectorAll("input:checked")].map(cb=>parseInt(cb.value));
  if (tipo === "multiplos" && multisIds.length < 2) {
    alert("Selecione ao menos 2 produtos para combo múltiplo."); return;
  }

  const payload = {
    titulo:         $("pgTitulo").value.trim(),
    quantidade:     parseInt($("pgQtd").value)||2,
    preco_grupo:    parseFloat($("pgPreco").value)||0,
    alvo_tipo:      tipo,
    alvo_id:        tipo === "produto"   ? $("pgProduto").value   : null,
    alvo_categoria: tipo === "categoria" ? $("pgCategoria").value : null,
    produtos_ids:   JSON.stringify(multisIds),
    tipo_agenda:    $("pgTipoAgenda").value,
    hora_inicio:    $("pgHoraIni").value || null,
    hora_fim:       $("pgHoraFim").value || null,
    data_inicio:    $("pgDataIni").value || null,
    data_fim:       $("pgDataFim").value || null,
    dias_semana:    diasMarcados,
    repetir:        $("pgRepetir").checked ? 1 : 0,
    alarme:         $("pgAlarme").checked  ? 1 : 0,
  };
  const url    = id ? `/api/admin/promocoes-grupo/${id}` : "/api/admin/promocoes-grupo";
  const method = id ? "PUT" : "POST";
  const r = await fetch(url, { method, headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
  if (r.ok) { fecharModalPromoGrupo(); await carregarPromoGrupo(); }
  else { const d=await r.json(); alert(d.erro||"Erro ao salvar combo"); }
}

async function editarPromoGrupo(id) { await carregarPromoGrupo(); abrirModalPromoGrupo(id); }

async function togglePromoGrupo(id, ativo) {
  await fetch(`/api/admin/promocoes-grupo/${id}`, {
    method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ ativo }),
  });
  await carregarPromoGrupo();
}

async function toggleAlarmeGrupo(id, alarme) {
  await fetch(`/api/admin/promocoes-grupo/${id}`, {
    method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ alarme }),
  });
  await carregarPromoGrupo();
}

async function deletarPromoGrupo(id) {
  if (!confirm("Excluir este combo?")) return;
  await fetch(`/api/admin/promocoes-grupo/${id}`, { method:"DELETE" });
  await carregarPromoGrupo();
}

// ══════════════════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════════════════

verificarSession();
