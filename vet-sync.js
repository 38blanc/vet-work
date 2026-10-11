/* VET Sync – gedeelde cloud-synchronisatie voor VET Heat en VET Work (Supabase, zonder externe bibliotheek).
 * Werkt offline-first: de app bewaart alles lokaal; deze module stuurt wijzigingen door zodra er internet is
 * en haalt wijzigingen van andere toestellen op.
 * Foto's/handtekeningen (data:image/...) gaan naar de privé-opslag 'vet-files'; in de database staat enkel een verwijzing.
 */
(function (root) {
  const URL_ = 'https://pfxxzzdyzitcuhfrxaiq.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBmeHh6emR5eml0Y3VoZnJ4YWlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE3MTY3NjYsImV4cCI6MjEwNzI5Mjc2Nn0.yQFcLi4G3z4A60LgJdtUvAqYtGtC_IqMU6hxOaZws8I';
  const BUCKET = 'vet-files';
  const BASE = () => root.VETSYNC_URL || URL_; // VETSYNC_URL enkel voor testen
  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} }
  };

  // ---- kleine hash (FNV-1a, 2x32 bit) voor wijzigingsdetectie en bestandsnamen ----
  function hash(s) {
    let h1 = 0x811c9dc5, h2 = 0x01000193 ^ s.length;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 16777619); h2 = Math.imul(h2 ^ c, 2246822519);
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0') + s.length.toString(36);
  }
  // stabiele JSON (gesorteerde sleutels): de database herschikt sleutels, zo blijft de vergelijking juist
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  const isImg = (v) => typeof v === 'string' && /^data:(image\/|application\/(pdf|xml))/.test(v) && v.length > 200;
  const isRef = (v) => typeof v === 'string' && v.startsWith('vf:');

  function create(opt) {
    // opt: { app:'heat'|'work', pullApps:['heat','shared',...], collect():[{app,kind,id,data}], apply(rows), onStatus(st) }
    const SK = 'vetsync_session', MK = 'vetsync_meta_' + opt.app;
    let meta = ls.get(MK) || { since: '1970-01-01T00:00:00Z', h: {}, f: {}, del: [] };
    let busy = false, again = false, timer = null, last = null, err = '';
    const status = (s) => { err = s.error || ''; try { opt.onStatus && opt.onStatus(Object.assign({ user: session() && session().user, last, busy }, s)); } catch (e) {} };
    const saveMeta = () => ls.set(MK, meta);
    const session = () => ls.get(SK);
    // eigenaar van de gegevens: jezelf, of (boekhouder) de klant wiens administratie je bekijkt
    const owner = () => (opt.owner && opt.owner()) || (session() && session().user.id);

    async function authReq(body, grant) {
      const r = await fetch(BASE() + '/auth/v1/token?grant_type=' + grant, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error_description || j.msg || j.message || ('Inloggen mislukt (' + r.status + ')'));
      const s = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000, user: { id: j.user && j.user.id, email: j.user && j.user.email } };
      ls.set(SK, s); return s;
    }
    async function token() {
      let s = session(); if (!s) throw new Error('Niet ingelogd');
      if (Date.now() > s.expires_at - 60000) {
        try { s = await authReq({ refresh_token: s.refresh_token }, 'refresh_token'); }
        catch (e) { if (navigator.onLine) { ls.del(SK); } throw new Error('Sessie verlopen – log opnieuw in'); }
      }
      return s;
    }
    async function api(path, o = {}) {
      const s = await token();
      const r = await fetch(BASE() + path, Object.assign({}, o, { headers: Object.assign({ apikey: KEY, Authorization: 'Bearer ' + s.access_token }, o.headers || {}) }));
      if (!r.ok) { const t = await r.text().catch(() => ''); throw new Error('Server ' + r.status + ': ' + t.slice(0, 160)); }
      return r;
    }

    // ---- foto's: dataURL <-> verwijzing ----
    async function toRemote(v, uid) {
      if (Array.isArray(v)) { const o = []; for (const x of v) o.push(await toRemote(x, uid)); return o; }
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = await toRemote(v[k], uid); return o; }
      if (isImg(v)) {
        const hh = hash(v);
        if (!meta.f[hh]) {
          const m = v.match(/^data:([a-z]+\/[a-z0-9.+-]+);base64,(.*)$/); if (!m) return v;
          const ext = m[1].split('/')[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg');
          const path = uid + '/' + hh + '.' + ext;
          const bin = atob(m[2]); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          await api('/storage/v1/object/' + BUCKET + '/' + path, { method: 'POST', headers: { 'Content-Type': m[1], 'x-upsert': 'true' }, body: bytes });
          meta.f[hh] = path; saveMeta();
        }
        return 'vf:' + meta.f[hh];
      }
      return v;
    }
    const fileCache = {};
    async function fileData(path) {
      if (!fileCache[path]) {
        const r = await api('/storage/v1/object/authenticated/' + BUCKET + '/' + path);
        const b = await r.blob();
        fileCache[path] = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
        meta.f[hash(fileCache[path])] = path;
      }
      return fileCache[path];
    }
    async function toLocal(v) {
      if (Array.isArray(v)) { const o = []; for (const x of v) o.push(await toLocal(x)); return o; }
      if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = await toLocal(v[k]); return o; }
      if (isRef(v)) return fileData(v.slice(3));
      return v;
    }

    const key = (r) => r.app + '/' + r.kind + '/' + r.id;

    async function pull() {
      // eerste vraag met 2 minuten overlap (vangt gelijktijdige wijzigingen op); dubbels worden via de hash overgeslagen
      let since = new Date(Math.max(0, new Date(meta.since).getTime() - 120000)).toISOString();
      for (;;) {
        const q = '/rest/v1/docs?select=app,kind,id,data,deleted,updated_at&user_id=eq.' + owner() + '&app=in.(' + opt.pullApps.join(',') + ')&updated_at=gt.' + encodeURIComponent(since) + '&order=updated_at.asc&limit=200';
        const rows = await (await api(q)).json();
        if (!rows.length) break;
        const changed = [];
        for (const r of rows) {
          const k = key(r), hh = r.deleted ? 'deleted' : hash(stable(r.data));
          if (meta.h[k] !== hh) {
            const keep = r.deleted || (opt.noFiles && opt.noFiles(r));
            changed.push({ app: r.app, kind: r.kind, id: r.id, deleted: r.deleted, data: r.deleted ? null : keep ? r.data : await toLocal(r.data) });
            if (r.deleted) delete meta.h[k]; else meta.h[k] = hh;
          }
          if (r.updated_at > meta.since) meta.since = r.updated_at; since = r.updated_at;
        }
        if (changed.length) await opt.apply(changed);
        saveMeta();
        if (rows.length < 200) break;
      }
    }
    async function push() {
      const s = await token(), uid = s.user.id;
      const out = [];
      for (const r of opt.collect()) {
        const remote = await toRemote(r.data, uid);
        const hh = hash(stable(remote)), k = key(r);
        if (meta.h[k] !== hh) out.push({ row: { user_id: uid, app: r.app, kind: r.kind, id: String(r.id), data: remote, deleted: false }, k, hh });
      }
      for (const d of meta.del) out.push({ row: { user_id: uid, app: d.app, kind: d.kind, id: String(d.id), data: {}, deleted: true }, k: key(d), hh: 'deleted', del: true });
      for (let i = 0; i < out.length; i += 50) {
        const part = out.slice(i, i + 50);
        await api('/rest/v1/docs?on_conflict=user_id,app,kind,id', { method: 'POST', headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(part.map((p) => p.row)) });
        part.forEach((p) => { if (p.del) delete meta.h[p.k]; else meta.h[p.k] = p.hh; });
        meta.del = meta.del.filter((d) => !part.some((p) => p.del && p.k === key(d)));
        saveMeta();
        try { opt.onPushed && opt.onPushed(part.map((p) => p.row)); } catch (e) {}
      }
      return out.length;
    }

    async function sync() {
      if (!session()) return;
      if (!navigator.onLine) { status({ state: 'offline' }); return; }
      if (busy) { again = true; return; }
      busy = true; status({ state: 'bezig' });
      try {
        await pull();
        const n = opt.readOnly && opt.readOnly() ? 0 : await push();
        if (n) await pull();
        last = Date.now(); busy = false; status({ state: 'ok' });
      } catch (e) {
        busy = false; status({ state: 'fout', error: e.message });
      }
      if (again) { again = false; setTimeout(sync, 500); }
    }
    const soon = (ms = 2500) => { clearTimeout(timer); timer = setTimeout(sync, ms); };

    async function login(email, pw) {
      await authReq({ email: email.trim(), password: pw }, 'password');
      meta = { since: '1970-01-01T00:00:00Z', h: {}, f: {}, del: meta.del || [] }; saveMeta();
      await sync();
    }
    function logout() { ls.del(SK); status({ state: 'uit' }); }
    function markDeleted(app, kind, id) { if (!session()) return; meta.del.push({ app, kind, id: String(id) }); saveMeta(); soon(); }

    // automatisch: bij opstart, online komen, terug openen en elke minuut
    addEventListener('online', () => soon(500));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') soon(500); });
    setInterval(() => { if (document.visibilityState === 'visible') sync(); }, 60000);
    setTimeout(sync, 800);

    // Supabase edge function aanroepen (Peppol, bank, …)
    async function call(name, body) {
      const r = await api('/functions/v1/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }).catch((e) => { throw e; });
      return r.json();
    }
    async function rpc(name, body) { const r = await api('/rest/v1/rpc/' + name, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); const t = await r.text(); return t ? JSON.parse(t) : null; }
    async function rest(path) { return (await api('/rest/v1/' + path)).json(); }
    const file = (ref) => isRef(ref) ? fileData(ref.slice(3)) : Promise.resolve(ref);
    function reset() { meta = { since: '1970-01-01T00:00:00Z', h: {}, f: {}, del: [] }; saveMeta(); }
    return { login, logout, sync, soon, markDeleted, session, call, rpc, rest, file, reset, owner, get error() { return err; }, get last() { return last; }, get busy() { return busy; } };
  }

  root.VETSync = { create, hash, URL: URL_ };
})(window);
