/* VET-apps – updates: toont de versie, merkt een nieuwe versie op GitHub op en laadt die met één knop.
 * Werkt zonder de app opnieuw op het beginscherm te zetten. Je gegevens (op het toestel en in de cloud) blijven staan.
 * Zelfde bestand in VET Heat, VET Work en VET Office. De versie is de naam V in sw.js. */
(function () {
  const VU = { huidig: null, nieuw: null, bezig: false, gecontroleerd: 0 };
  // ?v=… van een vorige update uit de adresbalk halen (andere parameters, bv. van de bankkoppeling, blijven)
  try { const u = new URL(location.href); if (u.searchParams.has('v')) { u.searchParams.delete('v'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); } } catch (e) {}

  async function serverVersie() {
    const t = await (await fetch('sw.js?c=' + Date.now(), { cache: 'no-store' })).text();
    const m = t.match(/const V\s*=\s*['"]([^'"]+)['"]/); return m ? m[1] : null;
  }
  async function check(handmatig) {
    try {
      const n = await serverVersie(); if (!n) return;
      if (!VU.huidig) VU.huidig = n; // eerste controle na het openen = de versie die nu draait
      VU.nieuw = n !== VU.huidig ? n : null; VU.gecontroleerd = Date.now();
      toon();
      if (handmatig && !VU.nieuw) melding('Je hebt de nieuwste versie (' + VU.huidig + ')');
    } catch (e) { if (handmatig) melding('Geen verbinding: kan niet controleren op updates'); }
  }
  function melding(t) { if (typeof toast === 'function') return toast(t); const e = document.createElement('div'); e.textContent = t; e.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#1b2a33;color:#fff;padding:10px 16px;border-radius:10px;z-index:9999;font:14px system-ui'; document.body.appendChild(e); setTimeout(() => e.remove(), 2600); }
  function toon() {
    let b = document.getElementById('vetupd');
    if (!VU.nieuw) { if (b) b.remove(); } else {
      if (!b) { b = document.createElement('div'); b.id = 'vetupd'; b.style.cssText = 'position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:9998;background:#1b6a8a;color:#fff;padding:10px 12px 10px 16px;border-radius:12px;box-shadow:0 6px 24px rgba(0,0,0,.25);display:flex;gap:12px;align-items:center;font:600 14px system-ui;max-width:calc(100vw - 32px)'; document.body.appendChild(b); }
      b.innerHTML = '<span style="white-space:nowrap">Nieuwe versie beschikbaar</span><button onclick="vetUpdate()" style="background:#fff;color:#1b6a8a;border:0;border-radius:8px;padding:8px 12px;font:700 14px system-ui;cursor:pointer;margin:0;width:auto">Bijwerken</button>';
    }
    const k = document.getElementById('vetversie'); if (k) k.outerHTML = kaart();
  }
  async function update() {
    if (VU.bezig) return; VU.bezig = true; melding('Nieuwste versie ophalen…');
    try {
      const regs = navigator.serviceWorker && navigator.serviceWorker.getRegistrations ? await navigator.serviceWorker.getRegistrations() : [];
      for (const r of regs) { try { await r.update(); } catch (e) {} }
      if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); }
      // ook de browsercache van de app-bestanden vernieuwen
      const urls = ['index.html', 'sw.js', ...[...document.scripts].map((s) => s.getAttribute('src')).filter((s) => s && !/^https?:/.test(s))];
      await Promise.all(urls.map((u) => fetch(u, { cache: 'reload' }).catch(() => {})));
    } catch (e) {}
    if (typeof save === 'function') { try { await save(); } catch (e) {} }
    location.replace(location.pathname + '?v=' + Date.now());
  }
  function kaart() {
    const tijd = VU.gecontroleerd ? new Date(VU.gecontroleerd).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }) : '';
    return `<div id="vetversie" style="border-top:1px solid rgba(127,127,127,.25);margin-top:14px;padding-top:12px">
      <b>App-versie</b> <span class="mu">${VU.huidig || '…'}${VU.nieuw ? ' → nieuw: <b>' + VU.nieuw + '</b>' : VU.huidig ? ' · nieuwste versie' + (tijd ? ' (gecontroleerd ' + tijd + ')' : '') : ''}</span>
      <div class="row wrap" style="margin-top:8px;gap:8px"><button ${VU.nieuw ? '' : 'class="b2"'} onclick="vetUpdate()">${VU.nieuw ? 'Bijwerken naar de nieuwste versie' : 'Nieuwste versie laden'}</button><button class="b2" onclick="vetUpdateCheck(1)">Controleer op update</button></div>
      <p class="mu" style="margin:8px 0 0;font-size:12px">Je hoeft de app niet meer te verwijderen of opnieuw te installeren. Je gegevens blijven staan.</p>${window.THEMAKAART ? THEMAKAART() : ''}</div>`;
  }
  window.vetUpdate = update; window.vetUpdateCheck = check; window.VERSIEKAART = kaart;
  setTimeout(check, 1500);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && Date.now() - VU.gecontroleerd > 60000) check(); });
  setInterval(() => { if (document.visibilityState === 'visible') check(); }, 30 * 60000);
})();
