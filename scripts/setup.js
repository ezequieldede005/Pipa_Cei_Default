// ============================================================
// SETUP INICIAL — rode UMA VEZ antes de subir o servidor
// node scripts/setup.js
// ============================================================
const bcrypt = require("bcryptjs");
const db = require("../data/db.js");

// ─── Admin padrão ───────────────────────────────────────────
const ADMIN_USUARIO = "admin";
const ADMIN_SENHA   = "pipa2024";   // ← TROQUE ISSO DEPOIS DE LOGAR
const ADMIN_NOME    = "Gerente Pipa";
const ADMIN_WHATS   = "61984889679";

const jaTemAdmin = db.prepare("SELECT COUNT(*) as n FROM admins").get().n;
if (!jaTemAdmin) {
  const hash = bcrypt.hashSync(ADMIN_SENHA, 10);
  db.prepare(`INSERT INTO admins (usuario,senha_hash,nome,whatsapp) VALUES (?,?,?,?)`)
    .run(ADMIN_USUARIO, hash, ADMIN_NOME, ADMIN_WHATS);
  console.log(`✅ Admin criado: usuário="${ADMIN_USUARIO}" senha="${ADMIN_SENHA}"`);
  console.log(`   ⚠️  Troque a senha no primeiro login!`);
} else {
  console.log("Admin já existe, pulando.");
}

// ─── Cardápio inicial ────────────────────────────────────────
const CARDAPIO = [
  { cat: "Drinks do Pipa", itens: [
    { nome:"Vampirão",         desc:"Spritz de limão + vodka méric",                      preco:18.90 },
    { nome:"Nugrau",           desc:"Vodka méric + jambu + gengibre + matte e limão",     preco:20.90 },
    { nome:"Maragin",          desc:"Gin méric + suco de maracujá e limão",               preco:21.90 },
    { nome:"Lovezinho",        desc:"Gin méric + melancia + limão + menta",               preco:20.90 },
    { nome:"Gin Tônica",       desc:"Gin méric + água tônica",                            preco:16.90 },
    { nome:"Mulão",            desc:"Moscow mule do Pipa (base de vodka)",                preco:19.90 },
    { nome:"Chicletão",        desc:"Vodka méric + pink lemonade + spritz de limão",      preco:19.90 },
    { nome:"Mangaloca",        desc:"Gin méric + manga + maçã + gengibre + sal e limão",  preco:21.90 },
    { nome:"Guaragin",         desc:"Guaraná + gin méric",                                preco:18.90 },
    { nome:"Chupão",           desc:"Vodka méric + hibisco + limão",                      preco:21.90 },
    { nome:"Blonde",           desc:"Whisky Johnnie Walker Blonde + soda de limão",       preco:26.90 },
  ]},
  { cat: "Copão Novidade", itens: [
    { nome:"Copão Novidade",   desc:"Sempre uma criação maneirona! Pergunte aos rabiolers.", preco:0 },
  ]},
  { cat: "Adicionais", itens: [
    { nome:"Copo com gelo",    desc:"",  preco:3.00 },
    { nome:"Canudo metal",     desc:"",  preco:7.90 },
  ]},
  { cat: "Drinks Prontos - Long", itens: [
    { nome:"Vampirão (Long)",  desc:"Spritz de limão + vodka méric",             preco:16.90 },
    { nome:"Maragin (Long)",   desc:"Gin méric + suco de maracujá e limão",      preco:16.90 },
    { nome:"Nugrau (Long)",    desc:"Vodka méric + jambu + gengibre + matte",    preco:16.90 },
    { nome:"Lovezinho (Long)", desc:"Vodka méric + melancia + limão + menta",    preco:16.90 },
    { nome:"Mangaloca (Long)", desc:"Gin méric + manga + maçã + gengibre",       preco:16.90 },
  ]},
  { cat: "Drinks Prontos - Litrão", itens: [
    { nome:"Vampirão (Litrão)",  desc:"Spritz de limão + vodka méric",           preco:39.90 },
    { nome:"Maragin (Litrão)",   desc:"Gin méric + suco de maracujá e limão",    preco:39.90 },
    { nome:"Nugrau (Litrão)",    desc:"Vodka méric + jambu + gengibre + matte",  preco:39.90 },
    { nome:"Lovezinho (Litrão)", desc:"Vodka méric + melancia + limão + menta",  preco:39.90 },
    { nome:"Mangaloca (Litrão)", desc:"Gin méric + manga + maçã + gengibre",     preco:39.90 },
  ]},
  { cat: "Sem Álcool", itens: [
    { nome:"Dibas",              desc:"Gengibre + jambu + matte + limão",        preco:16.90 },
    { nome:"Caipibeats Lata",    desc:"",                                         preco:14.90 },
    { nome:"Beats Senses Lata",  desc:"",                                         preco:14.90 },
    { nome:"Beats GT Lata",      desc:"",                                         preco:14.90 },
    { nome:"Beats Tropical Lata",desc:"",                                         preco:14.90 },
  ]},
  { cat: "Cerveja", itens: [
    { nome:"Corona Long Neck",        desc:"", preco:13.90 },
    { nome:"Stella Artois Long Neck", desc:"", preco:9.90  },
    { nome:"Spaten",                  desc:"", preco:11.90 },
    { nome:"Heineken",                desc:"", preco:12.90 },
    { nome:"Heineken Zero",           desc:"", preco:12.90 },
    { nome:"Patagonia Long Neck",     desc:"", preco:14.90 },
    { nome:"Colorado",                desc:"", preco:26.90 },
    { nome:"Stella Artois Pure Gold", desc:"", preco:10.90 },
    { nome:"Corona Zero Álcool",      desc:"", preco:13.90 },
  ]},
  { cat: "Balde Cerveja", itens: [
    { nome:"Corona 5 Long Necks",      desc:"", preco:64.90 },
    { nome:"Stella Artois 5 Long Neck",desc:"", preco:45.50 },
    { nome:"Spaten 5 Long Neck",       desc:"", preco:54.90 },
    { nome:"Heineken 5 Long Neck",     desc:"", preco:58.50 },
  ]},
  { cat: "Doses", itens: [
    { nome:"Méric Gin",              desc:"", preco:14.90 },
    { nome:"Méric Vodka",            desc:"", preco:11.90 },
    { nome:"Bananinha",              desc:"", preco:9.90  },
    { nome:"Black Label",            desc:"", preco:25.90 },
    { nome:"Red Label",              desc:"", preco:18.90 },
    { nome:"Don Luiz",               desc:"", preco:14.90 },
    { nome:"Jos - Cachaça de Jambu", desc:"", preco:12.90 },
    { nome:"Old Parr",               desc:"", preco:32.90 },
    { nome:"Jack Daniels",           desc:"", preco:21.90 },
    { nome:"Ballena",                desc:"", preco:19.90 },
    { nome:"Blond",                  desc:"", preco:18.90 },
    { nome:"Fireball",               desc:"", preco:19.90 },
  ]},
  { cat: "Softs", itens: [
    { nome:"Água",                 desc:"",                               preco:6.00  },
    { nome:"Água com Gás",         desc:"",                               preco:6.00  },
    { nome:"Água de Coco",         desc:"",                               preco:8.00  },
    { nome:"Água Tônica",          desc:"",                               preco:7.00  },
    { nome:"Coca Cola Lata",       desc:"",                               preco:8.00  },
    { nome:"Coca Cola Zero Lata",  desc:"",                               preco:8.00  },
    { nome:"Ice Tea",              desc:"",                               preco:8.00  },
    { nome:"H2O Limoneto",         desc:"",                               preco:8.00  },
    { nome:"Gatorade",             desc:"",                               preco:8.90  },
    { nome:"Guaraná Lata",         desc:"",                               preco:7.90  },
    { nome:"Guaraná Zero Lata",    desc:"",                               preco:7.90  },
    { nome:"Schweppes Citrus",     desc:"",                               preco:8.00  },
    { nome:"Red Bull",             desc:"Consultar sabores disponíveis",  preco:14.90 },
    { nome:"Monster",              desc:"Consultar sabores disponíveis",  preco:15.90 },
    { nome:"Suco Lata",            desc:"Consultar sabores disponíveis",  preco:7.90  },
  ]},
  { cat: "Combo", itens: [
    { nome:"Combo Black Label + Água de Coco",        desc:"", preco:300.00 },
    { nome:"Combo Black Label + Redbull",             desc:"", preco:320.00 },
    { nome:"Combo Blonde + Citrus",                   desc:"", preco:254.00 },
    { nome:"Combo Red Label + Água de Coco",          desc:"", preco:235.00 },
    { nome:"Combo Jack Daniels + Água de Coco/Redbull",desc:"",preco:295.00 },
    { nome:"Combo Tubo Gin + Redbull",                desc:"", preco:160.00 },
    { nome:"Combo Tubo Vodka + Redbull",              desc:"", preco:127.00 },
    { nome:"Combo Elektra + Redbull",                 desc:"", preco:99.00  },
  ]},
  { cat: "Combinhos", itens: [
    { nome:"Vodka Méric + Redbull", desc:"Uma dose + misturante", preco:23.90 },
    { nome:"Gin Méric + Redbull",   desc:"Uma dose + misturante", preco:25.90 },
    { nome:"Old Parr + Redbull",    desc:"Uma dose + misturante", preco:44.90 },
    { nome:"Red Label + Redbull",   desc:"Uma dose + misturante", preco:25.90 },
    { nome:"Black Label + Redbull", desc:"Uma dose + misturante", preco:35.90 },
  ]},
  { cat: "Garrafas", itens: [
    { nome:"Bananinha",          desc:"", preco:129.90 },
    { nome:"Black Label",        desc:"", preco:310.00 },
    { nome:"Don Luiz",           desc:"", preco:190.00 },
    { nome:"Jos",                desc:"", preco:169.00 },
    { nome:"Méric Gin (Tubo)",   desc:"", preco:95.90  },
    { nome:"Méric Vodka (Tubo)", desc:"", preco:65.90  },
    { nome:"Red Label",          desc:"", preco:220.00 },
    { nome:"Jack Daniels (Garrafa)",desc:"",preco:280.00},
    { nome:"Blonde (Garrafa)",   desc:"", preco:240.00 },
    { nome:"Ballena",            desc:"", preco:220.00 },
    { nome:"Vodka Elektra",      desc:"", preco:42.90  },
  ]},
];

const jaTemProdutos = db.prepare("SELECT COUNT(*) as n FROM produtos").get().n;
if (jaTemProdutos > 0) {
  console.log(`Produtos já cadastrados (${jaTemProdutos}). Pulando seed.`);
} else {
  const ins = db.prepare(`INSERT INTO produtos
    (categoria,nome,descricao,preco,estoque,estoque_minimo,ativo,ordem)
    VALUES (?,?,?,?,20,5,1,?)`);
  let ordem = 0;
  const tx = db.transaction(() => {
    CARDAPIO.forEach(c => c.itens.forEach(i => ins.run(c.cat, i.nome, i.desc, i.preco, ordem++)));
  });
  tx();
  console.log(`✅ ${CARDAPIO.reduce((a,c)=>a+c.itens.length,0)} produtos inseridos.`);
  console.log(`   Estoque inicial: 20 unidades cada. Ajuste no painel admin.`);
}

console.log(`\n🌴 Setup concluído! Agora rode: npm start`);
process.exit(0);
