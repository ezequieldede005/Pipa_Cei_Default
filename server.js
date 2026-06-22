// ============================================================
// SERVIDOR PRINCIPAL — Pipa Ceilândia v3
// ============================================================
const express  = require("express");
const session  = require("express-session");
const bcrypt   = require("bcryptjs");
const multer   = require("multer");
const path     = require("path");
const fs       = require("fs");
const cron     = require("node-cron");
const db       = require("./data/db.js");

const app  = express();
const PORT = process.env.PORT || 3000;
const ADMIN_WHATS_DEFAULT = "61984889679"; // fallback se não tiver no banco

// ── Upload de fotos ──────────────────────────────────────────
const uploadDir = path.join(__dirname, "public", "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const ext  = path.extname(file.originalname).toLowerCase();
    const nome = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, nome);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (/^image\/(jpeg|png|gif|webp)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Apenas imagens são aceitas."));
  },
});

// ── Middlewares base ─────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: "pipa-secret-2024-troque-em-producao",
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 8 * 60 * 60 * 1000 }, // 8 horas
}));

// ── Arquivos estáticos ───────────────────────────────────────
app.use("/uploads", express.static(uploadDir));
app.use("/css",     express.static(path.join(__dirname, "public", "css")));
app.use("/js",      express.static(path.join(__dirname, "public", "js")));
app.use("/logo",    express.static(path.join(__dirname, "public", "logo")));
app.use("/admin",   express.static(path.join(__dirname, "public", "admin")));
app.use("/chamada", express.static(path.join(__dirname, "public", "chamada")));
app.use(            express.static(path.join(__dirname, "public", "cliente")));

// ── Helpers ──────────────────────────────────────────────────
function autenticado(req, res, next) {
  if (req.session && req.session.adminId) return next();
  res.status(401).json({ erro: "Não autenticado." });
}

function agora() { return new Date(); }

function promocaoAtiva(promo) {
  if (!promo || !promo.ativo) return false;
  const agr = agora();
  if (promo.tipo === "diaria") {
    const [hIni, mIni] = (promo.hora_inicio || "00:00").split(":").map(Number);
    const [hFim, mFim] = (promo.hora_fim    || "23:59").split(":").map(Number);
    const minutos = agr.getHours() * 60 + agr.getMinutes();
    return minutos >= hIni * 60 + mIni && minutos <= hFim * 60 + mFim;
  }
  if (promo.tipo === "temporaria") {
    const ini = promo.data_inicio ? new Date(promo.data_inicio + "T00:00:00") : null;
    const fim = promo.data_fim    ? new Date(promo.data_fim    + "T23:59:59") : null;
    if (ini && agr < ini) return false;
    if (fim && agr > fim) return false;
    return true;
  }
  return false;
}

function enviarWhatsApp(numero, msg) {
  // Gera link wa.me — o servidor não pode "enviar" WhatsApp sozinho sem API paga.
  // Na prática, o servidor salva a notificação e o painel admin exibe um botão.
  const link = `https://wa.me/55${numero}?text=${encodeURIComponent(msg)}`;
  return link;
}

function adminWhats() {
  const a = db.prepare("SELECT whatsapp FROM admins ORDER BY id LIMIT 1").get();
  return (a && a.whatsapp) ? a.whatsapp.replace(/\D/g, "") : ADMIN_WHATS_DEFAULT.replace(/\D/g, "");
}

// ── Lógica de sugestão de compras ────────────────────────────
function calcularListaCompras() {
  // Pega vendas dos últimos 30 dias por produto
  const vendas = db.prepare(`
    SELECT m.produto_id, m.produto_nome, SUM(m.quantidade) as total_vendido,
           COUNT(DISTINCT substr(m.criado_em,1,10)) as dias_com_venda
    FROM movimentacoes_estoque m
    WHERE m.tipo = 'saida_pedido'
      AND m.criado_em >= datetime('now','-30 days','localtime')
    GROUP BY m.produto_id
  `).all();

  const produtos = db.prepare("SELECT * FROM produtos WHERE ativo=1").all();

  return produtos.map(p => {
    const v = vendas.find(x => x.produto_id === p.id);
    const totalVendido = v ? v.total_vendido : 0;
    const diasComVenda = v ? v.dias_com_venda : 0;

    // média diária de vendas
    const mediaDiaria = diasComVenda > 0 ? totalVendido / diasComVenda : 0;

    // dias até zerar o estoque (infinito se não vendeu nada)
    const diasAteZerar = mediaDiaria > 0 ? Math.floor(p.estoque / mediaDiaria) : 999;

    // sugestão: 14 dias de estoque baseado na média diária, mínimo igual ao mínimo do produto
    const sugestao = Math.max(Math.ceil(mediaDiaria * 14), p.estoque_minimo * 2);

    return {
      produto_id:    p.id,
      nome:          p.nome,
      categoria:     p.categoria,
      estoque_atual: p.estoque,
      estoque_minimo:p.estoque_minimo,
      total_vendido_30d: totalVendido,
      media_diaria:  +mediaDiaria.toFixed(2),
      dias_ate_zerar: diasAteZerar,
      sugestao_compra: sugestao,
      urgente:       p.estoque <= p.estoque_minimo,
    };
  }).filter(x => x.urgente || x.total_vendido_30d > 0)
    .sort((a, b) => a.dias_ate_zerar - b.dias_ate_zerar);
}

// ── Cron: notificação diária às 08:00 ────────────────────────
cron.schedule("0 8 * * *", () => {
  const lista = calcularListaCompras().filter(x => x.urgente);
  if (lista.length === 0) return;

  const linhas = lista.map(x =>
    `• ${x.nome}: ${x.estoque_atual} restantes (mín: ${x.estoque_minimo}) — comprar ~${x.sugestao_compra} un.`
  ).join("\n");

  const msg = `🌴 *Pipa Ceilândia — Alerta de Estoque (${new Date().toLocaleDateString("pt-BR")})*\n\n` +
    `Os produtos abaixo precisam ser reabastecidos:\n\n${linhas}\n\n` +
    `Acesse o painel admin para registrar as entradas.`;

  db.prepare("INSERT INTO notificacoes (tipo,mensagem) VALUES (?,?)")
    .run("estoque_baixo", msg);

  console.log(`[CRON 08:00] Notificação de estoque gerada para ${lista.length} produtos.`);
}, { timezone: "America/Sao_Paulo" });

// ══════════════════════════════════════════════════════════════
// ROTAS PÚBLICAS (site do cliente)
// ══════════════════════════════════════════════════════════════

// Cardápio com preços (aplicando promoção ativa se houver)
app.get("/api/cardapio", (_, res) => {
  const produtos = db.prepare(`
    SELECT * FROM produtos WHERE ativo=1 ORDER BY ordem ASC, categoria ASC, nome ASC
  `).all();

  const promos = db.prepare("SELECT * FROM promocoes WHERE ativo=1").all();

  const comPromo = produtos.map(p => {
    const promo = promos.find(pr => pr.produto_id === p.id && promocaoAtiva(pr));
    return { ...p, preco_promo: promo ? promo.preco_promo : null, promo_titulo: promo ? promo.titulo : null };
  });

  // Agrupar por categoria
  const cats = {};
  comPromo.forEach(p => {
    if (!cats[p.categoria]) cats[p.categoria] = [];
    cats[p.categoria].push(p);
  });

  const resultado = Object.entries(cats).map(([cat, itens]) => ({ categoria: cat, itens }));
  res.json(resultado);
});

// Logo da loja — procura qualquer extensão
app.get("/api/logo", (_, res) => {
  const logoDir = path.join(__dirname, "public", "logo");
  if (!fs.existsSync(logoDir)) return res.status(404).json({ erro: "Sem logo" });
  const exts = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
  for (const ext of exts) {
    const p = path.join(logoDir, `logo${ext}`);
    if (fs.existsSync(p)) return res.sendFile(p);
  }
  res.status(404).json({ erro: "Sem logo" });
});

// Criar pedido (cliente)
app.post("/api/pedidos", (req, res) => {
  const { nome_cliente, telefone, itens, total, observacao } = req.body;
  if (!nome_cliente?.trim())
    return res.status(400).json({ erro: "Nome do cliente obrigatório." });
  if (!Array.isArray(itens) || itens.length === 0)
    return res.status(400).json({ erro: "Pedido sem itens." });

  // Verifica estoque antes de aceitar
  const semEstoque = [];
  itens.forEach(item => {
    if (!item.produto_id) return;
    const p = db.prepare("SELECT nome, estoque FROM produtos WHERE id=?").get(item.produto_id);
    if (p && p.estoque < item.qtd) semEstoque.push(`${p.nome} (estoque: ${p.estoque})`);
  });
  if (semEstoque.length > 0)
    return res.status(400).json({ erro: `Sem estoque suficiente: ${semEstoque.join(", ")}` });

  // Insere pedido
  const info = db.prepare(`
    INSERT INTO pedidos (nome_cliente,telefone,itens_json,total,observacao,status)
    VALUES (?,?,?,?,?,'novo')
  `).run(nome_cliente.trim(), telefone||"", JSON.stringify(itens), total, observacao||"");

  const pedidoId = info.lastInsertRowid;

  // Desconta estoque automaticamente
  const tx = db.transaction(() => {
    itens.forEach(item => {
      if (!item.produto_id) return;
      db.prepare("UPDATE produtos SET estoque = MAX(0, estoque - ?) WHERE id=?")
        .run(item.qtd, item.produto_id);
      db.prepare(`INSERT INTO movimentacoes_estoque
        (produto_id,produto_nome,tipo,quantidade,pedido_id)
        VALUES (?,?,?,?,?)`)
        .run(item.produto_id, item.nome, "saida_pedido", item.qtd, pedidoId);

      // Verifica se ficou abaixo do mínimo
      const p = db.prepare("SELECT nome, estoque, estoque_minimo FROM produtos WHERE id=?")
        .get(item.produto_id);
      if (p && p.estoque <= p.estoque_minimo) {
        const msg = `⚠️ *Estoque baixo!*\n${p.nome}: apenas ${p.estoque} unidade(s) restante(s).\nPedido de compra sugerido pelo sistema.`;
        db.prepare("INSERT INTO notificacoes (tipo,mensagem) VALUES (?,?)")
          .run("estoque_baixo", msg);
      }
    });
  });
  tx();

  res.json({ ok: true, id: pedidoId });
});

// ══════════════════════════════════════════════════════════════
// ROTAS DE AUTH (admin)
// ══════════════════════════════════════════════════════════════

app.post("/api/admin/login", (req, res) => {
  const { usuario, senha } = req.body;
  const admin = db.prepare("SELECT * FROM admins WHERE usuario=?").get(usuario);
  if (!admin || !bcrypt.compareSync(senha, admin.senha_hash))
    return res.status(401).json({ erro: "Usuário ou senha inválidos." });
  req.session.adminId = admin.id;
  req.session.adminNome = admin.nome;
  res.json({ ok: true, nome: admin.nome });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/admin/me", (req, res) => {
  if (!req.session?.adminId) return res.status(401).json({ erro: "Não autenticado." });
  const a = db.prepare("SELECT id,usuario,nome,whatsapp FROM admins WHERE id=?")
    .get(req.session.adminId);
  res.json(a);
});

// ══════════════════════════════════════════════════════════════
// ROTAS DO ADMIN (todas protegidas por autenticado)
// ══════════════════════════════════════════════════════════════

// ── Perfil ───────────────────────────────────────────────────
app.put("/api/admin/perfil", autenticado, (req, res) => {
  const { nome, whatsapp, usuario, senha_atual, nova_senha } = req.body;
  const admin = db.prepare("SELECT * FROM admins WHERE id=?").get(req.session.adminId);
  if (!admin) return res.status(404).json({ erro: "Admin não encontrado." });

  if (nova_senha) {
    if (!bcrypt.compareSync(senha_atual||"", admin.senha_hash))
      return res.status(400).json({ erro: "Senha atual incorreta." });
    const hash = bcrypt.hashSync(nova_senha, 10);
    db.prepare("UPDATE admins SET senha_hash=? WHERE id=?").run(hash, admin.id);
  }
  db.prepare("UPDATE admins SET nome=?, whatsapp=?, usuario=? WHERE id=?")
    .run(nome||admin.nome, whatsapp||admin.whatsapp, usuario||admin.usuario, admin.id);
  res.json({ ok: true });
});

// ── Produtos ─────────────────────────────────────────────────
app.get("/api/admin/produtos", autenticado, (_, res) => {
  const produtos = db.prepare(`
    SELECT p.*, 
      (SELECT preco_promo FROM promocoes WHERE produto_id=p.id AND ativo=1 LIMIT 1) as preco_promo
    FROM produtos p ORDER BY p.ordem, p.categoria, p.nome
  `).all();
  res.json(produtos);
});

app.post("/api/admin/produtos", autenticado, upload.single("foto"), (req, res) => {
  const { categoria, nome, descricao, preco, estoque, estoque_minimo } = req.body;
  if (!nome?.trim() || !categoria?.trim())
    return res.status(400).json({ erro: "Nome e categoria obrigatórios." });

  const maxOrdem = db.prepare("SELECT MAX(ordem) as m FROM produtos").get().m || 0;
  const foto_url = req.file ? `/uploads/${req.file.filename}` : "";

  const info = db.prepare(`
    INSERT INTO produtos (categoria,nome,descricao,preco,foto_url,estoque,estoque_minimo,ativo,ordem)
    VALUES (?,?,?,?,?,?,?,1,?)
  `).run(categoria.trim(), nome.trim(), descricao||"", parseFloat(preco)||0,
         foto_url, parseInt(estoque)||0, parseInt(estoque_minimo)||5, maxOrdem + 1);

  res.json({ ok: true, id: info.lastInsertRowid });
});

app.put("/api/admin/produtos/:id", autenticado, upload.single("foto"), (req, res) => {
  const id = req.params.id;
  const p  = db.prepare("SELECT * FROM produtos WHERE id=?").get(id);
  if (!p) return res.status(404).json({ erro: "Produto não encontrado." });

  const { categoria, nome, descricao, preco, estoque_minimo, ativo } = req.body;
  let foto_url = p.foto_url;
  if (req.file) {
    // Apaga foto antiga se existir
    if (p.foto_url) {
      const old = path.join(__dirname, "public", p.foto_url);
      if (fs.existsSync(old)) fs.unlinkSync(old);
    }
    foto_url = `/uploads/${req.file.filename}`;
  }

  db.prepare(`UPDATE produtos SET
    categoria=?,nome=?,descricao=?,preco=?,foto_url=?,estoque_minimo=?,ativo=?
    WHERE id=?`).run(
    categoria||p.categoria, nome||p.nome, descricao??p.descricao,
    parseFloat(preco)??p.preco, foto_url, parseInt(estoque_minimo)||p.estoque_minimo,
    ativo===undefined ? p.ativo : (ativo==="true"||ativo===true ? 1:0), id
  );
  res.json({ ok: true });
});

app.delete("/api/admin/produtos/:id/foto", autenticado, (req, res) => {
  const id = req.params.id;
  const p  = db.prepare("SELECT * FROM produtos WHERE id=?").get(id);
  if (!p) return res.status(404).json({ erro: "Produto não encontrado." });
  if (p.foto_url) {
    const f = path.join(__dirname, "public", p.foto_url);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  db.prepare("UPDATE produtos SET foto_url=? WHERE id=?").run("", id);
  res.json({ ok: true });
});

app.delete("/api/admin/produtos/:id", autenticado, (req, res) => {
  const p = db.prepare("SELECT * FROM produtos WHERE id=?").get(req.params.id);
  if (!p) return res.status(404).json({ erro: "Produto não encontrado." });
  if (p.foto_url) {
    const f = path.join(__dirname, "public", p.foto_url);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  db.prepare("DELETE FROM produtos WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Ajuste manual de estoque (lançar entrada de mercadoria)
app.post("/api/admin/produtos/:id/estoque", autenticado, (req, res) => {
  const id = req.params.id;
  const { quantidade, tipo, obs } = req.body; // tipo: 'entrada' | 'ajuste_manual'
  const qtd = parseInt(quantidade) || 0;
  if (qtd === 0) return res.status(400).json({ erro: "Quantidade inválida." });

  const p = db.prepare("SELECT * FROM produtos WHERE id=?").get(id);
  if (!p) return res.status(404).json({ erro: "Produto não encontrado." });

  const novoEstoque = (tipo === "entrada") ? p.estoque + qtd : Math.max(0, p.estoque + qtd);
  db.prepare("UPDATE produtos SET estoque=? WHERE id=?").run(novoEstoque, id);
  db.prepare(`INSERT INTO movimentacoes_estoque (produto_id,produto_nome,tipo,quantidade,obs)
    VALUES (?,?,?,?,?)`).run(id, p.nome, tipo||"ajuste_manual", qtd, obs||"");

  res.json({ ok: true, estoque: novoEstoque });
});

// Upload de logo
app.post("/api/admin/logo", autenticado, upload.single("logo"), (req, res) => {
  if (!req.file) return res.status(400).json({ erro: "Arquivo não enviado." });
  const logoDir = path.join(__dirname, "public", "logo");
  if (!fs.existsSync(logoDir)) fs.mkdirSync(logoDir, { recursive: true });
  // Apaga logos antigas
  fs.readdirSync(logoDir).forEach(f => fs.unlinkSync(path.join(logoDir, f)));
  // Move o upload para /public/logo/logo.ext
  const ext = path.extname(req.file.originalname).toLowerCase();
  const dest = path.join(logoDir, `logo${ext}`);
  fs.renameSync(req.file.path, dest);
  res.json({ ok: true, url: `/logo/logo${ext}` });
});


// ── Promoções ────────────────────────────────────────────────
app.get("/api/admin/promocoes", autenticado, (_, res) => {
  const rows = db.prepare(`
    SELECT pr.*, p.nome as produto_nome FROM promocoes pr
    JOIN produtos p ON p.id = pr.produto_id ORDER BY pr.id DESC
  `).all();
  res.json(rows);
});

app.post("/api/admin/promocoes", autenticado, (req, res) => {
  const { produto_id, titulo, preco_promo, tipo, hora_inicio, hora_fim, data_inicio, data_fim } = req.body;
  if (!produto_id || !preco_promo)
    return res.status(400).json({ erro: "Produto e preço promocional obrigatórios." });

  const info = db.prepare(`
    INSERT INTO promocoes (produto_id,titulo,preco_promo,tipo,hora_inicio,hora_fim,data_inicio,data_fim,ativo)
    VALUES (?,?,?,?,?,?,?,?,1)
  `).run(produto_id, titulo||"Promoção", parseFloat(preco_promo),
         tipo||"temporaria", hora_inicio||null, hora_fim||null,
         data_inicio||null, data_fim||null);
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.put("/api/admin/promocoes/:id", autenticado, (req, res) => {
  const { ativo, preco_promo, titulo, hora_inicio, hora_fim, data_inicio, data_fim } = req.body;
  const pr = db.prepare("SELECT * FROM promocoes WHERE id=?").get(req.params.id);
  if (!pr) return res.status(404).json({ erro: "Promoção não encontrada." });
  db.prepare(`UPDATE promocoes SET ativo=?,preco_promo=?,titulo=?,hora_inicio=?,hora_fim=?,data_inicio=?,data_fim=? WHERE id=?`)
    .run(ativo===undefined?pr.ativo:(ativo?1:0),
         parseFloat(preco_promo)||pr.preco_promo,
         titulo||pr.titulo,
         hora_inicio||pr.hora_inicio, hora_fim||pr.hora_fim,
         data_inicio||pr.data_inicio, data_fim||pr.data_fim,
         req.params.id);
  res.json({ ok: true });
});

app.delete("/api/admin/promocoes/:id", autenticado, (req, res) => {
  db.prepare("DELETE FROM promocoes WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── Promoções em Grupo ────────────────────────────────────────
// Verifica se um combo está ativo AGORA (agenda + ativo flag)
function comboAtivoAgora(pg) {
  if (!pg.ativo) return false;
  const agr  = new Date();
  const tipo = pg.tipo_agenda || "sempre";
  if (tipo === "sempre") return true;
  // Verifica horário se configurado
  const horaOk = (() => {
    if (!pg.hora_inicio || !pg.hora_fim) return true;
    const [hI,mI] = pg.hora_inicio.split(":").map(Number);
    const [hF,mF] = pg.hora_fim.split(":").map(Number);
    const min = agr.getHours() * 60 + agr.getMinutes();
    return min >= hI * 60 + mI && min <= hF * 60 + mF;
  })();
  if (!horaOk) return false;
  if (tipo === "diaria") return true;
  if (tipo === "semanal") {
    const dias = JSON.parse(pg.dias_semana || "[]");
    return dias.includes(agr.getDay());
  }
  if (tipo === "temporaria") {
    const ini = pg.data_inicio ? new Date(pg.data_inicio + "T00:00:00") : null;
    const fim = pg.data_fim    ? new Date(pg.data_fim    + "T23:59:59") : null;
    if (ini && agr < ini) return false;
    if (fim && agr > fim) return false;
    return true;
  }
  return false;
}

app.get("/api/admin/promocoes-grupo", autenticado, (_, res) => {
  const rows = db.prepare(`
    SELECT pg.*, p.nome as produto_nome
    FROM promocoes_grupo pg
    LEFT JOIN produtos p ON p.id = pg.alvo_id
    ORDER BY pg.id DESC
  `).all();
  res.json(rows.map(r => ({ ...r, ativo_agora: comboAtivoAgora(r) ? 1 : 0 })));
});

app.post("/api/admin/promocoes-grupo", autenticado, (req, res) => {
  const {
    titulo, quantidade, preco_grupo, alvo_tipo, alvo_id, alvo_categoria,
    produtos_ids, tipo_agenda, hora_inicio, hora_fim, data_inicio, data_fim,
    dias_semana, repetir, alarme,
  } = req.body;
  if (!titulo || !quantidade || !preco_grupo)
    return res.status(400).json({ erro: "Título, quantidade e preço obrigatórios." });
  if (alvo_tipo === "produto" && !alvo_id)
    return res.status(400).json({ erro: "Selecione o produto." });
  if (alvo_tipo === "categoria" && !alvo_categoria)
    return res.status(400).json({ erro: "Informe a categoria." });
  if (alvo_tipo === "multiplos" && (!produtos_ids || JSON.parse(produtos_ids||"[]").length < 2))
    return res.status(400).json({ erro: "Selecione ao menos 2 produtos para combo múltiplo." });

  const info = db.prepare(`
    INSERT INTO promocoes_grupo
      (titulo,quantidade,preco_grupo,alvo_tipo,alvo_id,alvo_categoria,
       produtos_ids,tipo_agenda,hora_inicio,hora_fim,data_inicio,data_fim,
       dias_semana,repetir,alarme,ativo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)
  `).run(
    titulo, parseInt(quantidade)||2, parseFloat(preco_grupo),
    alvo_tipo||"produto", alvo_id||null, alvo_categoria||null,
    produtos_ids||"[]",
    tipo_agenda||"sempre",
    hora_inicio||null, hora_fim||null,
    data_inicio ? data_inicio.split("/").reverse().join("-") : null,
    data_fim    ? data_fim.split("/").reverse().join("-")    : null,
    dias_semana ? JSON.stringify(dias_semana) : "[]",
    repetir === false || repetir === 0 ? 0 : 1,
    alarme ? 1 : 0
  );
  res.json({ ok: true, id: info.lastInsertRowid });
});

app.put("/api/admin/promocoes-grupo/:id", autenticado, (req, res) => {
  const {
    ativo, alarme, titulo, quantidade, preco_grupo,
    alvo_tipo, alvo_id, alvo_categoria, produtos_ids,
    tipo_agenda, hora_inicio, hora_fim, data_inicio, data_fim,
    dias_semana, repetir,
  } = req.body;
  const pg = db.prepare("SELECT * FROM promocoes_grupo WHERE id=?").get(req.params.id);
  if (!pg) return res.status(404).json({ erro: "Promoção não encontrada." });

  const dataIniFmt = data_inicio
    ? (data_inicio.includes("/") ? data_inicio.split("/").reverse().join("-") : data_inicio)
    : pg.data_inicio;
  const dataFimFmt = data_fim
    ? (data_fim.includes("/") ? data_fim.split("/").reverse().join("-") : data_fim)
    : pg.data_fim;

  db.prepare(`UPDATE promocoes_grupo SET
    ativo=?,alarme=?,titulo=?,quantidade=?,preco_grupo=?,
    alvo_tipo=?,alvo_id=?,alvo_categoria=?,produtos_ids=?,
    tipo_agenda=?,hora_inicio=?,hora_fim=?,data_inicio=?,data_fim=?,
    dias_semana=?,repetir=?
    WHERE id=?`).run(
    ativo===undefined ? pg.ativo : (ativo?1:0),
    alarme===undefined ? pg.alarme : (alarme?1:0),
    titulo||pg.titulo,
    parseInt(quantidade)||pg.quantidade,
    parseFloat(preco_grupo)||pg.preco_grupo,
    alvo_tipo||pg.alvo_tipo,
    alvo_id!==undefined ? (alvo_id||null) : pg.alvo_id,
    alvo_categoria!==undefined ? (alvo_categoria||null) : pg.alvo_categoria,
    produtos_ids!==undefined ? (typeof produtos_ids==="string" ? produtos_ids : JSON.stringify(produtos_ids)) : pg.produtos_ids,
    tipo_agenda||pg.tipo_agenda,
    hora_inicio!==undefined ? (hora_inicio||null) : pg.hora_inicio,
    hora_fim!==undefined    ? (hora_fim||null)    : pg.hora_fim,
    dataIniFmt,
    dataFimFmt,
    dias_semana!==undefined ? JSON.stringify(dias_semana) : pg.dias_semana,
    repetir!==undefined ? (repetir?1:0) : pg.repetir,
    req.params.id
  );
  res.json({ ok: true });
});

app.delete("/api/admin/promocoes-grupo/:id", autenticado, (req, res) => {
  db.prepare("DELETE FROM promocoes_grupo WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// Endpoint público: retorna combos ativos AGORA
app.get("/api/promocoes-grupo", (_, res) => {
  const rows = db.prepare("SELECT * FROM promocoes_grupo WHERE ativo=1").all();
  res.json(rows.filter(comboAtivoAgora));
});

// ── Pedidos ──────────────────────────────────────────────────
app.get("/api/admin/pedidos", autenticado, (_, res) => {
  const rows = db.prepare("SELECT * FROM pedidos ORDER BY id DESC").all();
  res.json(rows.map(p => ({ ...p, itens: JSON.parse(p.itens_json) })));
});

app.patch("/api/admin/pedidos/:id/status", autenticado, (req, res) => {
  const validos = ["novo","preparando","pronto","entregue","cancelado"];
  if (!validos.includes(req.body.status))
    return res.status(400).json({ erro: "Status inválido." });
  db.prepare("UPDATE pedidos SET status=? WHERE id=?").run(req.body.status, req.params.id);
  res.json({ ok: true });
});

// ── Relatório de vendas ──────────────────────────────────────
app.get("/api/admin/relatorio", autenticado, (req, res) => {
  const { de, ate } = req.query;
  const dataIni = de  || new Date(Date.now() - 30*24*3600*1000).toISOString().slice(0,10);
  const dataFim = ate || new Date().toISOString().slice(0,10);

  // Total vendido por produto
  const porProduto = db.prepare(`
    SELECT produto_nome, SUM(quantidade) as total_un
    FROM movimentacoes_estoque
    WHERE tipo='saida_pedido'
      AND date(criado_em) BETWEEN ? AND ?
    GROUP BY produto_nome ORDER BY total_un DESC
  `).all(dataIni, dataFim);

  // Faturamento total
  const faturamento = db.prepare(`
    SELECT COALESCE(SUM(total),0) as total
    FROM pedidos
    WHERE status != 'cancelado'
      AND date(criado_em) BETWEEN ? AND ?
  `).get(dataIni, dataFim).total;

  // Pedidos por status
  const porStatus = db.prepare(`
    SELECT status, COUNT(*) as qtd FROM pedidos
    WHERE date(criado_em) BETWEEN ? AND ?
    GROUP BY status
  `).all(dataIni, dataFim);

  res.json({ porProduto, faturamento, porStatus, de: dataIni, ate: dataFim });
});

// ── Lista de compras inteligente ─────────────────────────────
app.get("/api/admin/lista-compras", autenticado, (_, res) => {
  res.json(calcularListaCompras());
});

// ── Notificações ─────────────────────────────────────────────
app.get("/api/admin/notificacoes", autenticado, (_, res) => {
  const rows = db.prepare(`SELECT * FROM notificacoes WHERE enviada=0 ORDER BY id DESC`).all();
  // Monta link wa.me para cada uma
  const whats = adminWhats();
  const comLink = rows.map(n => ({
    ...n,
    link_whats: enviarWhatsApp(whats, n.mensagem),
  }));
  res.json(comLink);
});

app.patch("/api/admin/notificacoes/:id/lida", autenticado, (req, res) => {
  db.prepare("UPDATE notificacoes SET enviada=1 WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── Catch-all: qualquer /admin/* não-API serve o painel ──────
app.get("/admin/*", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "admin", "index.html"));
});

// ── Chamada: tela projetor/TV ─────────────────────────────────
app.get("/chamada", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "chamada", "index.html"));
});
app.get("/api/chamada/pedidos-prontos", (_, res) => {
  const rows = db.prepare(`
    SELECT id, nome_cliente, criado_em FROM pedidos
    WHERE status='pronto'
    ORDER BY id DESC LIMIT 20
  `).all();
  res.json(rows);
});

// ── Catch-all: qualquer outra rota serve o site do cliente ───
app.get("*", (_, res) => {
  res.sendFile(path.join(__dirname, "public", "cliente", "index.html"));
});

app.listen(PORT, () => {
  console.log(`\n🌴 Pipa Ceilândia rodando!`);
  console.log(`   Cliente  : http://localhost:${PORT}`);
  console.log(`   Admin    : http://localhost:${PORT}/admin`);
  console.log(`   Chamada  : http://localhost:${PORT}/chamada\n`);
});
