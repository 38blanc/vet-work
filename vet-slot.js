/* VET-apps – vergrendeling: zonder cloud-login is de app niet te gebruiken.
 * Uitloggen synchroniseert eerst alles en wist daarna de gegevens van deze app op dit toestel.
 * Zelfde bestand in VET Heat, VET Work en VET Office. Laden in <head> (vóór de app-scripts). */
(function () {
  const pad = location.pathname.toLowerCase();
  const APP = /vet-work|werkbon/.test(pad) ? { db: 'wb', ls: ['wb'], meta: 'work', naam: 'VET Work' }
    : /vet-office/.test(pad) ? { db: 'vetoffice', ls: ['vo_eb_state'], meta: 'office', naam: 'VET Office' }
    : { db: 'vetheat', ls: ['vetheat'], meta: 'heat', naam: 'VET Heat' };

  // 1) gegevens wissen na uitloggen – vóór de app haar database opent
  try {
    if (sessionStorage.getItem('vetWis') === APP.db) {
      sessionStorage.removeItem('vetWis');
      indexedDB.deleteDatabase(APP.db);
      APP.ls.forEach((k) => localStorage.removeItem(k));
      localStorage.removeItem('vetsync_meta_' + APP.meta);
    }
  } catch (e) {}

  const css = document.createElement('style');
  css.textContent = `#vetslot{position:fixed;inset:0;z-index:99999;background:var(--bg,#eef1f4);display:flex;align-items:center;justify-content:center;padding:20px;font:15px system-ui,-apple-system,sans-serif}
  #vetslot .k{background:var(--card,#fff);color:var(--tx,#1b2a33);border-radius:16px;box-shadow:0 10px 40px rgba(0,0,0,.12);padding:28px 24px;width:100%;max-width:360px;text-align:center}
  #vetslot img{height:64px;margin-bottom:6px}#vetslot h1{font-size:22px;margin:4px 0 4px}#vetslot p{margin:0 0 18px;opacity:.7;font-size:14px}
  #vetslot input{display:block;width:100%;box-sizing:border-box;margin:0 0 10px;padding:12px 14px;border-radius:10px;border:1px solid rgba(127,127,127,.35);font:16px system-ui;background:var(--in,#f6f8fa);color:inherit}
  #vetslot button{width:100%;padding:12px;border:0;border-radius:10px;background:#1b6a8a;color:#fff;font:700 16px system-ui;cursor:pointer;margin-top:4px}
  #vetslot .f{color:#c0392b;font-size:13px;margin-top:10px;min-height:16px}
  body.vetslot>*:not(#vetslot){visibility:hidden}`;
  document.head.appendChild(css);

  const heeftCloud = () => typeof CLOUD !== 'undefined';
  const sessie = () => { try { return heeftCloud() && !!CLOUD.session(); } catch (e) { return false; } };
  function toon() {
    if (document.getElementById('vetslot')) return;
    document.body.classList.add('vetslot');
    const d = document.createElement('div'); d.id = 'vetslot';
    d.innerHTML = `<form class="k" onsubmit="event.preventDefault();vetInloggen()"><img src="logo-app.png" alt=""><h1>${APP.naam}</h1><p>Log in met je VET-account om verder te gaan.</p>
      <input id="vsE" type="email" autocomplete="username" placeholder="E-mail" required><input id="vsP" type="password" autocomplete="current-password" placeholder="Wachtwoord" required>
      <button id="vsB" type="submit">Inloggen</button><div class="f" id="vsF"></div></form>`;
    document.body.appendChild(d); setTimeout(() => { const e = document.getElementById('vsE'); if (e) e.focus(); }, 50);
  }
  function verberg() { const d = document.getElementById('vetslot'); if (d) d.remove(); document.body.classList.remove('vetslot'); }
  async function vetInloggen() {
    const e = document.getElementById('vsE').value, p = document.getElementById('vsP').value, b = document.getElementById('vsB'), f = document.getElementById('vsF');
    b.disabled = true; b.textContent = 'Inloggen…'; f.textContent = '';
    try { await CLOUD.login(e, p); verberg(); if (typeof R === 'function') R(); }
    catch (x) { f.textContent = /invalid|credentials|400/i.test(x.message) ? 'E-mail of wachtwoord klopt niet.' : !navigator.onLine ? 'Geen internet. Inloggen kan enkel online.' : 'Inloggen mislukt: ' + x.message; b.disabled = false; b.textContent = 'Inloggen'; }
  }
  async function vetUitloggen() {
    if (!confirm('Uitloggen op dit toestel?\n\nAlles wordt eerst naar de cloud gestuurd en daarna van dit toestel gewist. Na opnieuw inloggen komt alles terug.')) return;
    if (!navigator.onLine) return alert('Geen internet: uitloggen kan pas als alles naar de cloud gestuurd is. Probeer opnieuw met internet.');
    try { if (typeof save === 'function') await save(); } catch (e) {}
    await CLOUD.sync(); for (let i = 0; i < 60 && CLOUD.busy; i++) await new Promise((r) => setTimeout(r, 500));
    const cs = typeof CS !== 'undefined' ? CS : {}; const st = cs.state; const ro = typeof RO !== 'undefined' && RO;
    if (st !== 'ok' && !ro) return alert('Nog niet alles staat in de cloud (' + (cs.error || st || 'onbekend') + ').\nUitloggen gaat niet, zodat je niets verliest. Probeer straks opnieuw.');
    try { sessionStorage.setItem('vetWis', APP.db); } catch (e) {}
    CLOUD.logout(); location.replace(location.pathname);
  }
  window.vetInloggen = vetInloggen; window.vetUitloggen = vetUitloggen;
  function check() { if (!heeftCloud()) return; if (sessie()) verberg(); else toon(); }
  addEventListener('load', () => { check(); setInterval(check, 1500); });
})();
