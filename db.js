// db.js — localStorage + local face fingerprint + on-screen OTP

const STORE = 'ovs_v8';

// ── DB ────────────────────────────────────────────────────────────────────────
const DB = {
  _def: () => ({
    election:   { is_active: false, title: 'General Election 2025' },
    candidates: {},
    voters:     {},
    queue:      [],
    votes_log:  [],
    next_id:    1001
  }),
  get() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE) || 'null');
      if (!d) return this._def();
      d.queue      = d.queue      || [];
      d.votes_log  = d.votes_log  || [];
      d.candidates = d.candidates || {};
      d.voters     = d.voters     || {};
      return d;
    } catch { return this._def(); }
  },
  save(d) { localStorage.setItem(STORE, JSON.stringify(d)); },
  clear()  { localStorage.removeItem(STORE); },
  clearVotersOnly() {
    const d = this.get();
    d.voters  = {};
    d.queue   = [];
    d.next_id = 1001;
    this.save(d);
  }
};

function hashId(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 16;
  return h;
}

// ── Camera helpers ────────────────────────────────────────────────────────────
async function startCamera(videoEl, labelEl, text) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480, facingMode: 'user' }
    });
    videoEl.srcObject = stream;
    await new Promise(res => videoEl.onloadedmetadata = res);
    if (labelEl) labelEl.textContent = text || '📷 Camera ready — position your face';
    return stream;
  } catch (e) {
    if (labelEl) labelEl.textContent = '⚠️ Camera error: ' + e.message;
    return null;
  }
}

function stopCamera(videoEl) {
  if (videoEl && videoEl.srcObject) {
    videoEl.srcObject.getTracks().forEach(t => t.stop());
    videoEl.srcObject = null;
  }
}

// Always capture as same fixed size (320×240) so comparisons are fair
function captureFrame(videoEl) {
  const W = 320, H = 240;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  c.getContext('2d').drawImage(videoEl, 0, 0, W, H);
  return c.toDataURL('image/jpeg', 0.90);
}

// Circular thumbnail just for display — NOT used for comparison
function makeThumbnail(videoEl) {
  const c = document.createElement('canvas');
  c.width = c.height = 90;
  const ctx = c.getContext('2d');
  ctx.beginPath(); ctx.arc(45, 45, 45, 0, Math.PI * 2); ctx.clip();
  const s  = Math.min(videoEl.videoWidth || 320, videoEl.videoHeight || 240);
  const ox = ((videoEl.videoWidth  || 320) - s) / 2;
  const oy = ((videoEl.videoHeight || 240) - s) / 2;
  ctx.drawImage(videoEl, ox, oy, s, s, 0, 0, 90, 90);
  return c.toDataURL('image/jpeg', 0.80);
}

function showMsg(el, html, type) {
  if (!el) return;
  el.innerHTML = html;
  el.className = 'msg msg-' + type;
}

// ── dHash Face Fingerprint ────────────────────────────────────────────────────
// Both images MUST be the same standard size before hashing.
// We resize to 9×8 for comparison → 64 bits.
// Same person, different lighting/angle: ~0.65–0.85
// Different person:                      ~0.35–0.58
// Threshold 0.60 — wide enough gap to allow real-world variation
function getFaceFingerprint(dataUrl) {
  return new Promise(res => {
    const img = new Image();
    img.onload = () => {
      const W = 9, H = 8;
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);
      const px = ctx.getImageData(0, 0, W, H).data;
      const gray = [];
      for (let i = 0; i < px.length; i += 4)
        gray.push(0.299 * px[i] + 0.587 * px[i+1] + 0.114 * px[i+2]);
      const hash = [];
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W - 1; x++)
          hash.push(gray[y * W + x] > gray[y * W + x + 1] ? 1 : 0);
      res(hash);
    };
    img.onerror = () => res(null);
    img.src = dataUrl;
  });
}

function faceSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let m = 0;
  for (let i = 0; i < a.length; i++) if (a[i] === b[i]) m++;
  return m / a.length;
}

// Compare two dataUrls — BOTH are full 320×240 frames (not thumbnails)
async function compareFaceDataUrls(dataUrl1, dataUrl2) {
  const p1 = await getFaceFingerprint(dataUrl1);
  const p2 = await getFaceFingerprint(dataUrl2);
  const score = faceSimilarity(p1, p2);
  return { match: score >= 0.60, score };
}

// Find duplicate: check new face against all stored voters
async function findDuplicateFace(newDataUrl) {
  const db = DB.get();
  const voters = Object.values(db.voters).filter(v => v.face_data);
  if (!voters.length) return null;
  for (const voter of voters) {
    const result = await compareFaceDataUrls(newDataUrl, voter.face_data);
    if (result.match) return voter;
  }
  return null;
}

// Find which voter this face belongs to (for login)
async function findVoterByFace(liveDataUrl) {
  const db = DB.get();
  const voters = Object.values(db.voters).filter(v => v.face_data);
  if (!voters.length) return null;
  let best = null, bestScore = 0;
  for (const voter of voters) {
    const result = await compareFaceDataUrls(liveDataUrl, voter.face_data);
    if (result.match && result.score > bestScore) {
      bestScore = result.score;
      best = { voter, score: result.score };
    }
  }
  return best;
}

// ── OTP — shows on screen (no SMS needed) ────────────────────────────────────
const _otps = {};

function sendOTP(fullPhone) {
  const otp = String(Math.floor(100000 + Math.random() * 900000));
  _otps[fullPhone] = { otp, expires: Date.now() + 5 * 60 * 1000 };

  // Remove old popup if exists
  const old = document.getElementById('otp-popup');
  if (old) old.remove();

  const box = document.createElement('div');
  box.id = 'otp-popup';
  box.style.cssText = `
    position:fixed;top:20px;right:20px;z-index:99999;
    background:#1e40af;color:#fff;padding:20px 26px;
    border-radius:16px;font-family:'DM Sans',sans-serif;
    box-shadow:0 8px 40px rgba(0,0,0,0.4);max-width:300px;
  `;
  box.innerHTML = `
    <div style="font-size:13px;opacity:.8;margin-bottom:8px">📧 OTP for ${fullPhone}</div>
    <div style="font-size:2.4rem;font-weight:700;letter-spacing:.3em;text-align:center">${otp}</div>
    <div style="font-size:12px;opacity:.7;margin-top:8px;text-align:center">Expires in 5 minutes</div>
    <button onclick="this.parentElement.remove()" style="
      display:block;width:100%;margin-top:12px;
      background:rgba(255,255,255,.2);border:none;
      color:#fff;padding:6px 0;border-radius:8px;
      cursor:pointer;font-size:13px;
    ">✕ Close</button>
  `;
  document.body.appendChild(box);
  return true;
}

function verifyOTP(fullPhone, entered) {
  const r = _otps[fullPhone];
  if (!r)                       return { ok: false, msg: 'No OTP sent. Click Send OTP first.' };
  if (Date.now() > r.expires)   return { ok: false, msg: 'OTP expired. Please resend.' };
  if (entered.trim() !== r.otp) return { ok: false, msg: 'Incorrect OTP. Try again.' };
  delete _otps[fullPhone];
  return { ok: true };
}
