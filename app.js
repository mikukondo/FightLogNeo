/* ================================================
   FIGHT LOG NEO — APP LOGIC
   ================================================ */

// ─── SF6 CHARACTER ROSTER ────────────────────────
const SF6_ROSTER = [
  'Ryu','Luke','Kimberly','Chun-Li','Manon','Zangief','JP','Dhalsim',
  'Cammy','Ken','Dee Jay','Lily','Blanka','Guile','E.Honda','Juri',
  'Marisa','Jamie','Rashid','A.K.I.','Ed','Akuma','M.Bison','Terry','Mai','Elena'
];

// ─── STORAGE KEYS ────────────────────────────────
const KEYS = {
  SESSIONS:    'fln_sessions',
  MATCHES:     'fln_matches',
  CHARACTERS:  'fln_characters',
  LAST_CHARS:  'fln_last_chars',
  MAIN_CHAR:   'fln_main_char',
};

// ─── APP STATE ───────────────────────────────────
const State = {
  myChar:          null,
  oppChar:         null,
  charPickerTarget:null,
  currentPeriod:   'today',
  customSessionIds:new Set(),
  currentSession:  null,
};

// ─── UTILITIES ───────────────────────────────────
function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function pad(n) { return String(n).padStart(2, '0'); }

function fmtDate(s) {
  const [y, m, d] = s.split('-');
  return `${y}/${m}/${d}`;
}

function fmtDateShort(s) {
  const [, m, d] = s.split('-');
  return `${parseInt(m)}/${parseInt(d)}`;
}

function weekStart() {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  d.setHours(0,0,0,0);
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function monthStart() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-01`;
}

function rateClass(r) {
  if (r === null) return 'rate-none';
  if (r >= 60) return 'rate-good';
  if (r >= 50) return 'rate-mid';
  return 'rate-bad';
}

function calcRate(wins, total) {
  return total > 0 ? Math.round((wins / total) * 100) : null;
}

function rateStr(r) { return r === null ? '-' : `${r}%`; }

// ─── STORAGE ─────────────────────────────────────
const DB = {
  get(key)    { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } },
  set(key, v) { localStorage.setItem(key, JSON.stringify(v)); },

  sessions()  { return this.get(KEYS.SESSIONS); },
  saveSessions(v) { this.set(KEYS.SESSIONS, v); },

  matches()   { return this.get(KEYS.MATCHES); },
  saveMatches(v) { this.set(KEYS.MATCHES, v); },

  characters() {
    let chars = this.get(KEYS.CHARACTERS);
    if (!chars.length) {
      chars = SF6_ROSTER.map(n => ({ id: uid(), name: n, isPreset: true }));
      this.set(KEYS.CHARACTERS, chars);
    }
    return chars;
  },
  saveCharacters(v) { this.set(KEYS.CHARACTERS, v); },

  lastChars() { try { return JSON.parse(localStorage.getItem(KEYS.LAST_CHARS) || '{}'); } catch { return {}; } },
  saveLastChars(v) { localStorage.setItem(KEYS.LAST_CHARS, JSON.stringify(v)); },

  mainChar() { return localStorage.getItem(KEYS.MAIN_CHAR) || null; },
  saveMainChar(v) {
    if (v) localStorage.setItem(KEYS.MAIN_CHAR, v);
    else   localStorage.removeItem(KEYS.MAIN_CHAR);
  },
};

// ─── SESSION MANAGER ─────────────────────────────
const Sessions = {
  current() {
    const today = todayStr();
    let sessions = DB.sessions();
    let s = sessions.find(x => x.date === today);
    if (!s) {
      s = { id: uid(), date: today, title: '', memo: '', createdAt: Date.now() };
      sessions.push(s);
      DB.saveSessions(sessions);
    }
    return s;
  },

  update(id, patch) {
    const sessions = DB.sessions();
    const i = sessions.findIndex(s => s.id === id);
    if (i >= 0) { sessions[i] = { ...sessions[i], ...patch }; DB.saveSessions(sessions); }
  },

  delete(id) {
    DB.saveSessions(DB.sessions().filter(s => s.id !== id));
    DB.saveMatches(DB.matches().filter(m => m.sessionId !== id));
  },
};

// ─── MATCH MANAGER ───────────────────────────────
const Matches = {
  add(sessionId, myChar, oppChar, result) {
    const list = DB.matches();
    const m = { id: uid(), sessionId, myChar, oppChar, result, createdAt: Date.now() };
    list.push(m);
    DB.saveMatches(list);
    return m;
  },

  delete(id) {
    DB.saveMatches(DB.matches().filter(m => m.id !== id));
  },

  forSession(sessionId)    { return DB.matches().filter(m => m.sessionId === sessionId); },
  forSessions(ids) {
    const set = new Set(ids);
    return DB.matches().filter(m => set.has(m.sessionId));
  },
};

// ─── STATISTICS ──────────────────────────────────
const Stats = {
  calc(matches) {
    const wins   = matches.filter(m => m.result === 'win').length;
    const losses = matches.filter(m => m.result === 'lose').length;
    const total  = wins + losses;
    return { wins, losses, total, rate: calcRate(wins, total) };
  },

  // Returns [{myChar, total, wins, losses, rate, matchups:[{oppChar,...}]}]
  byChar(matches) {
    const map = {};
    for (const m of matches) {
      if (!map[m.myChar]) map[m.myChar] = {};
      if (!map[m.myChar][m.oppChar]) map[m.myChar][m.oppChar] = { wins: 0, losses: 0 };
      if (m.result === 'win') map[m.myChar][m.oppChar].wins++;
      else                    map[m.myChar][m.oppChar].losses++;
    }
    return Object.entries(map).map(([myChar, opps]) => {
      const matchups = Object.entries(opps).map(([oppChar, {wins, losses}]) => {
        const total = wins + losses;
        return { oppChar, wins, losses, total, rate: calcRate(wins, total) };
      }).sort((a, b) => b.total - a.total);
      const wins   = matchups.reduce((s, x) => s + x.wins, 0);
      const losses = matchups.reduce((s, x) => s + x.losses, 0);
      const total  = wins + losses;
      return { myChar, wins, losses, total, rate: calcRate(wins, total), matchups };
    }).sort((a, b) => b.total - a.total);
  },

  sessionsForPeriod(period) {
    const sessions = DB.sessions();
    const today = todayStr();
    if (period === 'today')  return sessions.filter(s => s.date === today);
    if (period === 'week')   return sessions.filter(s => s.date >= weekStart());
    if (period === 'month')  return sessions.filter(s => s.date >= monthStart());
    return sessions;
  },
};

// ─── VIEW SWITCHING ──────────────────────────────
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  document.querySelector(`.nav-item[data-view="${name}"]`).classList.add('active');

  if (name === 'record') {
    const main = DB.mainChar();
    if (main) State.myChar = main;
    renderRecord();
  }
  if (name === 'history')  renderHistory();
  if (name === 'stats')    renderStats();
  if (name === 'settings') renderSettings();
}

// ─── TOAST ───────────────────────────────────────
let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ─── RESULT FLASH ────────────────────────────────
function flashResult(result) {
  const el = document.getElementById('result-flash');
  el.className = `result-flash ${result === 'win' ? 'win-flash' : 'lose-flash'} active`;
  setTimeout(() => el.classList.remove('active'), 300);
}

// ─── MODALS ──────────────────────────────────────
function openModal(name)  { document.getElementById(`modal-${name}`).classList.add('active'); }
function closeModal(name) { document.getElementById(`modal-${name}`).classList.remove('active'); }

// Custom confirm
let _confirmCb = null;
function showConfirmDialog(msg, btnLabel, cb) {
  document.getElementById('confirm-message').textContent = msg;
  document.getElementById('confirm-ok-btn').textContent = btnLabel || '削除する';
  _confirmCb = cb;
  openModal('confirm');
}
function resolveConfirm(ok) {
  closeModal('confirm');
  if (ok && _confirmCb) _confirmCb();
  _confirmCb = null;
}

// ─── STATS HTML HELPERS ──────────────────────────
function renderStatsHTML(matches, label) {
  if (!matches.length) {
    return `<div class="empty-state"><span class="empty-state-icon">📭</span>この期間の記録がありません</div>`;
  }
  const overall = Stats.calc(matches);
  const byChar  = Stats.byChar(matches);

  const overallRate = rateStr(overall.rate);
  const rClass = rateClass(overall.rate);

  let charRows = byChar.map(c => {
    const rc = rateClass(c.rate);
    const muRows = c.matchups.map(mu => {
      const rmu = rateClass(mu.rate);
      return `
        <div class="matchup-row">
          <span class="matchup-vs">vs</span>
          <span class="matchup-opp">${esc(mu.oppChar)}</span>
          <span class="matchup-record">${mu.wins}勝 ${mu.losses}敗</span>
          <span class="matchup-rate ${rmu}">${rateStr(mu.rate)}</span>
        </div>`;
    }).join('');
    return `
      <div class="char-group">
        <div class="char-group-header">
          <span class="char-group-name">${esc(c.myChar)}</span>
          <span class="char-group-stat">${c.wins}勝 ${c.losses}敗</span>
          <span class="char-group-rate ${rc}">${rateStr(c.rate)}</span>
        </div>
        ${muRows}
      </div>`;
  }).join('');

  return `
    <div class="stats-card">
      <div class="stats-card-title">${esc(label)}</div>
      <div class="stats-headline">
        <div class="win-rate-big ${rClass}">${overallRate}</div>
        <div>
          <div class="wl-record">${overall.wins}勝 ${overall.losses}敗</div>
          <div class="total-label">${overall.total}試合</div>
        </div>
      </div>
      ${charRows ? `<div class="matchup-section-title">キャラ別戦績</div>${charRows}` : ''}
    </div>`;
}

function esc(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

// ─── RECORD VIEW ─────────────────────────────────
function renderRecord() {
  State.currentSession = Sessions.current();
  const s = State.currentSession;

  document.getElementById('session-date').textContent = fmtDate(s.date);
  document.getElementById('session-title-display').textContent = s.title || 'セッション';
  document.getElementById('session-edit-btn').onclick = () => openRecordEdit(s.id);

  // Char slots
  const myEl  = document.getElementById('my-char-name');
  const oppEl = document.getElementById('opp-char-name');
  myEl.textContent  = State.myChar  || 'タップして選択';
  oppEl.textContent = State.oppChar || 'タップして選択';
  document.getElementById('my-char-slot').classList.toggle('selected', !!State.myChar);
  document.getElementById('opp-char-slot').classList.toggle('selected', !!State.oppChar);

  const canRecord = !!(State.myChar && State.oppChar);
  document.getElementById('btn-win').disabled  = !canRecord;
  document.getElementById('btn-lose').disabled = !canRecord;

  renderTodayStats(s);
  renderRecentMatches(s);
}

function renderTodayStats(session) {
  const matches = Matches.forSession(session.id);
  const el = document.getElementById('today-stats');
  el.innerHTML = renderStatsHTML(matches, "TODAY'S RECORD");
}

function renderRecentMatches(session) {
  const matches = Matches.forSession(session.id);
  const el = document.getElementById('recent-matches');
  if (!matches.length) { el.innerHTML = ''; return; }

  const recent = [...matches].reverse().slice(0, 15);
  el.innerHTML = `
    <div class="section-label">最近の試合</div>
    ${recent.map(m => `
      <div class="match-item ${m.result}">
        <div class="match-chars">${esc(m.myChar)} vs ${esc(m.oppChar)}</div>
        <div class="match-result ${m.result}">${m.result === 'win' ? 'WIN' : 'LOSE'}</div>
        <button class="match-delete" onclick="deleteMatchRecord('${m.id}')">✕</button>
      </div>`).join('')}`;
}

function recordMatch(result) {
  if (!State.myChar || !State.oppChar) return;
  const s = Sessions.current();
  Matches.add(s.id, State.myChar, State.oppChar, result);
  flashResult(result);
  showToast(result === 'win' ? '✔ 勝利！' : '✖ 敗北...');
  renderRecord();
}

function deleteMatchRecord(id) {
  Matches.delete(id);
  renderRecord();
}

function openRecordEdit(sessionId) {
  const s = DB.sessions().find(x => x.id === sessionId);
  if (!s) return;
  document.getElementById('record-edit-title').value = s.title || '';
  document.getElementById('record-edit-memo').value  = s.memo  || '';
  document.getElementById('record-edit-title').dataset.sid = sessionId;
  openModal('record-edit');
}

function saveRecordEdit() {
  const sid   = document.getElementById('record-edit-title').dataset.sid;
  const title = document.getElementById('record-edit-title').value.trim();
  const memo  = document.getElementById('record-edit-memo').value.trim();
  Sessions.update(sid, { title, memo });
  closeModal('record-edit');
  renderRecord();
  showToast('保存しました');
}

// ─── CHARACTER PICKER ────────────────────────────
function openCharPicker(target) {
  State.charPickerTarget = target;
  document.getElementById('char-picker-title').textContent =
    target === 'my'   ? '自分のキャラクター' :
    target === 'main' ? 'メインキャラクター' :
                        '相手のキャラクター';

  const chars = DB.characters().sort((a, b) => {
    if (a.isPreset !== b.isPreset) return a.isPreset ? -1 : 1;
    return a.name.localeCompare(b.name, 'ja');
  });
  const selected = target === 'my'   ? State.myChar :
                   target === 'main' ? DB.mainChar() :
                                       State.oppChar;

  document.getElementById('char-picker-grid').innerHTML =
    chars.map(c => `
      <button class="char-picker-btn ${selected === c.name ? 'selected' : ''}"
              onclick="pickChar('${esc(c.name)}')">${esc(c.name)}</button>
    `).join('');

  openModal('char-picker');
}

function pickChar(name) {
  if (State.charPickerTarget === 'main') {
    DB.saveMainChar(name);
    closeModal('char-picker');
    renderSettings();
    showToast(`${name} をメインキャラに設定しました`);
    return;
  }
  if (State.charPickerTarget === 'my') State.myChar  = name;
  else                                  State.oppChar = name;
  DB.saveLastChars({ myChar: State.myChar, oppChar: State.oppChar });
  closeModal('char-picker');
  renderRecord();
}

function clearMainChar() {
  DB.saveMainChar(null);
  renderSettings();
  showToast('メインキャラをクリアしました');
}

// ─── HISTORY VIEW ────────────────────────────────
function renderHistory() {
  const sessions = DB.sessions().sort((a, b) => b.date.localeCompare(a.date));
  const el = document.getElementById('history-list');

  if (!sessions.length) {
    el.innerHTML = `<div class="empty-state"><span class="empty-state-icon">📭</span>まだ記録がありません<br>「記録」タブで試合を登録してみましょう</div>`;
    return;
  }

  el.innerHTML = sessions.map(s => {
    const matches = Matches.forSession(s.id);
    const stats   = Stats.calc(matches);
    const title   = s.title || fmtDate(s.date);
    const rc      = rateClass(stats.rate);
    return `
      <div class="session-card" onclick="openSessionDetail('${s.id}')">
        <div class="session-card-body">
          <div class="session-card-meta">
            <div class="session-card-date">${fmtDate(s.date)}</div>
            <div class="session-card-title">${esc(title)}</div>
            ${s.memo ? `<div class="session-card-memo">${esc(s.memo.slice(0,30))}${s.memo.length>30?'…':''}</div>` : ''}
          </div>
          <div class="session-card-stats">
            <div class="session-rate ${rc}">${rateStr(stats.rate)}</div>
            <div class="session-wl">${stats.wins}勝 ${stats.losses}敗</div>
          </div>
        </div>
      </div>`;
  }).join('');
}

function openSessionDetail(sessionId) {
  const s = DB.sessions().find(x => x.id === sessionId);
  if (!s) return;

  const matches = Matches.forSession(sessionId);
  const el = document.getElementById('session-detail-content');

  const matchListHTML = matches.length
    ? [...matches].reverse().map(m => `
        <div class="match-item ${m.result}">
          <div class="match-chars">${esc(m.myChar)} vs ${esc(m.oppChar)}</div>
          <div class="match-result ${m.result}">${m.result === 'win' ? 'WIN' : 'LOSE'}</div>
          <button class="match-delete" onclick="deleteMatchFromDetail('${m.id}','${sessionId}')">✕</button>
        </div>`).join('')
    : '<div class="empty-state" style="padding:16px 0;">試合記録なし</div>';

  el.innerHTML = `
    <div class="session-detail-edit">
      <div>
        <label class="input-label">タイトル</label>
        <input type="text" class="input-text" id="sd-title"
               value="${esc(s.title)}" placeholder="${fmtDate(s.date)}" maxlength="30">
      </div>
      <div>
        <label class="input-label">メモ</label>
        <textarea class="input-textarea" id="sd-memo" rows="3"
                  placeholder="メモを入力...">${esc(s.memo || '')}</textarea>
      </div>
      <button class="btn-primary" onclick="saveSessionDetail('${sessionId}')">保存</button>
    </div>

    <div class="session-detail-body">
      ${renderStatsHTML(matches, `${fmtDate(s.date)} の戦績`)}

      <div class="section-label" style="margin-top:16px;">試合記録</div>
      ${matchListHTML}

      <button class="delete-session-btn"
              onclick="confirmDeleteSession('${sessionId}')">このセッションを削除</button>
    </div>`;

  openModal('session-detail');
}

function saveSessionDetail(sessionId) {
  const title = document.getElementById('sd-title').value.trim();
  const memo  = document.getElementById('sd-memo').value.trim();
  Sessions.update(sessionId, { title, memo });
  showToast('保存しました');
  renderHistory();
}

function deleteMatchFromDetail(matchId, sessionId) {
  Matches.delete(matchId);
  openSessionDetail(sessionId);
  renderHistory();
  if (document.getElementById('view-record').classList.contains('active')) renderRecord();
}

function confirmDeleteSession(sessionId) {
  showConfirmDialog('このセッションを削除しますか？\n試合記録もすべて削除されます。', '削除する', () => {
    Sessions.delete(sessionId);
    closeModal('session-detail');
    renderHistory();
    showToast('セッションを削除しました');
  });
}

// ─── STATS VIEW ──────────────────────────────────
function selectPeriod(period) {
  State.currentPeriod = period;
  document.querySelectorAll('.period-tab').forEach(t =>
    t.classList.toggle('active', t.dataset.period === period)
  );
  renderStats();
}

function renderStats() {
  const period = State.currentPeriod;
  const picker = document.getElementById('custom-session-picker');
  const content = document.getElementById('stats-content');

  if (period === 'custom') {
    renderCustomPicker();
    picker.classList.remove('hidden');
    const selected = [...State.customSessionIds];
    const matches = selected.length ? Matches.forSessions(selected) : [];
    const label = selected.length ? `選択中 ${selected.length} セッション` : 'セッションを選択';
    content.innerHTML = selected.length
      ? renderStatsHTML(matches, label)
      : `<div class="empty-state"><span class="empty-state-icon">☑</span>上のリストからセッションを選択してください</div>`;
  } else {
    picker.classList.add('hidden');
    const sessions = Stats.sessionsForPeriod(period);
    const matches  = Matches.forSessions(sessions.map(s => s.id));
    const labels   = { today:'今日', week:'今週', month:'今月', all:'全期間' };
    content.innerHTML = renderStatsHTML(matches, labels[period] || '');
  }
}

function renderCustomPicker() {
  const sessions = DB.sessions().sort((a, b) => b.date.localeCompare(a.date));
  const picker = document.getElementById('custom-session-picker');
  picker.innerHTML = `
    <div class="custom-picker-title">集計するセッションを選択</div>
    <div class="custom-picker-list">
      ${sessions.map(s => {
        const m = Matches.forSession(s.id);
        const st = Stats.calc(m);
        const title = s.title || fmtDate(s.date);
        const checked = State.customSessionIds.has(s.id) ? 'checked' : '';
        return `
          <label class="custom-picker-item">
            <input type="checkbox" ${checked} onchange="toggleCustomSession('${s.id}', this.checked)">
            <span class="custom-picker-label">${esc(title)}</span>
            <span class="custom-picker-stat">${st.wins}勝${st.losses}敗</span>
          </label>`;
      }).join('')}
    </div>`;
}

function toggleCustomSession(id, checked) {
  if (checked) State.customSessionIds.add(id);
  else         State.customSessionIds.delete(id);
  // Update content without re-rendering the picker
  const selected = [...State.customSessionIds];
  const matches = selected.length ? Matches.forSessions(selected) : [];
  const label = selected.length ? `選択中 ${selected.length} セッション` : '';
  const content = document.getElementById('stats-content');
  content.innerHTML = selected.length
    ? renderStatsHTML(matches, label)
    : `<div class="empty-state"><span class="empty-state-icon">☑</span>セッションを選択してください</div>`;
}

// ─── SETTINGS VIEW ───────────────────────────────
function renderSettings() {
  const main = DB.mainChar();
  const nameEl = document.getElementById('main-char-name');
  const clearBtn = document.getElementById('main-char-clear-btn');
  nameEl.textContent = main || '未設定';
  nameEl.classList.toggle('empty', !main);
  clearBtn.style.display = main ? '' : 'none';

  const chars = DB.characters().sort((a, b) => {
    if (a.isPreset !== b.isPreset) return a.isPreset ? -1 : 1;
    return a.name.localeCompare(b.name, 'ja');
  });
  document.getElementById('char-list').innerHTML =
    chars.map(c => `
      <div class="char-list-item">
        <span class="char-list-name">${esc(c.name)}</span>
        ${c.isPreset
          ? '<span class="char-preset-badge">プリセット</span>'
          : `<button class="char-delete-btn" onclick="confirmDeleteChar('${c.id}','${esc(c.name)}')">削除</button>`}
      </div>`).join('');
}

function showAddCharModal() {
  document.getElementById('new-char-input').value = '';
  openModal('add-char');
  setTimeout(() => document.getElementById('new-char-input').focus(), 120);
}

function addCustomChar() {
  const name = document.getElementById('new-char-input').value.trim();
  if (!name) return;
  const chars = DB.characters();
  if (chars.some(c => c.name.toLowerCase() === name.toLowerCase())) {
    showToast('同名のキャラクターが既に存在します');
    return;
  }
  chars.push({ id: uid(), name, isPreset: false });
  DB.saveCharacters(chars);
  closeModal('add-char');
  renderSettings();
  showToast(`${name} を追加しました`);
}

function confirmDeleteChar(id, name) {
  showConfirmDialog(`「${name}」を削除しますか？`, '削除する', () => {
    DB.saveCharacters(DB.characters().filter(c => c.id !== id));
    renderSettings();
    showToast('削除しました');
  });
}

function deleteAllData() {
  Object.values(KEYS).forEach(k => localStorage.removeItem(k));
  State.myChar  = null;
  State.oppChar = null;
  State.customSessionIds.clear();
  showToast('全データを削除しました');
  renderRecord();
  renderSettings();
}

// ─── PWA SERVICE WORKER ──────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// ─── KEYBOARD: ENTER ON INPUTS ───────────────────
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('new-char-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addCustomChar();
  });
  document.getElementById('record-edit-title').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('record-edit-memo').focus();
  });

  // Restore characters: main char takes priority for myChar
  const last = DB.lastChars();
  const main = DB.mainChar();
  State.myChar  = main || last.myChar  || null;
  State.oppChar = last.oppChar || null;

  // Initial render
  renderRecord();
});
