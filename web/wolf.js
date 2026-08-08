// ===== Word Wolf Online Client =====

const API = '/api/wolf';
const POLL_MS = 1200;
const POLL_SLOW_MS = 2000;
const POLL_IDLE_MS = 2500;
const GONE_AFTER = 8;
const LS_KEY = 'wolf_session';

// ===== State =====
let myPlayerId = null;
let roomCode = null;
let pollTimer = null;
let polling = false;
let failedPolls = 0;
let missedPolls = 0;
let lastPhase = null;
let lobbyCount = 0;

// Timer
let clockOffset = 0;
let timerDeadline = null;
let timerTotalMs = 0;
let timerTicker = null;
let lastTickSec = null;

// Card flip state
let cardFlipped = false;

// ===== Helpers =====
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
function normCode(input) {
  const c = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (c.length >= 4 && c.length <= 8) ? c : null;
}
function esc(str) {
  return String(str).replace(/[&<>"']/g, c => (
    { '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]
  ));
}
function showScreen(id) {
  const el = $(`#screen-${id}`);
  if (!el || el.classList.contains('active')) return;
  $$('.screen').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  window.scrollTo(0, 0);
}
function setText(el, str) {
  if (el && el.textContent !== str) el.textContent = str;
}

// ===== Sound integration =====
function bgmForPhase(phase) {
  Sound.bgm(
    phase === 'reveal' ? 'reveal'
    : phase === 'vote' ? 'vote'
    : phase === 'discuss' ? 'discuss'
    : (phase === 'word' || phase === 'lobby') ? 'lobby'
    : null
  );
}
document.addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || b.disabled || b.id === 'btn-sound') return;
  if (b.closest('#sound-panel')) return;
  Sound.play(b.classList.contains('ww-btn-back') ? 'back' : 'tap');
});

// ===== Sound panel =====
const soundBtn = $('#btn-sound'), soundPanel = $('#sound-panel');
const volBgm = $('#vol-bgm'), volSfx = $('#vol-sfx'), muteBtn = $('#btn-mute');
function paintSoundUI() {
  const on = Sound.isOn();
  const v = Sound.getVol();
  soundBtn.textContent = on && (v.bgm > 0 || v.sfx > 0) ? '♪' : '🔇';
  soundBtn.classList.toggle('snd-off', !on);
  soundBtn.classList.toggle('snd-on', on);
  setText(muteBtn, on ? 'ミュート' : 'ミュート解除');
  setText($('#vol-bgm-num'), String(Math.round(v.bgm * 100)));
  setText($('#vol-sfx-num'), String(Math.round(v.sfx * 100)));
}
function openSoundPanel(open) {
  soundPanel.hidden = !open;
  soundBtn.setAttribute('aria-expanded', String(open));
}
soundBtn.addEventListener('click', () => openSoundPanel(soundPanel.hidden));
document.addEventListener('click', e => {
  if (soundPanel.hidden) return;
  if (e.target.closest('#sound-panel') || e.target.closest('#btn-sound')) return;
  openSoundPanel(false);
});
muteBtn.addEventListener('click', () => { Sound.toggle(); paintSoundUI(); });
[[volBgm, 'bgm'], [volSfx, 'sfx']].forEach(([el, kind]) => {
  el.addEventListener('input', () => {
    if (!Sound.isOn()) Sound.toggle();
    Sound.setVol(kind, el.value / 100);
    paintSoundUI();
  });
});
volBgm.value = Math.round(Sound.getVol().bgm * 100);
volSfx.value = Math.round(Sound.getVol().sfx * 100);
paintSoundUI();

// ===== Invite link =====
const inviteUrl = code => location.origin + location.pathname + '?room=' + code;
function legacyCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0';
    document.body.appendChild(ta);
    ta.select(); ta.setSelectionRange(0, text.length);
    const done = document.execCommand('copy');
    document.body.removeChild(ta);
    return done;
  } catch (e) { return false; }
}
let copyHintTimer = null;
async function copyInvite() {
  if (!roomCode) return;
  const url = inviteUrl(roomCode);
  let ok = false;
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(url); ok = true;
    }
  } catch (e) {}
  if (!ok) ok = legacyCopy(url);
  const hint = $('#copy-hint');
  hint.classList.toggle('done', ok);
  hint.classList.toggle('failed', !ok);
  setText(hint, ok ? '✔ コピーしました' : 'コピーできません');
  if (ok) Sound.play('pick');
  clearTimeout(copyHintTimer);
  copyHintTimer = setTimeout(() => {
    hint.classList.remove('done', 'failed');
    setText(hint, '📋 招待リンクをコピー');
  }, 2200);
}
$('#btn-copy-invite').addEventListener('click', copyInvite);

function applyEntryParams() {
  const p = new URLSearchParams(location.search);
  const room = normCode(p.get('room'));
  if (room) {
    $('#join-code').value = room;
    showScreen('join');
    $('#join-name').focus();
    return true;
  }
  return false;
}

// ===== Session =====
function saveSession() {
  try { localStorage.setItem(LS_KEY, JSON.stringify({ roomCode, myPlayerId })); } catch (e) {}
}
function clearSession() {
  try { localStorage.removeItem(LS_KEY); } catch (e) {}
}
async function tryRestore() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(LS_KEY) || 'null'); } catch (e) {}
  if (!s || !s.roomCode || !s.myPlayerId) return false;
  roomCode = s.roomCode; myPlayerId = s.myPlayerId;
  for (let i = 0; i < 3; i++) {
    try {
      const v = await apiGet({ code: roomCode, playerId: myPlayerId });
      if (!v.players || !v.players.some(p => p.id === myPlayerId)) break;
      renderView(v);
      startPolling();
      return true;
    } catch (e) {
      if (e.status === 404) break;
      if (i < 2) await new Promise(r => setTimeout(r, 600 * (i + 1)));
    }
  }
  roomCode = null; myPlayerId = null; clearSession();
  return false;
}

// ===== API =====
function apiError(message, status) {
  const e = new Error(message); e.status = status; return e;
}
async function apiPost(body) {
  const res = await fetch(API, {
    method: 'POST', cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw apiError(data.error || '通信エラーが発生しました', res.status);
  return data;
}
async function apiGet(params) {
  const qs = new URLSearchParams({ ...params, _: Date.now() }).toString();
  const res = await fetch(API + '?' + qs, { cache: 'no-store' });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw apiError(data.error || '通信エラーが発生しました', res.status);
  return data;
}

// ===== Polling =====
function pollDelay() {
  if (lastPhase === 'vote' || lastPhase === 'discuss') return POLL_MS;
  if (lastPhase === 'lobby' || lastPhase === null) return POLL_IDLE_MS;
  return POLL_SLOW_MS;
}
function scheduleNextPoll() {
  if (!roomCode || !myPlayerId) return;
  if (pollTimer) clearTimeout(pollTimer);
  pollTimer = setTimeout(async () => {
    pollTimer = null;
    await poll();
    scheduleNextPoll();
  }, pollDelay());
}
function startPolling() {
  stopPolling();
  failedPolls = 0; missedPolls = 0;
  poll().then(scheduleNextPoll);
}
function stopPolling() {
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
  if (timerTicker) { clearInterval(timerTicker); timerTicker = null; }
}
async function poll() {
  if (!roomCode || !myPlayerId || polling) return;
  polling = true;
  try {
    const v = await apiGet({ code: roomCode, playerId: myPlayerId });
    failedPolls = 0; missedPolls = 0;
    setOffline(false);
    renderView(v);
  } catch (e) {
    if (e.status === 404) {
      if (++missedPolls < GONE_AFTER) { setOffline(true); polling = false; return; }
      stopPolling(); clearSession();
      myPlayerId = null; roomCode = null;
      setOffline(false);
      setText($('#error-message'), e.message);
      showScreen('error');
    } else if (++failedPolls >= 3) {
      setOffline(true);
    }
  }
  polling = false;
}
function setOffline(on) {
  const el = $('#net-status');
  if (!el) return;
  el.classList.toggle('on', on);
  if (on) setText(el, '接続が切れています。再接続中…');
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
window.addEventListener('online', () => { failedPolls = 0; poll(); });

// ===== Timer =====
function updateTimer(v) {
  const timed = v.deadline && ['discuss', 'vote'].includes(v.phase);
  if (timed) {
    timerDeadline = v.deadline;
    timerTotalMs = v.phase === 'discuss' ? (v.discussSeconds || 180) * 1000 : 60 * 1000;
    $('#global-timer').style.display = '';
    if (!timerTicker) timerTicker = setInterval(tickTimer, 250);
    tickTimer();
    setText($('#timer-label'), v.phase === 'discuss' ? '議論フェーズ' : '投票フェーズ');
  } else {
    timerDeadline = null;
    lastTickSec = null;
    $('#global-timer').style.display = 'none';
  }
}
function tickTimer() {
  if (!timerDeadline) return;
  const remain = timerDeadline - (Date.now() + clockOffset);
  const secs = Math.max(0, Math.ceil(remain / 1000));
  const pct = Math.max(0, Math.min(100, (remain / timerTotalMs) * 100));
  if (secs !== lastTickSec) {
    if (secs > 0 && secs <= 10 && lastTickSec !== null) Sound.play('tick');
    lastTickSec = secs;
  }
  const min = Math.floor(secs / 60);
  const sec = secs % 60;
  setText($('#timer-value'), min > 0 ? `${min}:${String(sec).padStart(2, '0')}` : `${sec}秒`);
  const fill = $('#timer-fill');
  fill.style.width = pct + '%';
  fill.classList.toggle('danger', secs <= 10);
}

// ===== Navigation =====
function exitRoom(screen) {
  const code = roomCode, id = myPlayerId;
  stopPolling(); myPlayerId = null; roomCode = null;
  clearSession(); updateTimer({});
  Sound.bgm(null);
  lastPhase = null; lobbyCount = 0; cardFlipped = false;
  failedPolls = 0; missedPolls = 0; setOffline(false);
  paintChrome(false);
  showScreen(screen);
  if (code && id) apiPost({ action: 'leave', code, playerId: id }).catch(() => {});
}
function paintChrome(show) {
  $('#game-chrome').classList.toggle('active', show);
}
$('#btn-quit').addEventListener('click', () => {
  const playing = lastPhase && lastPhase !== 'lobby';
  if (playing && !confirm('ゲームの途中です。退出しますか？')) return;
  exitRoom('title');
});
$$('.ww-btn-back').forEach(b => b.addEventListener('click', () => showScreen(b.dataset.to)));
$('#btn-go-create').addEventListener('click', () => showScreen('create'));
$('#btn-go-join').addEventListener('click', () => showScreen('join'));

// ===== Create Room =====
$('#btn-create-room').addEventListener('click', async () => {
  const name = $('#create-name').value.trim();
  if (!name) { setText($('#create-status'), '名前を入力してください'); return; }
  $('#btn-create-room').disabled = true;
  setText($('#create-status'), '作成中...');
  try {
    const roomCodeWanted = normCode($('#create-code').value);
    if ($('#create-code').value.trim() && !roomCodeWanted) {
      setText($('#create-status'), 'コードは英数字4〜8文字にしてください');
      $('#btn-create-room').disabled = false; return;
    }
    const discMin = parseInt($('#create-discuss').value) || 3;
    const data = await apiPost({
      action: 'create', name,
      discussSeconds: discMin * 60,
      wolfCount: parseInt($('#create-wolf-count').value) || 1,
      totalRounds: parseInt($('#create-rounds').value) || 3,
      deckCode: normCode($('#create-deck-code').value) || null,
      roomCode: roomCodeWanted,
    });
    myPlayerId = data.playerId;
    roomCode = data.code;
    saveSession();
    startPolling();
    setText($('#create-status'), '');
  } catch (e) {
    setText($('#create-status'), e.message);
  }
  $('#btn-create-room').disabled = false;
});

// ===== Join Room =====
$('#btn-join-room').addEventListener('click', async () => {
  const name = $('#join-name').value.trim();
  const code = normCode($('#join-code').value);
  if (!name) { setText($('#join-status'), '名前を入力してください'); return; }
  if (!code) { setText($('#join-status'), 'コードは英数字4〜8文字にしてください'); return; }
  $('#btn-join-room').disabled = true;
  setText($('#join-status'), '参加中...');
  try {
    const data = await apiPost({ action: 'join', code, name });
    myPlayerId = data.playerId;
    roomCode = code;
    saveSession();
    startPolling();
    setText($('#join-status'), '');
  } catch (e) {
    setText($('#join-status'), e.message);
  }
  $('#btn-join-room').disabled = false;
});

// ===== Send Action =====
async function sendAction(action, extra = {}) {
  try {
    const data = await apiPost({ action, code: roomCode, playerId: myPlayerId, ...extra });
    if (data && data.phase) { failedPolls = 0; missedPolls = 0; setOffline(false); renderView(data); }
    else poll();
  } catch (e) {
    console.error('Action failed:', e.message);
  }
}

// ===== Render Dispatcher =====
let revealKey = null;
function renderView(v) {
  clockOffset = (typeof v.now === 'number') ? v.now - Date.now() : 0;
  updateTimer(v);
  bgmForPhase(v.phase);

  paintChrome(!!roomCode);
  if (roomCode) {
    setText($('#chrome-code'), v.roomCode);
  }

  if (lastPhase && lastPhase !== v.phase) {
    if (lastPhase === 'lobby' && v.phase === 'word') Sound.play('start');
    cardFlipped = false;
    revealKey = null;
  }

  switch (v.phase) {
    case 'lobby':   showScreen('lobby'); renderLobby(v); break;
    case 'word':    showScreen('word'); renderWord(v); break;
    case 'discuss': showScreen('discuss'); renderDiscuss(v); break;
    case 'vote':    showScreen('vote'); renderVote(v); break;
    case 'reveal':  showScreen('reveal'); renderReveal(v); break;
    case 'final':   showScreen('final'); renderFinal(v); break;
  }
  lastPhase = v.phase;
}

// ===== Lobby =====
function renderLobby(v) {
  setText($('#lobby-code'), v.roomCode);
  const pills = $('#lobby-pills');
  pills.innerHTML =
    `<span class="ww-pill ww-pill-gold">議論 ${Math.round(v.discussSeconds / 60)}分</span>` +
    `<span class="ww-pill ww-pill-red">ウルフ ${v.wolfCount}人</span>` +
    `<span class="ww-pill ww-pill-teal">全 ${v.totalRounds}ラウンド</span>`;

  const c = $('#lobby-players');
  const sig = v.players.map(p => p.id + ':' + p.name).join('|');
  if (c.dataset.sig !== sig) {
    if (c.dataset.sig && v.players.length > lobbyCount) Sound.play('join');
    lobbyCount = v.players.length;
    c.dataset.sig = sig;
    c.innerHTML = '';
    const letters = 'ABCDEFGH';
    v.players.forEach((p, i) => {
      const isMe = p.id === v.myId;
      const d = document.createElement('div');
      d.className = 'ww-player-row' + (isMe ? ' me' : '');
      d.innerHTML =
        `<span class="ww-dot" style="background:${p.color}">${letters[i] || ''}</span>` +
        `<span class="ww-player-name">${esc(p.name)}</span>` +
        (p.id === v.hostId ? '<span class="ww-badge ww-badge-host">HOST</span>' : '') +
        (isMe ? '<span class="ww-badge ww-badge-me">あなた</span>' : '');
      c.appendChild(d);
    });
  }
  setText($('#lobby-count'), `${v.players.length} / ${8}人`);

  if (v.isHost) {
    $('#btn-start-game').style.display = '';
    $('#btn-start-game').disabled = v.players.length < 2;
    setText($('#lobby-status'), v.players.length < 2 ? '2人以上でスタートできます' : '');
  } else {
    $('#btn-start-game').style.display = 'none';
    setText($('#lobby-status'), 'ホストの開始を待っています…');
  }
}
$('#btn-start-game').addEventListener('click', () => sendAction('start'));
$('#btn-leave-room').addEventListener('click', () => exitRoom('title'));

// ===== Word Distribution =====
function renderWord(v) {
  const card = $('#flip-card');
  card.classList.toggle('flipped', cardFlipped);
  setText($('#card-word'), v.myWord || '???');

  const btn = $('#btn-confirm-word');
  if (v.confirmed) {
    btn.disabled = true;
    btn.className = 'ww-btn ww-btn-teal';
    setText(btn, '✔ 確認済み — ほかの人を待っています…');
  } else {
    btn.disabled = false;
    btn.className = 'ww-btn ww-btn-gold';
    setText(btn, 'ワードを確認した');
  }

  const confirmed = v.confirmedStatus ? Object.values(v.confirmedStatus).filter(Boolean).length : 0;
  setText($('#word-progress'), `確認済み ${confirmed} / ${v.players.length} — 全員そろったら議論スタート`);
}
$('#flip-card').addEventListener('click', () => {
  cardFlipped = !cardFlipped;
  $('#flip-card').classList.toggle('flipped', cardFlipped);
  if (cardFlipped) Sound.play('flip');
});
$('#btn-confirm-word').addEventListener('click', () => {
  Sound.play('confirm');
  sendAction('confirm_word');
});

// ===== Discuss =====
let peekVisible = false;
let cachedMyWord = '';
function renderDiscuss(v) {
  if (v.myWord) cachedMyWord = v.myWord;
  const wordEl = $('#discuss-word');
  setText(wordEl, peekVisible ? (cachedMyWord || '???') : '●●●●');
  wordEl.style.color = peekVisible ? 'var(--red)' : 'var(--ink)';
  setText($('#btn-peek'), peekVisible ? '隠す' : '👁 表示');

  const chips = $('#discuss-players');
  const letters = 'ABCDEFGH';
  chips.innerHTML = v.players.map((p, i) =>
    `<span class="ww-chip"><span class="ww-dot-sm" style="background:${p.color}">${letters[i] || ''}</span>${esc(p.name)}</span>`
  ).join('');

  $('#btn-end-discuss').style.display = v.isHost ? '' : 'none';
}
$('#btn-peek').addEventListener('click', () => {
  peekVisible = !peekVisible;
  const wordEl = $('#discuss-word');
  setText(wordEl, peekVisible ? (cachedMyWord || '???') : '●●●●');
  wordEl.style.color = peekVisible ? 'var(--red)' : 'var(--ink)';
  setText($('#btn-peek'), peekVisible ? '隠す' : '👁 表示');
});
$('#btn-end-discuss').addEventListener('click', () => sendAction('end_discuss'));

// ===== Vote =====
let selectedVote = null;
let hasVoted = false;
function renderVote(v) {
  if (v.hasVoted) hasVoted = true;
  const letters = 'ABCDEFGH';
  const list = $('#vote-list');
  const sig = v.players.map(p => p.id).join('|');
  if (list.dataset.sig !== sig) {
    list.dataset.sig = sig;
    list.innerHTML = '';
    v.players.forEach((p, i) => {
      const isMe = p.id === v.myId;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ww-vote-btn' + (isMe ? ' self' : '');
      btn.disabled = isMe;
      btn.dataset.pid = p.id;
      btn.innerHTML =
        `<span class="ww-dot" style="background:${p.color}">${letters[i] || ''}</span>` +
        `<span class="ww-vote-name">${esc(p.name)}</span>` +
        `<span class="ww-vote-tag">${isMe ? '自分には投票不可' : ''}</span>`;
      btn.addEventListener('click', () => {
        if (hasVoted) return;
        selectedVote = p.id;
        updateVoteSelection(v);
      });
      list.appendChild(btn);
    });
  }
  updateVoteSelection(v);
  updateVoteButton(v);

  const votedCount = v.votedStatus ? Object.values(v.votedStatus).filter(Boolean).length : 0;
  setText($('#vote-progress'), `投票済み ${votedCount} / ${v.players.length} — 全員そろうか時間切れで開票`);
}

function updateVoteSelection(v) {
  $$('#vote-list .ww-vote-btn').forEach(btn => {
    const pid = btn.dataset.pid;
    const isMe = pid === v.myId;
    const selected = pid === selectedVote && !hasVoted;
    btn.classList.toggle('selected', selected);
    const tag = btn.querySelector('.ww-vote-tag');
    if (isMe) {
      setText(tag, '自分には投票不可');
    } else if (hasVoted) {
      const isVoted = v.votedStatus && v.votedStatus[pid];
      setText(tag, pid === v.myVote ? '✔ 選択中' : (isVoted ? '投票済み' : '考え中…'));
    } else if (selected) {
      setText(tag, '✔ 選択中');
    } else {
      const isVoted = v.votedStatus && v.votedStatus[pid];
      setText(tag, isVoted ? '投票済み' : '考え中…');
    }
  });
}

function updateVoteButton(v) {
  const btn = $('#btn-cast-vote');
  if (hasVoted) {
    btn.disabled = true;
    btn.className = 'ww-btn ww-btn-teal';
    setText(btn, '✔ 投票完了 — 開票を待っています…');
  } else if (selectedVote) {
    btn.disabled = false;
    btn.className = 'ww-btn ww-btn-red';
    setText(btn, 'この人に投票する');
  } else {
    btn.disabled = true;
    btn.className = 'ww-btn ww-btn-disabled';
    setText(btn, '投票する相手を選んでください');
  }
}

$('#btn-cast-vote').addEventListener('click', () => {
  if (!selectedVote || hasVoted) return;
  hasVoted = true;
  Sound.play('vote');
  sendAction('cast_vote', { targetId: selectedVote });
});

// ===== Reveal =====
function renderReveal(v) {
  const key = v.round + ':' + (v.roundWinner || '');
  if (revealKey !== key) {
    revealKey = key;
    Sound.play('reveal');
    selectedVote = null;
    hasVoted = false;
  }

  // Vote tally
  const tally = $('#reveal-tally');
  const letters = 'ABCDEFGH';
  const maxVotes = Math.max(1, ...Object.values(v.voteCounts || {}));
  tally.innerHTML = v.players.map((p, i) => {
    const count = (v.voteCounts || {})[p.id] || 0;
    const isWolf = (v.wolfIds || []).includes(p.id);
    const pct = Math.round((count / maxVotes) * 100);
    return `<div class="ww-tally-row">
      <div class="ww-tally-info">
        <span class="ww-dot-sm" style="background:${p.color}">${letters[i] || ''}</span>
        <span class="ww-tally-name">${esc(p.name)}</span>
        <span class="ww-tally-count" style="color:${isWolf ? 'var(--red)' : 'var(--ink)'}">${count}票</span>
      </div>
      <div class="ww-tally-bar-track"><div class="ww-tally-bar-fill ${isWolf ? 'wolf' : 'citizen'}" style="width:${pct}%"></div></div>
    </div>`;
  }).join('');

  // Eliminated card
  const elim = $('#reveal-eliminated');
  if (v.eliminatedId) {
    const ep = v.players.find(p => p.id === v.eliminatedId);
    const isWolf = (v.wolfIds || []).includes(v.eliminatedId);
    elim.style.display = '';
    elim.innerHTML =
      `<div class="ww-elim-inset"></div>
       <div class="ww-elim-label">処刑されたのは——</div>
       <div class="ww-elim-name">${esc(ep ? ep.name : '???')}</div>
       <div class="ww-elim-badge ${isWolf ? 'wolf' : 'citizen'}">${isWolf ? '🐺 ウルフでした！' : '◯ 市民でした…'}</div>
       <div class="ww-elim-words">ウルフのワードは「${esc(v.wolfWord || '')}」。市民のワードは「${esc(v.citizenWord || '')}」でした。</div>`;
  } else {
    elim.style.display = '';
    elim.innerHTML =
      `<div class="ww-elim-inset"></div>
       <div class="ww-elim-label">同数のため処刑なし</div>
       <div class="ww-elim-name">全員生存</div>
       <div class="ww-elim-badge wolf">🐺 ウルフの勝ち！</div>
       <div class="ww-elim-words">ウルフのワードは「${esc(v.wolfWord || '')}」。市民のワードは「${esc(v.citizenWord || '')}」でした。</div>`;
  }

  // Winner banner
  const banner = $('#reveal-banner');
  const winner = v.roundWinner || '';
  if (winner === 'citizen') {
    banner.className = 'ww-banner ww-banner-citizen';
    banner.innerHTML = `<div class="ww-banner-title">◯ 市民チームの勝利！</div><div class="ww-banner-sub">ウルフをみごと見破りました</div>`;
    banner.style.display = '';
  } else if (winner === 'wolf' || winner === 'wolf-reverse') {
    banner.className = 'ww-banner ww-banner-wolf';
    banner.innerHTML = `<div class="ww-banner-title">🐺 ウルフの勝利！</div><div class="ww-banner-sub">${winner === 'wolf-reverse' ? '逆転勝利！市民ワードを当てました' : 'まんまと逃げ切られました…'}</div>`;
    banner.style.display = '';
  } else {
    banner.style.display = 'none';
  }

  // Reverse chance
  const rev = $('#reveal-reverse');
  if (v.canReverse) {
    rev.style.display = '';
    $('#reverse-input').disabled = false;
    $('#btn-reverse').disabled = false;
  } else if (v.reverseAnswer !== null && v.isWolf) {
    rev.style.display = '';
    $('#reverse-input').value = v.reverseAnswer;
    $('#reverse-input').disabled = true;
    $('#btn-reverse').disabled = true;
    setText($('#btn-reverse'), v.reverseResult ? '✔ 正解！' : '✕ 不正解…');
  } else {
    rev.style.display = 'none';
  }

  // Next button
  const nextBtn = $('#btn-next-round');
  if (v.round >= v.totalRounds) {
    setText(nextBtn, '最終結果へ');
  } else {
    setText(nextBtn, `次へ（ラウンド ${v.round + 1} / ${v.totalRounds} へ）`);
  }
  nextBtn.disabled = !!v.isReady;
  if (v.isReady) {
    nextBtn.className = 'ww-btn ww-btn-disabled';
    setText(nextBtn, '待機中…');
  } else {
    nextBtn.className = 'ww-btn ww-btn-gold';
  }
}

$('#btn-reverse').addEventListener('click', () => {
  const answer = $('#reverse-input').value.trim();
  if (!answer) return;
  sendAction('reverse_answer', { answer });
});
$('#btn-next-round').addEventListener('click', () => sendAction('ready_next'));

// ===== Final =====
function renderFinal(v) {
  const ranking = v.finalRanking || [];
  const list = $('#final-ranking');
  const medals = ['🥇', '🥈', '🥉'];
  const letters = 'ABCDEFGH';
  list.innerHTML = ranking.map((p, i) => {
    const pi = v.players.findIndex(pp => pp.id === p.id);
    return `<div class="ww-rank-row${i === 0 ? ' top' : ''}">
      <span class="ww-rank-medal">${medals[i] || (i + 1)}</span>
      <span class="ww-dot" style="background:${p.color}">${letters[pi] || ''}</span>
      <span class="ww-rank-name">${esc(p.name)}</span>
      <span class="ww-rank-pts">${p.score}<span class="ww-rank-unit"> pt</span></span>
    </div>`;
  }).join('');

  setText($('#final-rounds'), `全${v.totalRounds}ラウンドの合計ポイント`);
  $('#btn-play-again').style.display = v.isHost ? '' : 'none';
  $('#btn-final-lobby').style.display = v.isHost ? '' : 'none';
}
$('#btn-play-again').addEventListener('click', () => sendAction('play_again'));
$('#btn-final-lobby').addEventListener('click', () => {
  if (confirm('ロビーに戻ります。よろしいですか？')) sendAction('back_to_lobby');
});
$('#btn-final-title').addEventListener('click', () => exitRoom('title'));

// ===== Error =====
$('#btn-reconnect').addEventListener('click', () => {
  if (roomCode && myPlayerId) {
    startPolling();
  } else {
    showScreen('title');
  }
});
$('#btn-error-title').addEventListener('click', () => exitRoom('title'));

// ===== Boot =====
tryRestore().then(restored => { if (!restored) applyEntryParams(); });

fetch(API + '?health=1', { cache: 'no-store' })
  .then(r => r.json())
  .then(h => {
    if (h && h.storage === 'memory') {
      const el = $('#storage-warn');
      if (el) el.classList.add('on');
    }
  })
  .catch(() => {});
