/* Álbum da Copa 2026 — produto único */
(function () {
  "use strict";
  const cfg = window.SITE_CONFIG, FLAGS = window.FLAGS || [];
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const fmt = (v) => cfg.moeda + " " + v.toFixed(2).replace(".", ",");
  const flag = (code, w = 80) => `https://flagcdn.com/w${w}/${code}.png`;
  const NOMES = {br:"Brasil",ar:"Argentina",fr:"França",de:"Alemanha",es:"Espanha","gb-eng":"Inglaterra",pt:"Portugal",nl:"Holanda",be:"Bélgica",hr:"Croácia",uy:"Uruguai",co:"Colômbia",mx:"México",us:"EUA",ca:"Canadá",jp:"Japão",kr:"Coreia",ma:"Marrocos",sn:"Senegal",gh:"Gana",cm:"Camarões",ci:"C. Marfim",dz:"Argélia",eg:"Egito",tn:"Tunísia",za:"África do Sul",au:"Austrália",ir:"Irã",sa:"A. Saudita",qa:"Catar",uz:"Uzbequistão",ec:"Equador",py:"Paraguai",dk:"Dinamarca",se:"Suécia",no:"Noruega",ch:"Suíça",at:"Áustria","gb-sct":"Escócia",rs:"Sérvia",tr:"Turquia",cz:"Tchéquia",nz:"N. Zelândia",pa:"Panamá",cd:"RD Congo",ba:"Bósnia",iq:"Iraque",ng:"Nigéria"};

  let buying = false;
  function checkout() {
    if (buying) return;
    buying = true;
    confetti();
    // Leva pra tela de pagamento do próprio site (Pix com QR + comemoração automática).
    setTimeout(() => { location.href = "/pagamento.html"; }, 250);
  }

  /* confete ao comprar / divertido */
  function confetti() {
    const layer = $("#confetti"); if (!layer) return;
    const cores = ["#ea0000", "#ffcf3f", "#1d8b3a", "#ffffff", "#111"];
    for (let i = 0; i < 60; i++) {
      const c = document.createElement("div");
      const size = 6 + Math.random() * 8;
      c.style.cssText = `position:absolute;top:-20px;left:${Math.random()*100}%;width:${size}px;height:${size*0.6}px;
        background:${cores[i%cores.length]};border-radius:2px;opacity:.95;transform:rotate(${Math.random()*360}deg);`;
      layer.appendChild(c);
      const dur = 1800 + Math.random() * 1400;
      c.animate([{transform:c.style.transform,top:"-20px"},
                 {transform:`rotate(${Math.random()*720}deg)`,top:"105%"}],
                {duration:dur,easing:"cubic-bezier(.2,.6,.4,1)"}).onfinish = () => c.remove();
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    // rastreio de visita p/ o dashboard — id anônimo guardado no navegador
    try {
      let vid = localStorage.getItem("vid");
      if (!vid) { vid = Date.now().toString(36) + Math.random().toString(36).slice(2, 10); localStorage.setItem("vid", vid); }
      fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "visita", vid }), keepalive: true }).catch(() => {});
    } catch (e) {}

    // preenche textos dinâmicos
    const reais = Math.floor(cfg.precoAlbum);
    const cent = Math.round((cfg.precoAlbum - reais) * 100).toString().padStart(2, "0");
    $$("[data-preco-album]").forEach(e => e.innerHTML = e.classList.contains("por")
      ? `R$ ${reais}<small>,${cent}</small>` : fmt(cfg.precoAlbum));
    $$("[data-preco-de]").forEach(e => e.textContent = fmt(cfg.precoDe));
    $$("[data-total-selecoes]").forEach(e => e.textContent = cfg.totalSelecoes);
    $$("[data-total-figurinhas]").forEach(e => e.textContent = cfg.totalFigurinhas);

    // faixa vermelha
    const bt = $("#bandTrack");
    if (bt) {
      const items = FLAGS.map(c => `<span><img src="${flag(c)}" alt="">${(NOMES[c]||"").toUpperCase()}</span>`).join("");
      bt.innerHTML = items + items;
    }
    // chips de bandeiras
    const fw = $("#flagsWrap");
    if (fw) fw.innerHTML = FLAGS.map(c => `<span class="flag-chip"><img src="${flag(c)}" alt="">${NOMES[c]||c}</span>`).join("");

    // botões comprar (apenas <button>; âncoras data-buy rolam até a oferta)
    $$("button[data-buy]").forEach(b => b.addEventListener("click", checkout));

    // nav scrolled
    const nav = $("#nav");
    const onScroll = () => nav?.classList.toggle("scrolled", scrollY > 20);
    addEventListener("scroll", onScroll, {passive:true}); onScroll();

    // FAQ
    $$(".faq-q").forEach(q => q.addEventListener("click", () => {
      const it = q.closest(".faq-item"), a = it.querySelector(".faq-a"), open = it.classList.contains("open");
      $$(".faq-item").forEach(i => { i.classList.remove("open"); i.querySelector(".faq-a").style.maxHeight = null; });
      if (!open) { it.classList.add("open"); a.style.maxHeight = a.scrollHeight + "px"; }
    }));

    // reveal
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
    }), {threshold:.12});
    $$("[data-reveal]").forEach(el => io.observe(el));

    // stickers flutuando (sutil, humano)
    if (window.gsap) {
      $$("[data-float]").forEach((el, i) => {
        gsap.to(el, {y:"-=12", rotation:"+=2", duration:2.4+i*0.3, yoyo:true, repeat:-1, ease:"sine.inOut"});
      });
      gsap.from(".hero h1,.hero .lead,.hero-cta,.hero-trust", {y:24, opacity:0, duration:.7, stagger:.1, ease:"power2.out"});
    }
  });
})();
