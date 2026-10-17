/* VET Work – afspraken: datum + uur op de werkbon, in de agenda van je iPhone/Mac zetten en de klant een bevestiging sturen */
const AFS_DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const afsNum = (t) => { let n = String(t || '').replace(/[^\d+]/g, ''); if (n.startsWith('+')) n = n.slice(1); else if (n.startsWith('00')) n = n.slice(2); else if (n.startsWith('0')) n = '32' + n.slice(1); return n; };
const afsDatum = (d) => { if (!d) return ''; const x = new Date(d + 'T12:00:00'); return AFS_DAGEN[x.getDay()] + ' ' + x.getDate() + ' ' + x.toLocaleDateString('nl-BE', { month: 'long' }); };
function afsZet(k, val) { const o = O(); o.afspr = o.afspr || {}; o.afspr[k] = val; if (k === 'van' && val && !o.afspr.tot) { const [h, m] = val.split(':').map(Number); o.afspr.tot = String(Math.min(23, h + 2)).padStart(2, '0') + ':' + String(m || 0).padStart(2, '0'); } save(); R(); }
function afsTekst(o) {
  const a = o.afspr || {}; const naam = String(o.klant || '').trim().split(' ')[0];
  return `Dag ${naam},\n\nHierbij bevestig ik onze afspraak op ${afsDatum(a.d)}${a.van ? ' tussen ' + a.van + (a.tot ? ' en ' + a.tot : '') : ''}${o.adres ? ' op ' + o.adres : ''}.${o.omschr ? '\nBetreft: ' + o.omschr : ''}\n\nLukt het toch niet? Laat het gerust even weten.\n\nGroetjes,\nJordy\nVan Eyen Technics`;
}
function afsIcs() {
  const o = O(); const a = o.afspr || {}; if (!a.d) return alert('Kies eerst een datum.');
  const f = (d, t) => d.replace(/-/g, '') + 'T' + (t || '08:00').replace(':', '') + '00';
  const vouw = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Van Eyen Technics//VET Work//NL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    'UID:' + o.id + '@vet-work', 'DTSTAMP:' + new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z',
    'DTSTART;TZID=Europe/Brussels:' + f(a.d, a.van), 'DTEND;TZID=Europe/Brussels:' + f(a.d, a.tot || a.van),
    'SUMMARY:' + vouw((o.omschr ? o.omschr.split('\n')[0] : 'Interventie') + ' – ' + (o.klant || '')), 'LOCATION:' + vouw(o.adres),
    'DESCRIPTION:' + vouw([o.nr, o.klant, o.tel, o.mail, o.omschr].filter(Boolean).join('\n')), 'BEGIN:VALARM', 'TRIGGER:-PT60M', 'ACTION:DISPLAY', 'DESCRIPTION:Afspraak', 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const l = document.createElement('a'); l.href = url; l.download = (o.nr || 'afspraak') + '.ics'; document.body.appendChild(l); l.click(); l.remove();
  o.afspr.agenda = new Date().toISOString(); save(); R();
}
function afsBevestig(via) {
  const o = O(); if (!(o.afspr || {}).d) return alert('Kies eerst een datum.'); const t = afsTekst(o);
  if (via === 'wa') { if (!o.tel) return alert('Geen telefoonnummer.'); open('https://wa.me/' + afsNum(o.tel) + '?text=' + encodeURIComponent(t), '_blank'); }
  else if (via === 'sms') { if (!o.tel) return alert('Geen telefoonnummer.'); location.href = 'sms:+' + afsNum(o.tel) + (/iPhone|iPad|Mac/i.test(navigator.userAgent) ? '&' : '?') + 'body=' + encodeURIComponent(t); }
  else { if (!o.mail) return alert('Geen e-mailadres.'); location.href = 'mailto:' + encodeURIComponent(o.mail) + '?subject=' + encodeURIComponent('Bevestiging afspraak – Van Eyen Technics') + '&body=' + encodeURIComponent(t); }
  o.afspr.bevestigd = new Date().toISOString(); save(); setTimeout(R, 300);
}
function afsprKaart(o) {
  const a = o.afspr || {};
  return `<div class="c"><h2>Afspraak</h2>
  <div class="row wrap"><input type="date" style="flex:2;min-width:150px" value="${esc(a.d || '')}" onchange="afsZet('d',this.value)"><input type="time" style="flex:1;min-width:100px" value="${esc(a.van || '')}" onchange="afsZet('van',this.value)"><input type="time" style="flex:1;min-width:100px" value="${esc(a.tot || '')}" onchange="afsZet('tot',this.value)"></div>
  ${a.d ? `<div class="mu" style="margin:6px 0 10px">${afsDatum(a.d)}${a.van ? ' · ' + a.van + (a.tot ? '–' + a.tot : '') : ''}${a.agenda ? ' · ✓ in agenda' : ''}${a.bevestigd ? ' · ✓ bevestigd' : ''}</div>
  <div class="row wrap"><button class="b2" onclick="afsIcs()">📅 In mijn agenda</button><button class="b2" onclick="afsBevestig('wa')">💬 WhatsApp</button><button class="b2" onclick="afsBevestig('sms')">✉️ Sms</button><button class="b2" onclick="afsBevestig('mail')">📧 Mail</button></div>` : '<div class="mu" style="margin-top:6px">Kies datum en uur, zet de afspraak in je agenda en stuur de klant een bevestiging.</div>'}</div>`;
}
