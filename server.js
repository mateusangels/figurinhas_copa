/* =========================================================================
   Álbum da Copa 2026 — servidor Node/Express (site + API de pagamento)
   Mesmo padrão do projeto "curriculou": 1 app Node serve tudo na Hostinger.
   ========================================================================= */
import 'dotenv/config';
import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import nodemailer from 'nodemailer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3333;
// Garante esquema https:// nas URLs públicas (se esquecer no .env, o Mercado Pago
// recusa back_urls/notification_url e o Pix quebra com "tente novamente").
function comEsquema(u, fallback) {
  u = String(u || '').trim();
  if (!u) return fallback;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u.replace(/\/+$/, '');
}
const FRONT = comEsquema(process.env.FRONTEND_URL, `http://localhost:${PORT}`);
const BACK  = comEsquema(process.env.BACKEND_URL, FRONT);
const PRECO = Number(process.env.PRECO_ALBUM || 29.90);

const PUBLIC_DIR = path.join(__dirname, 'public_html');
const PDF_PATH   = path.join(__dirname, 'private', 'album', 'album-completo-copa-2026.pdf');
const PDF_NAME   = 'Album-Completo-Copa-2026.pdf';
const ORDERS_FILE = path.join(__dirname, 'private', 'orders.json');
const STATS_FILE  = path.join(__dirname, 'private', 'analytics.json');
const DASHBOARD_PATH = path.join(__dirname, 'private', 'dashboard.html');

const app = express();
app.set('trust proxy', true); // atrás do proxy da Hostinger, pega o IP/proto real
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ── Pedidos (armazenados em JSON no disco) ──────────────────────────────── */
function lerPedidos() { try { return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')); } catch { return {}; } }
function salvarPedidos(o) { fs.mkdirSync(path.dirname(ORDERS_FILE), { recursive: true }); fs.writeFileSync(ORDERS_FILE, JSON.stringify(o, null, 2)); }
function getPedido(id) { return lerPedidos()[id] || null; }
function setPedido(p) { const o = lerPedidos(); o[p.id] = p; salvarPedidos(o); }
function pedidoPorToken(t) { return Object.values(lerPedidos()).find((p) => p.token === t) || null; }
const novoId = () => 'al_' + crypto.randomBytes(10).toString('hex');

/* ── Métricas (dashboard) — agregadas por dia em JSON no disco ────────────── */
function lerStats() { try { return JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); } catch { return { dias: {} }; } }
function salvarStats(s) { fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true }); fs.writeFileSync(STATS_FILE, JSON.stringify(s, null, 2)); }
const diaHoje = () => new Date().toISOString().slice(0, 10);
function registrar(tipo, opts = {}) {
  try {
    const s = lerStats();
    const dia = diaHoje();
    const d = s.dias[dia] || (s.dias[dia] = { visitas: 0, unicos: [], checkouts: 0, pagos: 0, receita: 0 });
    if (tipo === 'visita') {
      d.visitas++;
      if (opts.visitorId && !d.unicos.includes(opts.visitorId)) d.unicos.push(opts.visitorId);
    } else if (tipo === 'checkout') {
      d.checkouts++;
    } else if (tipo === 'pago') {
      d.pagos++;
      d.receita += Number(opts.valor || PRECO);
    }
    salvarStats(s);
  } catch (e) { console.error('registrar', e?.message || e); }
}

/* ── Mercado Pago (SDK oficial — igual ao curriculou) ────────────────────── */
async function getMercadoPago() {
  if (!process.env.MP_ACCESS_TOKEN) return null;
  const mod = await import('mercadopago');
  const MP = mod.MercadoPagoConfig || mod.default?.MercadoPagoConfig;
  const Preference = mod.Preference || mod.default?.Preference;
  const Payment = mod.Payment || mod.default?.Payment;
  return { client: new MP({ accessToken: process.env.MP_ACCESS_TOKEN }), Preference, Payment };
}

/* ── E-mail (nodemailer / SMTP) — só envia se SMTP_* estiver definido ────── */
let _mailer = null;
function getMailer() {
  if (_mailer !== null) return _mailer || null;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) { _mailer = false; return null; }
  _mailer = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || '1') === '1',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return _mailer;
}
async function enviarEmail(pedido) {
  if (!pedido.email) return { ok: false, motivo: 'pedido sem e-mail' };
  const t = getMailer(); if (!t) return { ok: false, motivo: 'SMTP não configurado (SMTP_HOST/USER/PASS)' };
  const link = `${FRONT}/api/download/${pedido.token}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
    <h2 style="color:#ea0000">Pagamento aprovado! 🎉</h2>
    <p>Obrigado pela compra! Clique para baixar o seu <b>Álbum Completo da Copa 2026</b> em PDF:</p>
    <p><a href="${link}" style="background:#ea0000;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:bold">⬇️ Baixar meu álbum</a></p>
    <p style="color:#666;font-size:13px">Ou copie o link: ${link}</p></div>`;
  try {
    const info = await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: pedido.email,
      subject: 'Seu Álbum Completo da Copa 2026 está pronto! 🏆', html });
    console.log('email enviado p/', pedido.email, '-', info?.response || info?.messageId || 'ok');
    return { ok: true, to: pedido.email, resposta: info?.response || info?.messageId || 'enviado' };
  } catch (e) {
    console.error('email', e?.message || e);
    return { ok: false, motivo: e?.message || String(e) };
  }
}

/* ── Confirmação de pagamento ────────────────────────────────────────────── */
async function aoConfirmarPagamento(id, email) {
  const p = getPedido(id);
  if (!p || p.status === 'pago') return;
  p.status = 'pago';
  if (email) p.email = email;
  setPedido(p);
  registrar('pago', { valor: PRECO }); // venda confirmada
  await enviarEmail(p);
}
// Rede de segurança p/ Pix: consulta o MP direto pelo external_reference.
async function conferirPagamentoNoMP(id) {
  try {
    const mp = await getMercadoPago(); if (!mp) return false;
    const r = await new mp.Payment(mp.client).search({ options: { external_reference: id } });
    const aprovado = (r?.results || []).find((p) => p?.status === 'approved');
    if (aprovado) { await aoConfirmarPagamento(id, aprovado.payer?.email); return true; }
    return false;
  } catch (e) { console.error('conferirPagamentoNoMP', e?.message || e); return false; }
}

/* ── API ─────────────────────────────────────────────────────────────────── */
// Cartão/boleto — Checkout Pro (redirect). O Pix tem fluxo próprio em /api/criar-pix.
app.post('/api/criar-pagamento', async (req, res) => {
  try {
    const mp = await getMercadoPago();
    if (!mp) return res.status(503).json({ erro: 'Pagamento ainda não configurado (defina MP_ACCESS_TOKEN).' });
    const email = String(req.body?.email || '').trim() || null;
    const id = novoId();
    setPedido({ id, token: crypto.randomBytes(16).toString('hex'), status: 'pendente', email, criado: new Date().toISOString() });
    registrar('checkout'); // clicou em comprar (gerou intenção de pagamento)
    const ehLocal = /localhost|127\.0\.0\.1/.test(FRONT);
    const body = {
      items: [{ id: 'album-copa-2026', title: 'Álbum Completo da Copa 2026 (PDF)', quantity: 1, unit_price: Number(PRECO), currency_id: 'BRL' }],
      ...(email ? { payer: { email } } : {}),
      external_reference: id,
      notification_url: `${BACK}/api/webhook`,
      // Pix tem tela própria no site; aqui deixamos só cartão/boleto.
      payment_methods: { excluded_payment_types: [{ id: 'bank_transfer' }] },
      back_urls: {
        success: `${FRONT}/sucesso.html?order=${id}`,
        pending: `${FRONT}/sucesso.html?order=${id}`,
        failure: `${FRONT}/?pagamento=falhou`,
      },
    };
    // auto_return exige URL pública — no localhost o MP recusa, então só em produção.
    if (!ehLocal) body.auto_return = 'approved';
    const pref = await new mp.Preference(mp.client).create({ body });
    res.json({ ok: true, id, init_point: pref.init_point, sandbox_init_point: pref.sandbox_init_point });
  } catch (e) {
    console.error('criar-pagamento', e?.message || e);
    res.status(500).json({ erro: 'Falha ao criar pagamento' });
  }
});

// Pix — gera o QR DENTRO do site (Checkout Transparente). A página fica consultando
// /api/status/:id e comemora sozinha quando o pagamento cai.
app.post('/api/criar-pix', async (req, res) => {
  try {
    const mp = await getMercadoPago();
    if (!mp) return res.status(503).json({ erro: 'Pagamento ainda não configurado (defina MP_ACCESS_TOKEN).' });
    const email = String(req.body?.email || '').trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ erro: 'E-mail inválido.' });
    const id = novoId();
    setPedido({ id, token: crypto.randomBytes(16).toString('hex'), status: 'pendente', email, criado: new Date().toISOString() });
    registrar('checkout');
    const payment = await new mp.Payment(mp.client).create({
      body: {
        transaction_amount: Number(PRECO),
        description: 'Álbum Completo da Copa 2026 (PDF)',
        payment_method_id: 'pix',
        payer: { email },
        external_reference: id,
        notification_url: `${BACK}/api/webhook`,
      },
      requestOptions: { idempotencyKey: id },
    });
    const tx = payment?.point_of_interaction?.transaction_data || {};
    if (!tx.qr_code) throw new Error('Pix sem QR (verifique chave Pix/valor mínimo na conta MP)');
    res.json({
      ok: true, id,
      qr_code: tx.qr_code,                 // copia-e-cola
      qr_code_base64: tx.qr_code_base64,   // imagem PNG (base64)
      ticket_url: tx.ticket_url || null,
      valor: Number(PRECO),
    });
  } catch (e) {
    console.error('criar-pix', e?.message || e);
    res.status(500).json({ erro: 'Falha ao gerar o Pix' });
  }
});

app.post('/api/webhook', async (req, res) => {
  try {
    const mp = await getMercadoPago();
    const tipo = String(req.query.type || req.query.topic || req.body?.type || '');
    const id = req.body?.data?.id || req.query['data.id'] || req.query.id;
    if (mp && id && tipo.includes('payment')) {
      const payment = await new mp.Payment(mp.client).get({ id });
      if (payment?.external_reference && payment?.status === 'approved') {
        await aoConfirmarPagamento(payment.external_reference, payment.payer?.email);
      }
    }
    res.sendStatus(200);
  } catch (e) { console.error('webhook', e?.message || e); res.sendStatus(200); }
});

// A página de sucesso consulta isto até aprovar (e confere no MP se preciso).
app.get('/api/status/:id', async (req, res) => {
  let p = getPedido(req.params.id);
  if (p && p.status !== 'pago') { if (await conferirPagamentoNoMP(p.id)) p = getPedido(p.id); }
  if (!p) return res.json({ status: 'not_found', download: null });
  res.json({ status: p.status === 'pago' ? 'paid' : 'pending', download: p.status === 'pago' ? `/api/download/${p.token}` : null });
});

// Entrega o PDF só para pedido pago, via token (streaming nativo do Express).
app.get('/api/download/:token', (req, res) => {
  const p = pedidoPorToken(req.params.token);
  if (!p || p.status !== 'pago') return res.status(403).send('Acesso negado. Pagamento não localizado.');
  if (!fs.existsSync(PDF_PATH)) return res.status(404).send('Arquivo indisponível no momento.');
  res.download(PDF_PATH, PDF_NAME);
});

// Beacon de visita disparado pelo front (só aceitamos o evento "visita" do cliente).
app.post('/api/track', (req, res) => {
  if (String(req.body?.event || 'visita') === 'visita') {
    const vid = String(req.body?.vid || '').slice(0, 64) || null;
    registrar('visita', { visitorId: vid });
  }
  res.sendStatus(204);
});

/* ── Dashboard protegido (HTTP Basic Auth) ───────────────────────────────── */
function igual(a, b) {
  const ba = Buffer.from(String(a)), bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}
function requireAdmin(req, res, next) {
  const USER = process.env.ADMIN_USER || 'admin';
  const PASS = process.env.ADMIN_PASS;
  if (!PASS) return res.status(503).send('Dashboard não configurado: defina ADMIN_PASS no .env.');
  const [tipo, b64] = String(req.headers.authorization || '').split(' ');
  if (tipo === 'Basic' && b64) {
    const [u, p] = Buffer.from(b64, 'base64').toString().split(':');
    if (igual(u, USER) && igual(p, PASS)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Dashboard Album Copa 2026"');
  res.status(401).send('Autenticação necessária.');
}

const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const s = lerStats();
  const dias = Object.entries(s.dias).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([dia, d]) => ({
    dia, visitas: d.visitas || 0, unicos: (d.unicos || []).length,
    checkouts: d.checkouts || 0, pagos: d.pagos || 0, receita: d.receita || 0,
  }));
  const tot = dias.reduce((o, d) => ({
    visitas: o.visitas + d.visitas, checkouts: o.checkouts + d.checkouts,
    pagos: o.pagos + d.pagos, receita: o.receita + d.receita,
  }), { visitas: 0, checkouts: 0, pagos: 0, receita: 0 });
  const uni = new Set();
  Object.values(s.dias).forEach((d) => (d.unicos || []).forEach((v) => uni.add(v)));
  const pedidos = Object.values(lerPedidos())
    .sort((a, b) => (a.criado < b.criado ? 1 : -1)).slice(0, 50)
    .map((p) => ({ id: p.id, status: p.status, email: p.email, criado: p.criado }));
  res.json({
    totais: {
      ...tot, visitantes: uni.size,
      convCheckout: pct(tot.checkouts, tot.visitas), // visita -> clicou comprar
      convVenda: pct(tot.pagos, tot.checkouts),       // clicou comprar -> pagou
    },
    dias, pedidos,
  });
});
app.get(['/admin', '/dashboard'], requireAdmin, (req, res) => res.sendFile(DASHBOARD_PATH));

// Reenvia o e-mail do PDF de um pedido e RETORNA o resultado real do SMTP.
// Uso: /api/admin/reenviar/<id_do_pedido>?email=opcional@trocar.com
app.get('/api/admin/reenviar/:id', requireAdmin, async (req, res) => {
  const p = getPedido(req.params.id);
  if (!p) return res.status(404).json({ ok: false, motivo: 'pedido não encontrado' });
  const dest = String(req.query.email || '').trim();
  const alvo = dest ? { ...p, email: dest } : p;
  const r = await enviarEmail(alvo);
  res.json({ pedido: p.id, status: p.status, para: alvo.email || null, ...r });
});

/* ── Site estático ───────────────────────────────────────────────────────── */
app.use(express.static(PUBLIC_DIR));
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.listen(PORT, () => console.log(`🏆 Álbum da Copa rodando em ${FRONT} (porta ${PORT})`));
