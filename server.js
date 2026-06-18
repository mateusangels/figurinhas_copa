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
const FRONT = process.env.FRONTEND_URL || `http://localhost:${PORT}`;
const PRECO = Number(process.env.PRECO_ALBUM || 29.90);

const PUBLIC_DIR = path.join(__dirname, 'public_html');
const PDF_PATH   = path.join(__dirname, 'private', 'album', 'album-completo-copa-2026.pdf');
const PDF_NAME   = 'Album-Completo-Copa-2026.pdf';
const ORDERS_FILE = path.join(__dirname, 'private', 'orders.json');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* ── Pedidos (armazenados em JSON no disco) ──────────────────────────────── */
function lerPedidos() { try { return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')); } catch { return {}; } }
function salvarPedidos(o) { fs.mkdirSync(path.dirname(ORDERS_FILE), { recursive: true }); fs.writeFileSync(ORDERS_FILE, JSON.stringify(o, null, 2)); }
function getPedido(id) { return lerPedidos()[id] || null; }
function setPedido(p) { const o = lerPedidos(); o[p.id] = p; salvarPedidos(o); }
function pedidoPorToken(t) { return Object.values(lerPedidos()).find((p) => p.token === t) || null; }
const novoId = () => 'al_' + crypto.randomBytes(10).toString('hex');

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
  if (!pedido.email) return;
  const t = getMailer(); if (!t) return;
  const link = `${FRONT}/api/download/${pedido.token}`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto">
    <h2 style="color:#ea0000">Pagamento aprovado! 🎉</h2>
    <p>Obrigado pela compra! Clique para baixar o seu <b>Álbum Completo da Copa 2026</b> em PDF:</p>
    <p><a href="${link}" style="background:#ea0000;color:#fff;padding:14px 26px;border-radius:999px;text-decoration:none;font-weight:bold">⬇️ Baixar meu álbum</a></p>
    <p style="color:#666;font-size:13px">Ou copie o link: ${link}</p></div>`;
  try {
    await t.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: pedido.email,
      subject: 'Seu Álbum Completo da Copa 2026 está pronto! 🏆', html });
  } catch (e) { console.error('email', e?.message || e); }
}

/* ── Confirmação de pagamento ────────────────────────────────────────────── */
async function aoConfirmarPagamento(id, email) {
  const p = getPedido(id);
  if (!p || p.status === 'pago') return;
  p.status = 'pago';
  if (email) p.email = email;
  setPedido(p);
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
app.post('/api/criar-pagamento', async (req, res) => {
  try {
    const mp = await getMercadoPago();
    if (!mp) return res.status(503).json({ erro: 'Pagamento ainda não configurado (defina MP_ACCESS_TOKEN).' });
    const id = novoId();
    setPedido({ id, token: crypto.randomBytes(16).toString('hex'), status: 'pendente', email: null, criado: new Date().toISOString() });
    const pref = await new mp.Preference(mp.client).create({
      body: {
        items: [{ id: 'album-copa-2026', title: 'Álbum Completo da Copa 2026 (PDF)', quantity: 1, unit_price: Number(PRECO), currency_id: 'BRL' }],
        external_reference: id,
        notification_url: `${process.env.BACKEND_URL || FRONT}/api/webhook`,
        back_urls: {
          success: `${FRONT}/sucesso.html?order=${id}`,
          pending: `${FRONT}/sucesso.html?order=${id}`,
          failure: `${FRONT}/?pagamento=falhou`,
        },
        auto_return: 'approved',
      },
    });
    res.json({ ok: true, id, init_point: pref.init_point, sandbox_init_point: pref.sandbox_init_point });
  } catch (e) {
    console.error('criar-pagamento', e?.message || e);
    res.status(500).json({ erro: 'Falha ao criar pagamento' });
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

/* ── Site estático ───────────────────────────────────────────────────────── */
app.use(express.static(PUBLIC_DIR));
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

app.listen(PORT, () => console.log(`🏆 Álbum da Copa rodando em ${FRONT} (porta ${PORT})`));
