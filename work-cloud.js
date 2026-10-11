/* VET Work – koppeling met de cloud (Supabase) en met VET Heat.
 * Gebruikt de globale toestand S en de functies uit index.html. */
let CS = { state: 'uit' };
const splitPc = (adres) => { const m = String(adres || '').match(/^(.*?)[,\s]+(\d{4}\s+.+)$/); return m ? { straat: m[1].trim(), pc: m[2].trim() } : { straat: adres || '', pc: '' }; };
const toShared = (c) => { const sp = splitPc(c.adres); return { n: c.n || '', straat: sp.straat, pc: sp.pc, adres: c.adres || '', tel: c.tel || '', mail: c.mail || '', inst: c.inst || null }; };
const nextNr = () => 'WB-' + new Date().getFullYear() + '-' + String(++S.seq).padStart(3, '0');

const CLOUD = VETSync.create({
  app: 'work',
  pullApps: ['work', 'shared'],
  collect() {
    const out = [];
    S.orders.forEach((o) => out.push({ app: 'work', kind: 'order', id: o.id, data: o }));
    S.clients.forEach((c) => out.push({ app: 'shared', kind: 'client', id: c.id, data: toShared(c) }));
    if (S.artKlaar || (S.articles || []).length) { S.artKlaar = true; out.push({ app: 'shared', kind: 'articles', id: 'main', data: { list: (S.articles || []).map((a) => ({ id: a.id, n: a.n || '', p: a.p == null || a.p === '' ? null : Number(a.p), u: a.u || 'stuk', det: a.det || '', btw: a.btw || '' })) } }); }
    out.push({ app: 'work', kind: 'settings', id: 'main', data: { articles: S.articles, seq: S.seq, tsig: S.tsig || '', lay: S.lay || 0 } });
    return out;
  },
  async apply(rows) {
    let curChanged = false, nieuw = 0;
    for (const r of rows) {
      if (r.kind === 'order') {
        const i = S.orders.findIndex((o) => o.id === r.id);
        if (r.deleted) { if (i > -1) S.orders.splice(i, 1); continue; }
        const o = r.data;
        if (!o.nr) {
          // nieuwe werkbon vanuit VET Heat: nummer toekennen en prijzen uit de artikellijst invullen
          o.nr = nextNr();
          (o.werk || []).forEach((w) => { const a = S.articles.find((x) => x.n.trim().toLowerCase() === w.n.trim().toLowerCase()); if (a) { if (w.p == null && a.p != null) w.p = a.p; if (!w.u) w.u = a.u; } });
          nieuw++;
        }
        if (i > -1) S.orders[i] = o; else S.orders.unshift(o);
        if (r.id === cur) curChanged = true;
      } else if (r.kind === 'client') {
        if (r.deleted) { S.clients = S.clients.filter((c) => c.id !== r.id); continue; }
        const d = r.data;
        let c = S.clients.find((x) => x.id === r.id);
        if (!c) {
          const twin = S.clients.find((x) => x.n.trim().toLowerCase() === (d.n || '').trim().toLowerCase());
          if (twin) { const old = twin.id; twin.id = r.id; CLOUD.markDeleted('shared', 'client', old); c = twin; }
          else { c = { id: r.id }; S.clients.push(c); }
        }
        Object.assign(c, { n: d.n || '', adres: d.adres || [d.straat, d.pc].filter(Boolean).join(', '), tel: d.tel || '', mail: d.mail || '' });
        if (d.inst) c.inst = d.inst;
      } else if (r.kind === 'articles' && !r.deleted) {
        // gedeelde artikellijst met VET Office
        const list = (r.data && r.data.list) || [];
        if (!S.artKlaar) { const namen = new Set(list.map((a) => (a.n || '').trim().toLowerCase())); (S.articles || []).forEach((a) => { if (a.n && !namen.has(a.n.trim().toLowerCase())) list.push(a); }); S.artKlaar = true; CLOUD.soon(500); }
        S.articles = list.map((a) => Object.assign({}, a, { u: a.u || 'stuk' }));
      } else if (r.kind === 'settings' && !r.deleted) {
        const d = r.data || {};
        if (Array.isArray(d.articles) && !S.artKlaar) S.articles = d.articles;
        S.seq = Math.max(S.seq || 0, d.seq || 0);
        if (d.tsig) S.tsig = d.tsig;
        if (d.lay != null) S.lay = d.lay;
      }
    }
    await save(true);
    if (nieuw) CLOUD.soon(300); // toegekend nummer meteen terugsturen
    const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);
    if (!typing && !(v === 'ord' && !curChanged && !rows.some((r) => r.kind === 'client'))) R();
  },
  onStatus(st) { CS = st; const e = document.getElementById('cloudst'); if (e) e.outerHTML = CLOUDST(); const c = document.getElementById('cloudcard'); if (c && CLOUD.session()) c.outerHTML = CLOUDCARD(); /* inlogformulier niet overschrijven terwijl je typt */ }
});

const hm2 = (t) => t ? new Date(t).toLocaleTimeString('nl-BE', { hour: '2-digit', minute: '2-digit' }) : '';
const CLOUDST = () => {
  if (!CLOUD.session()) return '<span id="cloudst"></span>';
  const s = CS.state, t = { ok: '☁︎ Gesynchroniseerd ' + hm2(CS.last), bezig: '☁︎ Synchroniseren…', offline: '☁︎ Offline – wordt later verstuurd', fout: '⚠ Sync-fout – tik voor details' }[s] || '☁︎';
  return `<span id="cloudst" class="mu" style="font-size:13px;cursor:pointer;${s === 'fout' ? 'color:var(--rd)' : ''}" onclick="go('set')">${t}</span>`;
};
const CLOUDCARD = () => {
  const s = CLOUD.session();
  if (!s) return `<div class="c" id="cloudcard"><h2>Cloud (VET Work + VET Heat)</h2><p class="mu">Log in om je gegevens automatisch te bewaren in de cloud en te delen met VET Heat en je andere toestellen.</p>
<input id="ce" type="email" placeholder="E-mail" autocomplete="username"><input id="cp" type="password" placeholder="Wachtwoord" autocomplete="current-password">
<button onclick="cloudLogin(this)">Inloggen</button></div>`;
  return `<div class="c" id="cloudcard"><h2>Cloud (VET Work + VET Heat)</h2><p style="margin:0 0 6px">Ingelogd als <b>${esc(s.user.email)}</b></p>
<p class="mu" style="margin:0 0 10px">${{ ok: '✓ Alles gesynchroniseerd om ' + hm2(CS.last), bezig: 'Bezig met synchroniseren…', offline: 'Geen internet: wijzigingen worden verstuurd zodra je weer online bent.', fout: 'Fout: ' + esc(CS.error || '') }[CS.state] || ''}</p>
<div class="row wrap"><button class="b2" onclick="CLOUD.sync()">Nu synchroniseren</button><button class="b2" onclick="if(confirm('Uitloggen op dit toestel? Je gegevens blijven op dit toestel staan.'))CLOUD.logout()">Uitloggen</button></div></div>`;
};
async function cloudLogin(btn) {
  const e = $('#ce').value, p = $('#cp').value; if (!e || !p) return;
  btn.disabled = true; btn.textContent = 'Inloggen…';
  try { await CLOUD.login(e, p); R(); } catch (x) { alert('Inloggen mislukt: ' + x.message); btn.disabled = false; btn.textContent = 'Inloggen'; }
}
/* ---------- werkbon-PDF meesturen naar VET Office (samen met de attesten factureren) ---------- */
async function werkbonPdfNaarCloud(id) {
  const o = S.orders.find((x) => x.id === id); if (!o || !CLOUD.session()) return;
  const file = await new Promise((res) => { window._vang = res; setTimeout(() => { if (window._vang === res) { window._vang = null; res(null); } }, 30000); pdf(o.id); });
  if (!file) return;
  o.pdf = await new Promise((r) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(file); });
  await save(); CLOUD.sync();
}
if (typeof fin === 'function') { const _fin = fin; window.fin = function () { _fin.apply(this, arguments); const o = O(); if (o && o.status === 'afgewerkt') setTimeout(() => werkbonPdfNaarCloud(o.id), 400); }; }
Object.assign(window, { CLOUD, CLOUDST, CLOUDCARD });
