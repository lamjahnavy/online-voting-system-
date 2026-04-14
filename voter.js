// voter.js — Phone OTP → Face Scan 1 → Face Scan 2 → Vote

const MAX = 30;
const AV_BG  = ['#dbeafe','#dcfce7','#fee2e2','#f3e8ff','#fef9c3','#cffafe'];
const AV_TXT = ['#1d4ed8','#15803d','#b91c1c','#7e22ce','#854d0e','#0e7490'];

// State
let regState = {
  name: '', age: 0, phone: '',
  scan1Frame: null,   // full 320x240 dataUrl — used for comparison
  scan1Thumb: null,   // 90x90 circle — used for display only
  voterId:    null
};
let currentVid  = null;
let selectedIdx = null;

// ── Navigation ────────────────────────────────────────────────────────────────
function goTo(id) {
  document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}
window.goTo = goTo;

function scItem(id, status, text) {
  const el = document.getElementById(id);
  if (!el) return;
  const icons = { pending: '⏳', active: '🔄', done: '✅', error: '❌' };
  el.className = 'sc-item sc-' + status;
  if (text) el.textContent = icons[status] + ' ' + text;
}

// ══════════════════════════════════════════════════════════════════════════════
//  STEP 1 — PHONE OTP
// ══════════════════════════════════════════════════════════════════════════════
let otpPhone = '';
let otpTimer = null;

window.doSendOTP = function() {
  const name  = document.getElementById('r-name').value.trim();
  const age   = parseInt(document.getElementById('r-age').value, 10);
  const code  = document.getElementById('r-code').value;
  const phone = document.getElementById('r-phone').value.trim().replace(/\D/g, '');
  const msg   = document.getElementById('phone-msg');

  if (!name)                  { showMsg(msg, 'Please enter your full name.', 'err'); return; }
  if (isNaN(age) || age < 18) { showMsg(msg, 'Must be 18 or older to register.', 'err'); return; }
  if (phone.length < 7)       { showMsg(msg, 'Enter a valid mobile number.', 'err'); return; }

  const db   = DB.get();
  const full = code + phone;

  if (Object.keys(db.voters).length >= MAX) {
    showMsg(msg, '⚠️ Maximum 30 voters reached. Registration is closed.', 'err'); return;
  }
  if (Object.values(db.voters).find(v => v.phone === full)) {
    showMsg(msg, '❌ This phone number is already registered.', 'err'); return;
  }

  otpPhone = full;
  sendOTP(full);
  showMsg(msg, `✅ OTP sent! Check the blue popup box on screen — enter the 6-digit code below.`, 'ok');
  document.getElementById('otp-section').style.display = 'block';
  document.getElementById('send-otp-btn').disabled     = true;

  let secs = 300;
  clearInterval(otpTimer);
  const timerEl = document.getElementById('otp-timer');
  otpTimer = setInterval(() => {
    secs--;
    if (secs <= 0) {
      clearInterval(otpTimer);
      timerEl.textContent = '(expired — resend)';
      document.getElementById('send-otp-btn').disabled = false;
    } else {
      const m = String(Math.floor(secs / 60)).padStart(2, '0');
      const s = String(secs % 60).padStart(2, '0');
      timerEl.textContent = `(expires in ${m}:${s})`;
    }
  }, 1000);
};

window.doVerifyOTP = function() {
  const otp    = document.getElementById('r-otp').value.trim();
  const msg    = document.getElementById('phone-msg');
  const result = verifyOTP(otpPhone, otp);
  if (!result.ok) { showMsg(msg, '❌ ' + result.msg, 'err'); return; }
  clearInterval(otpTimer);
  const popup = document.getElementById('otp-popup');
  if (popup) popup.remove();

  regState.name  = document.getElementById('r-name').value.trim();
  regState.age   = parseInt(document.getElementById('r-age').value, 10);
  regState.phone = otpPhone;

  showMsg(msg, '✅ Phone verified! Proceeding to Face Scan #1…', 'ok');
  setTimeout(() => { goTo('s-face1'); initFace1(); }, 700);
};

// ══════════════════════════════════════════════════════════════════════════════
//  STEP 2 — FACE SCAN #1
//  Captures full frame → checks for duplicate → stores frame for scan2 compare
// ══════════════════════════════════════════════════════════════════════════════
function vid1El() { return document.getElementById('vid1'); }

async function initFace1() {
  scItem('sc1-dup',    'pending', 'Checking for duplicate face…');
  scItem('sc1-detect', 'pending', 'Capturing face…');
  document.getElementById('face1-msg').textContent = '';
  document.getElementById('btn-face1').disabled    = true;
  document.getElementById('lbl1').textContent      = 'Initialising camera…';
  const stream = await startCamera(vid1El(), document.getElementById('lbl1'),
    '📷 Camera ready — look at camera and click Capture');
  if (stream) setTimeout(() => { document.getElementById('btn-face1').disabled = false; }, 1500);
}

window.stopVid1 = function() { stopCamera(vid1El()); };

window.doFace1Scan = async function() {
  const btn = document.getElementById('btn-face1');
  const msg = document.getElementById('face1-msg');
  btn.disabled = true;
  document.getElementById('lbl1').textContent = 'Capturing…';

  // Capture FULL FRAME at fixed 320×240 — this is used for ALL comparisons
  const frame1 = captureFrame(vid1El());
  const thumb1 = makeThumbnail(vid1El()); // circle thumbnail just for display

  scItem('sc1-dup', 'active', 'Checking for duplicate face…');

  const dupVoter = await findDuplicateFace(frame1);
  if (dupVoter) {
    scItem('sc1-dup', 'error', 'Duplicate face found — BLOCKED');
    stopCamera(vid1El());
    showMsg(msg,
      `❌ <strong>Face Already Registered!</strong><br><br>` +
      `This face is already registered as <strong>${dupVoter.name}</strong>.<br><br>` +
      `One face = one registration.`,
      'err'
    );
    btn.disabled = false;
    return;
  }

  scItem('sc1-dup',    'done', 'No duplicate face — new voter ✅');
  scItem('sc1-detect', 'done', 'Face captured ✅');

  // Store FULL FRAME for comparison in scan 2, and thumbnail for display
  regState.scan1Frame = frame1;
  regState.scan1Thumb = thumb1;
  const db = DB.get();
  regState.voterId = 'V' + db.next_id;

  stopCamera(vid1El());

  showMsg(msg, '✅ Face Scan #1 complete! Proceeding to Scan #2 to confirm identity.', 'ok');
  document.getElementById('thumb1-preview').src = thumb1; // show circle thumb in UI

  setTimeout(() => { goTo('s-face2'); initFace2(); }, 900);
};

// ══════════════════════════════════════════════════════════════════════════════
//  STEP 3 — FACE SCAN #2
//  Captures FULL FRAME at 320×240 → compares with scan1 FULL FRAME
//  Both frames same size = fair comparison = same person ALWAYS matches
// ══════════════════════════════════════════════════════════════════════════════
function vid2El() { return document.getElementById('vid2'); }

async function initFace2() {
  scItem('sc2-compare', 'pending', 'Comparing Scan #1 vs Scan #2…');
  scItem('sc2-result',  'pending', 'Confirming match result…');
  document.getElementById('face2-msg').textContent = '';
  document.getElementById('btn-face2').disabled    = true;
  document.getElementById('lbl2').textContent      = 'Initialising camera…';
  const stream = await startCamera(vid2El(), document.getElementById('lbl2'),
    '📷 Camera ready — look at camera again and click Verify');
  if (stream) setTimeout(() => { document.getElementById('btn-face2').disabled = false; }, 1500);
}

window.stopVid2 = function() { stopCamera(vid2El()); };

window.doFace2Scan = async function() {
  const btn = document.getElementById('btn-face2');
  const msg = document.getElementById('face2-msg');
  btn.disabled = true;
  document.getElementById('lbl2').textContent = 'Comparing with Scan #1…';

  scItem('sc2-compare', 'active', 'Comparing Scan #1 vs Scan #2…');

  // Capture scan2 as full 320×240 frame — SAME SIZE as scan1
  const frame2 = captureFrame(vid2El());
  const thumb2 = makeThumbnail(vid2El());

  // Compare both full frames
  const result = await compareFaceDataUrls(regState.scan1Frame, frame2);

  if (!result.match) {
    scItem('sc2-compare', 'error', 'Face mismatch — scans do not match!');
    scItem('sc2-result',  'error', 'Registration blocked');
    showMsg(msg,
      `❌ <strong>Face Mismatch!</strong><br><br>` +
      `Scan #2 does not match Scan #1.<br>` +
      `• Make sure your face is well-lit and centered<br>` +
      `• Don't move too far from the camera<br><br>` +
      `<button onclick="window.retryFace2()" style="
        background:#2563eb;color:#fff;border:none;padding:8px 18px;
        border-radius:8px;cursor:pointer;font-size:14px;margin-top:4px
      ">🔄 Try Again</button>`,
      'err'
    );
    btn.disabled = false;
    return;
  }

  const score = Math.round(result.score * 100);
  scItem('sc2-compare', 'done', `Faces match — ${score}% similarity ✅`);
  scItem('sc2-result',  'active', 'Saving voter registration…');

  stopCamera(vid2El());

  // Save voter — store the full frame2 as face_data for future login comparison
  const db  = DB.get();
  const vid = regState.voterId;
  db.voters[vid] = {
    voter_id:      vid,
    name:          regState.name,
    age:           regState.age,
    phone:         regState.phone,
    bucket:        hashId(vid),
    face_thumb:    thumb2,      // display only
    face_data:     frame2,      // full 320×240 frame — used for login comparison
    has_voted:     false,
    registered_at: Date.now()
  };
  db.next_id++;
  DB.save(db);

  scItem('sc2-result', 'done', 'Voter registered successfully ✅');

  document.getElementById('new-vid').textContent  = vid;
  document.getElementById('new-info').textContent =
    `Phone: ${regState.phone} · Hash bucket: ${hashId(vid)} · Both face scans matched (${score}%) ✅`;
  const thumbEl = document.getElementById('reg-thumb');
  thumbEl.src = thumb2;
  thumbEl.style.display = 'block';

  // Reset
  regState = { name: '', age: 0, phone: '', scan1Frame: null, scan1Thumb: null, voterId: null };
  document.getElementById('r-name').value  = '';
  document.getElementById('r-age').value   = '';
  document.getElementById('r-phone').value = '';
  document.getElementById('r-otp').value   = '';
  document.getElementById('otp-section').style.display  = 'none';
  document.getElementById('send-otp-btn').disabled      = false;

  goTo('s-reg-ok');
};

// Retry face 2 without going all the way back
window.retryFace2 = async function() {
  showMsg(document.getElementById('face2-msg'), '', 'ok');
  scItem('sc2-compare', 'pending', 'Comparing Scan #1 vs Scan #2…');
  scItem('sc2-result',  'pending', 'Confirming match result…');
  document.getElementById('btn-face2').disabled = true;
  const stream = await startCamera(vid2El(), document.getElementById('lbl2'),
    '📷 Camera ready — look at camera and click Verify again');
  if (stream) setTimeout(() => { document.getElementById('btn-face2').disabled = false; }, 1500);
};

// ══════════════════════════════════════════════════════════════════════════════
//  LOGIN — FACE SCAN
// ══════════════════════════════════════════════════════════════════════════════
function loginVidEl() { return document.getElementById('login-vid'); }

window.startLoginFlow = function() {
  ['lsc1','lsc2','lsc3'].forEach(id => scItem(id, 'pending',
    id === 'lsc1' ? 'Searching for your face in voter database…' :
    id === 'lsc2' ? 'Verifying voter eligibility…' :
    'Joining voting queue…'
  ));
  document.getElementById('login-msg').textContent       = '';
  document.getElementById('login-btn').disabled          = true;
  document.getElementById('match-preview').style.display = 'none';
  document.getElementById('login-lbl').textContent       = 'Initialising camera…';
  goTo('s-login');
  startCamera(loginVidEl(), document.getElementById('login-lbl'),
    '📷 Camera ready — look at camera, then click Scan Face').then(stream => {
    if (stream) setTimeout(() => { document.getElementById('login-btn').disabled = false; }, 1500);
  });
};

window.stopLoginVid = function() { stopCamera(loginVidEl()); };

window.doLoginScan = async function() {
  const btn = document.getElementById('login-btn');
  const msg = document.getElementById('login-msg');
  btn.disabled = true;

  const db = DB.get();
  if (!db.election.is_active) {
    showMsg(msg, '❌ The election has not started yet. Please wait for the admin.', 'err');
    btn.disabled = false; return;
  }

  scItem('lsc1', 'active', 'Searching for your face in voter database…');
  document.getElementById('login-lbl').textContent = '🔍 Searching…';

  // Capture full frame for comparison
  const liveFrame = captureFrame(loginVidEl());
  const matchResult = await findVoterByFace(liveFrame);

  if (!matchResult) {
    scItem('lsc1', 'error', 'Face not found in voter database');
    stopCamera(loginVidEl());
    showMsg(msg,
      '❌ <strong>Face Not Recognized</strong><br><br>' +
      'Your face is not found in the system.<br>' +
      'Please go back and register first.',
      'err'
    );
    btn.disabled = false; return;
  }

  const { voter, score } = matchResult;
  const conf = Math.round(score * 100);
  scItem('lsc1', 'done', `Face found — matched to ${voter.voter_id} (${conf}% match) ✅`);

  document.getElementById('match-preview').style.display = 'flex';
  document.getElementById('match-thumb').src             = voter.face_thumb || '';
  document.getElementById('match-name').textContent      = voter.name;
  document.getElementById('match-conf').textContent      = `${conf}% face match`;

  scItem('lsc2', 'active', 'Verifying voter eligibility…');

  if (voter.has_voted) {
    scItem('lsc2', 'error', 'Already voted — permanently blocked');
    stopCamera(loginVidEl());
    showMsg(msg,
      `❌ <strong>${voter.name} has already voted.</strong><br><br>` +
      `One face = one vote. This face cannot vote again.`,
      'err'
    );
    btn.disabled = false; return;
  }

  if ((db.queue || []).find(q => q.voter_id === voter.voter_id)) {
    scItem('lsc2', 'error', 'Already in queue');
    stopCamera(loginVidEl());
    showMsg(msg, `❌ ${voter.name} is already in the voting queue.`, 'err');
    btn.disabled = false; return;
  }

  scItem('lsc2', 'done', `${voter.name} is eligible to vote ✅`);
  scItem('lsc3', 'active', 'Joining voting queue…');

  stopCamera(loginVidEl());
  currentVid = voter.voter_id;
  db.queue = db.queue || [];
  db.queue.push({ voter_id: currentVid, name: voter.name, joined_at: Date.now() });
  DB.save(db);

  scItem('lsc3', 'done', 'Added to queue ✅');

  document.getElementById('q-pos').textContent  = db.queue.length;
  document.getElementById('q-name').textContent = voter.name + ' ✅ Face verified (' + conf + '%)';
  document.getElementById('q-vid').textContent  = currentVid;
  document.getElementById('q-msg').textContent  = '';

  goTo('s-queue');
};

// ── Queue ─────────────────────────────────────────────────────────────────────
window.checkTurn = function() {
  const msg = document.getElementById('q-msg');
  const db  = DB.get();
  if (!db.election.is_active) { showMsg(msg, 'The election has ended.', 'err'); return; }
  if (!currentVid)             { showMsg(msg, 'Session lost. Please scan your face again.', 'err'); goTo('s-home'); return; }
  const voter = db.voters[currentVid];
  if (voter && voter.has_voted) { showMsg(msg, '❌ You have already voted!', 'err'); return; }
  const queue = db.queue || [];
  const pos   = queue.findIndex(q => q.voter_id === currentVid);
  if (pos === -1) { showMsg(msg, 'Not in queue. Please login again.', 'err'); return; }
  document.getElementById('q-pos').textContent = pos + 1;
  if (pos === 0) {
    db.queue.shift(); DB.save(db);
    msg.textContent = '';
    buildBallot(db);
  } else {
    showMsg(msg, `${pos} voter(s) ahead of you. Please wait and check again.`, 'info');
  }
};

function buildBallot(db) {
  const voter = db.voters[currentVid];
  document.getElementById('b-etitle').textContent = '🗳️ ' + (db.election.title || 'General Election');
  document.getElementById('b-vinfo').textContent  =
    `Voting as: ${voter.name} (${currentVid}) · Phone: ${voter.phone} · Face Verified ✅`;
  selectedIdx = null;
  document.getElementById('b-msg').textContent = '';
  const cands = Object.values(db.candidates);
  const el    = document.getElementById('b-opts');
  if (!cands.length) { el.innerHTML = '<p style="color:#94a3b8">No candidates available.</p>'; goTo('s-ballot'); return; }
  el.innerHTML = cands.map((c, i) => `
    <div class="b-opt" id="bo${i}" onclick="pickCand(${i})">
      <div class="c-av" style="background:${AV_BG[i%AV_BG.length]};color:${AV_TXT[i%AV_TXT.length]}">${c.name[0]}</div>
      <div><div class="c-nm">${c.name}</div><div class="c-pt">${c.party}</div></div>
      <div class="radio" id="rr${i}"></div>
    </div>`).join('');
  goTo('s-ballot');
}

window.pickCand = function(idx) {
  document.querySelectorAll('.b-opt').forEach(e => e.classList.remove('sel'));
  document.getElementById('bo' + idx).classList.add('sel');
  selectedIdx = idx;
};

window.submitVote = function() {
  const msg = document.getElementById('b-msg');
  if (selectedIdx === null) { showMsg(msg, 'Please select a candidate.', 'err'); return; }
  const db    = DB.get();
  const voter = db.voters[currentVid];
  if (!voter || voter.has_voted) { showMsg(msg, 'Already voted or session expired.', 'err'); return; }
  const cands = Object.values(db.candidates);
  const cand  = cands[selectedIdx];
  db.candidates[cand.id].votes++;
  db.voters[currentVid].has_voted = true;
  db.votes_log.push({ voter_id: currentVid, candidate_id: cand.id, at: Date.now() });
  DB.save(db);
  document.getElementById('done-msg').textContent  = `Thank you, ${voter.name}! Your vote has been securely recorded.`;
  document.getElementById('done-cand').textContent = `✅ You voted for: ${cand.name} (${cand.party})`;
  currentVid = null; selectedIdx = null;
  goTo('s-done');
};

window.addEventListener('load', () => {
  const db = DB.get();
  if (!db.election.is_active) {
    const p = document.getElementById('home-p');
    if (p) p.innerHTML = '⏳ <strong>Election not started yet.</strong> You can still register — voting opens once the admin starts the election.';
  }
});
