// ============================================================
// BANCO DE DADOS — Pipa Ceilândia v3
// Tabelas: admins, produtos, promocoes, pedidos,
//          movimentacoes_estoque, notificacoes
// ============================================================
const path = require("path");
const Database = require("better-sqlite3");

const db = new Database(path.join(__dirname, "pipa.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  -- ── Admins ─────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    usuario TEXT NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    nome TEXT,
    whatsapp TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ── Produtos ────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    categoria TEXT NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT DEFAULT '',
    preco REAL DEFAULT 0,
    foto_url TEXT DEFAULT '',
    estoque INTEGER NOT NULL DEFAULT 0,
    estoque_minimo INTEGER NOT NULL DEFAULT 5,
    ativo INTEGER NOT NULL DEFAULT 1,
    ordem INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ── Promoções ───────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS promocoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL DEFAULT 'Promoção',
    preco_promo REAL NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'temporaria',
    hora_inicio TEXT,
    hora_fim TEXT,
    data_inicio TEXT,
    data_fim TEXT,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ── Pedidos ─────────────────────────────────────────────────
  CREATE TABLE IF NOT EXISTS pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome_cliente TEXT NOT NULL,
    telefone TEXT DEFAULT '',
    itens_json TEXT NOT NULL,
    total REAL NOT NULL,
    observacao TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'novo',
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ── Movimentações de estoque ────────────────────────────────
  -- tipo: 'entrada' (reabastecimento), 'saida_pedido', 'ajuste_manual'
  CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
    produto_nome TEXT NOT NULL,
    tipo TEXT NOT NULL,
    quantidade INTEGER NOT NULL,
    pedido_id INTEGER,
    obs TEXT DEFAULT '',
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ── Notificações pendentes (fila pra WhatsApp) ──────────────
  CREATE TABLE IF NOT EXISTS notificacoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    enviada INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  );

  -- ── Promoções em Grupo (ex: "2 por R$10", "3 por R$15") ──────
  -- alvo_tipo: 'produto' | 'categoria' | 'multiplos'
  -- alvo_id: produto_id (se alvo_tipo='produto')
  -- alvo_categoria: nome da categoria (se alvo_tipo='categoria')
  -- produtos_ids: JSON array de IDs (se alvo_tipo='multiplos')
  -- tipo_agenda: 'sempre' | 'diaria' | 'semanal' | 'temporaria'
  -- dias_semana: JSON array [0-6] para tipo 'semanal'
  -- repetir: 1=repete no próximo ciclo, 0=pausar quando acabar
  -- alarme: 1=repetir aviso sonoro quando ativa, 0=sem som
  CREATE TABLE IF NOT EXISTS promocoes_grupo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    quantidade INTEGER NOT NULL DEFAULT 2,
    preco_grupo REAL NOT NULL,
    alvo_tipo TEXT NOT NULL DEFAULT 'produto',
    alvo_id INTEGER REFERENCES produtos(id) ON DELETE CASCADE,
    alvo_categoria TEXT,
    produtos_ids TEXT DEFAULT '[]',
    tipo_agenda TEXT NOT NULL DEFAULT 'sempre',
    hora_inicio TEXT,
    hora_fim TEXT,
    data_inicio TEXT,
    data_fim TEXT,
    dias_semana TEXT DEFAULT '[]',
    repetir INTEGER NOT NULL DEFAULT 1,
    alarme INTEGER NOT NULL DEFAULT 0,
    ativo INTEGER NOT NULL DEFAULT 1,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// ── Migração: adiciona colunas novas se banco já existia ──────
const novasColunas = [
  ["promocoes_grupo", "produtos_ids",  "TEXT DEFAULT '[]'"],
  ["promocoes_grupo", "tipo_agenda",   "TEXT NOT NULL DEFAULT 'sempre'"],
  ["promocoes_grupo", "hora_inicio",   "TEXT"],
  ["promocoes_grupo", "hora_fim",      "TEXT"],
  ["promocoes_grupo", "data_inicio",   "TEXT"],
  ["promocoes_grupo", "data_fim",      "TEXT"],
  ["promocoes_grupo", "dias_semana",   "TEXT DEFAULT '[]'"],
  ["promocoes_grupo", "repetir",       "INTEGER NOT NULL DEFAULT 1"],
];
novasColunas.forEach(([tabela, coluna, tipo]) => {
  try {
    db.prepare(`ALTER TABLE ${tabela} ADD COLUMN ${coluna} ${tipo}`).run();
  } catch { /* já existe */ }
});

module.exports = db;
