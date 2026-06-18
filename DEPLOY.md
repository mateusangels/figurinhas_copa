# 🚀 Deploy na Hostinger (Web app Node.js)

Mesma receita do projeto **curriculou**: um único app Node serve **o site + a API de pagamento**.

## 📁 Estrutura
```
Figurinhas/
├── server.js            ← startup file (Node/Express: site + API + Mercado Pago)
├── package.json
├── .env                 ← credenciais (NÃO subir pro GitHub)
├── .env.example
├── public_html/         ← o site (estático): index.html, sucesso.html, assets/
└── private/             ← NÃO público
    ├── album/album-completo-copa-2026.pdf
    └── orders.json      ← pedidos (gerado sozinho)
```
> O `server.js` serve `public_html/` e protege `private/` (o PDF só sai por
> `/api/download/:token`, e só para pedido pago).

## 1. Subir o app
**hPanel → Adicionar site → Web app Node.js** e conecte o repositório (ou faça upload).
- **Startup file:** `server.js`
- A Hostinger roda `npm install` e `npm start`.

## 2. Variáveis de ambiente (Environment Variables)
| Variável | Valor |
|---|---|
| `MP_ACCESS_TOKEN` | Access Token de **produção** do Mercado Pago (`APP_USR-...`) |
| `FRONTEND_URL` | `https://seudominio.com` |
| `BACKEND_URL` | `https://seudominio.com` |
| `PRECO_ALBUM` | `29.90` |
| `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASS` `SMTP_FROM` | dados de e-mail (já temos os do curriculou no `.env`) |

> 💡 É a **mesma `MP_ACCESS_TOKEN`** que o curriculou usa. Se for o mesmo Mercado Pago,
> use o mesmo token; se quiser separar as vendas, gere outra aplicação no MP.

## 3. Webhook do Mercado Pago
No painel do MP → **Webhooks**, aponte para:
```
https://seudominio.com/api/webhook
```
Evento: **Pagamentos (payment)**.

## 4. Testar
1. Abra o site → **"Quero o álbum"** → vai pro Checkout Pro do MP.
2. Pague (use contas de teste do MP antes da produção).
3. Cai em `sucesso.html`, o download libera (mesmo via Pix, pois conferimos direto no MP)
   e o link também vai pro e-mail.

## ▶️ Rodar local
```bash
npm install
npm start          # http://localhost:3333
```
- Sem `MP_ACCESS_TOKEN`, o botão cai em **modo demonstração** (não cobra).
- Defina o token no `.env` para testar o fluxo real.

## ⚠️ Antes de publicar
- **Não suba** `node_modules/`, `.env`, nem a pasta `_tools/` (é só de desenvolvimento).
- **PDF tem ~244 MB** — pesado. Comprima antes (cai p/ ~40 MB sem perder qualidade):
  ```
  gs -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH \
     -sOutputFile=album-comprimido.pdf album-completo-copa-2026.pdf
  ```
  e substitua o arquivo em `private/album/`.

## ❗ Lembrete legal
A arte é da Panini/FIFA e o PDF tinha marca d'água de terceiros — vender tem risco
de direitos autorais. A plataforma está pronta para qualquer conteúdo (de preferência próprio/licenciado).
