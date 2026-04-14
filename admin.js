// admin.js
import { ADMIN_USERNAME, ADMIN_PASSWORD } from './config.js';
import { DB, hashId, awsDeleteFace, showMsg } from './db.js';

const COLORS = ['#2563eb','#16a34a','#dc2626','#9333ea','#d97706','#0891b2','#be185d'];

// ── Login ─────────────────────────────────────────────────────────────────────
function doLogin() {
  const user = document.getElementById('l-user').value.trim();
  const pass = document.getElementById('l-pass').value;
  const msg  = document.getElementById('l-msg');
  if (user === ADMIN_USERNAME && pass === ADMIN_PASSWORD) {
    sessionStorage.setItem('adminOk', '1');
    showAdminShell();
  } else {
    showMsg(msg, '❌ Incorrect username or password.', 'err');
  }
}

function showAdminShell() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('shell').style.display        = 'flex';
  renderDash();
  renderCands();
}

function doLogout() {
  sessionStorage.removeItem('adminOk');
  location.reload();
}

// Persist session across page refresh
if (sessionStorage.getItem('adminOk')) showAdminShell();

// Enter key on login
['l-user','l-pass'].forEach(id =>
  document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); })
);

// Tab navigation
document.querySelectorAll('.nb').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nb').forEach(b  => b.classList.remove('active'));
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
    const t = btn.dataset.tab;
    if (t === 'dashboard')  renderDash();
    if (t === 'candidates') renderCands();
    if (t === 'voters')     renderVoters();
    if (t === 'results')    renderResults();
    if (t === 'ds')         renderDS();
  });
});

// Expose to HTML onclick
window.doLogin   = doLogin;
window.doLogout  = doLogout;

// ── Election ──────────────────────────────────────────────────────────────────
window.toggleElection = function() {
  const db    = DB.get();
  const title = document.getElementById('e-title').value.trim() || db.election.title;
  if (!db.election.is_active && !Object.keys(db.candidates).length) {
    setMsg('ctrl-msg', 'Add at least one candidate first.', 'err'); return;
  }
  db.election.is_active = !db.election.is_active;
  db.election.title     = title;
  DB.save(db);
  const on  = db.election.is_active;
  const btn = document.getElementById('btn-toggle');
  btn.textContent = on ? '⏹ End Election' : '▶ Start Election';
  btn.className   = on ? 'btn btn-red' : 'btn btn-green';
  syncPill(on);
  setMsg('ctrl-msg', on ? 'Election is ACTIVE! Share voter.html with all members.' : 'Election ended.', on ? 'ok' : 'info');
  renderDash();
};

window.resetAll = async function() {
  if (!confirm('Reset ALL data? This deletes voters, candidates, queue and clears AWS faces.')) return;
  const db = DB.get();
  // Delete all AWS faces
  for (const v of Object.values(db.voters)) {
    if (v.aws_face_id) await awsDeleteFace(v.aws_face_id);
  }
  DB.clear();
  location.reload();
};

// ── Candidates ────────────────────────────────────────────────────────────────
window.addCand = function() {
  const name  = document.getElementById('c-name').value.trim();
  const party = document.getElementById('c-party').value.trim() || 'Independent';
  if (!name) { setMsg('c-msg', 'Name is required.', 'err'); return; }
  const db = DB.get();
  if (Object.values(db.candidates).find(c => c.name.toLowerCase() === name.toLowerCase())) {
    setMsg('c-msg', 'Candidate already exists.', 'err'); return;
  }
  const id = Date.now().toString();
  db.candidates[id] = { id, name, party, votes: 0 };
  DB.save(db);
  document.getElementById('c-name').value  = '';
  document.getElementById('c-party').value = '';
  setMsg('c-msg', `"${name}" added!`, 'ok');
  renderCands(); renderDash();
};

window.removeCand = function(id) {
  const db = DB.get();
  if (db.election.is_active) { alert('Cannot remove candidates during an active election.'); return; }
  if (!confirm('Remove this candidate?')) return;
  delete db.candidates[id];
  DB.save(db); renderCands(); renderDash();
};

function renderCands() {
  const db    = DB.get();
  const cands = Object.values(db.candidates);
  const tb    = document.getElementById('c-body');
  if (!cands.length) { tb.innerHTML = '<tr><td colspan="5" class="empty">No candidates yet.</td></tr>'; return; }
  tb.innerHTML = cands.map((c,i) => `
    <tr>
      <td style="color:#94a3b8">${i+1}</td>
      <td style="font-weight:500">${c.name}</td>
      <td style="color:#64748b">${c.party}</td>
      <td><span style="background:#eff6ff;color:#2563eb;padding:2px 10px;border-radius:999px;font-size:12px;font-weight:600">${c.votes}</span></td>
      <td><button class="btn btn-outline btn-sm" onclick="removeCand('${c.id}')">Remove</button></td>
    </tr>`).join('');
}

// ── Voters ────────────────────────────────────────────────────────────────────
function renderVoters() {
  const db  = DB.get();
  const q   = (document.getElementById('v-search')?.value || '').toLowerCase();
  let list  = Object.values(db.voters);
  if (q) list = list.filter(v => v.name?.toLowerCase().includes(q) || v.voter_id?.toLowerCase().includes(q) || v.email?.includes(q));
  document.getElementById('v-count').textContent = list.length + ' / 30';
  const tb = document.getElementById('v-body');
  if (!list.length) { tb.innerHTML = '<tr><td colspan="6" class="empty">No voters registered yet.</td></tr>'; return; }
  tb.innerHTML = list.map(v => `
    <tr>
      <td><code style="font-family:'DM Mono',monospace;font-size:12px;background:#f1f5f9;padding:2px 7px;border-radius:4px">${v.voter_id}</code></td>
      <td style="font-weight:500">${v.name}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px">${v.email || '—'}</td>
      <td>${v.face_thumb ? `<img src="${v.face_thumb}" class="face-thumb"/>` : '<div class="no-face">👤</div>'}</td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;color:#64748b">B${v.bucket}</td>
      <td><span class="badge ${v.has_voted ? 'badge-yes' : 'badge-no'}">${v.has_voted ? '✓ Voted' : 'Pending'}</span></td>
    </tr>`).join('');
}

// ── Results ───────────────────────────────────────────────────────────────────
function renderBars(elId, cands, total) {
  const el = document.getElementById(elId);
  if (!cands.length) { el.innerHTML = '<p class="muted">No candidates yet.</p>'; return; }
  const sorted = [...cands].sort((a,b) => b.votes - a.votes);
  const maxV   = Math.max(...sorted.map(c => c.votes), 1);
  el.innerHTML = sorted.map(c => {
    const w   = Math.round(c.votes / maxV * 100);
    const pct = total ? Math.round(c.votes / total * 100) : 0;
    const col = COLORS[cands.indexOf(c) % COLORS.length];
    return `<div class="bar-row">
      <div class="bn">${c.name}</div>
      <div class="bt"><div class="bf" style="width:${w}%;background:${col}">${c.votes > 0 ? '<span>' + c.votes + '</span>' : ''}</div></div>
      <div class="bp">${pct}%</div>
    </div>`;
  }).join('');
}

function renderResults() {
  const db    = DB.get();
  const cands = Object.values(db.candidates);
  const vc    = Object.keys(db.voters).length;
  const tv    = cands.reduce((s,c) => s + c.votes, 0);
  document.getElementById('r-total').textContent = tv;
  document.getElementById('r-turn').textContent  = vc ? Math.round(tv/vc*100)+'%' : '0%';
  const sorted = [...cands].sort((a,b) => b.votes - a.votes);
  document.getElementById('r-lead').textContent  = sorted.length && sorted[0].votes > 0 ? sorted[0].name : '—';
  renderBars('r-bars', cands, tv);
}

window.searchCand = function() {
  const db    = DB.get();
  const q     = document.getElementById('r-search').value.trim().toLowerCase();
  const el    = document.getElementById('r-out');
  if (!q) { el.innerHTML = ''; return; }
  const cands = Object.values(db.candidates).filter(c => c.name.toLowerCase().includes(q));
  const total = Object.values(db.candidates).reduce((s,c) => s+c.votes, 0);
  if (!cands.length) { el.innerHTML = '<span class="muted">No candidate found.</span>'; return; }
  el.innerHTML = cands.map(c => {
    const pct = total ? Math.round(c.votes/total*100) : 0;
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:9px;margin-bottom:8px">
      <div><div style="font-weight:500">${c.name}</div><div style="font-size:12px;color:#94a3b8">${c.party}</div></div>
      <div style="text-align:right"><div style="font-size:18px;font-weight:700;color:#2563eb">${c.votes}</div><div style="font-size:12px;color:#94a3b8">${pct}%</div></div>
    </div>`;
  }).join('');
};

// ── Dashboard ─────────────────────────────────────────────────────────────────
function renderDash() {
  const db    = DB.get();
  const cands = Object.values(db.candidates);
  const vc    = Object.keys(db.voters).length;
  const tv    = cands.reduce((s,c) => s+c.votes, 0);
  document.getElementById('d-voters').textContent  = vc;
  document.getElementById('d-cands').textContent   = cands.length;
  document.getElementById('d-votes').textContent   = tv;
  document.getElementById('d-turnout').textContent = vc ? Math.round(tv/vc*100)+'%' : '0%';
  document.getElementById('e-title').value         = db.election.title || '';
  const btn = document.getElementById('btn-toggle');
  btn.textContent = db.election.is_active ? '⏹ End Election' : '▶ Start Election';
  btn.className   = db.election.is_active ? 'btn btn-red' : 'btn btn-green';
  syncPill(db.election.is_active);
  renderBars('dash-bars', cands, tv);
}

// ── DS view ───────────────────────────────────────────────────────────────────
function renderDS() {
  const db      = DB.get();
  const voters  = Object.values(db.voters);
  const buckets = Array.from({length:16}, () => []);
  voters.forEach(v => buckets[v.bucket || 0].push(v.voter_id));
  document.getElementById('ds-hash').innerHTML = buckets.map((b,i) => `
    <div class="hb"><div class="hb-lbl">B${i}</div>
    <div class="hb-box ${b.length?'filled':''}">${b.length ? b.map(id=>'<div>'+id+'</div>').join('') : '—'}</div></div>`).join('');
  const queue = db.queue || [];
  const qEl   = document.getElementById('ds-queue');
  if (!queue.length) { qEl.innerHTML = '<span class="muted">Queue is empty.</span>'; return; }
  qEl.innerHTML = queue.map((v,i) => `
    ${i>0?'<span class="q-arrow">→</span>':''}
    <div><div class="qb">${v.name}</div><div class="qb-lbl">${i===0?'FRONT':i===queue.length-1?'REAR':''}</div></div>`).join('');
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function syncPill(active) {
  document.getElementById('s-dot').className   = 'dot'+(active?' on':'');
  document.getElementById('s-txt').textContent = active ? 'Active' : 'Inactive';
}
function setMsg(id, text, type) {
  const el = document.getElementById(id);
  if (el) { el.textContent = text; el.className = 'msg msg-'+type; }
}
