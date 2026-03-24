/* =========================================================
   grid.js — 統一 HW1-1 / HW1-2 / HW1-3 互動邏輯
   ========================================================= */

/* ---- 狀態 ---- */
let G = {
  n: 0,
  start: null,      // [r, c]
  end: null,      // [r, c]
  obstacles: [],    // [[r,c], ...]
  phase: 'idle',    // idle | start | end | obstacle | ready
};

/* ---- DOM ---- */
const $ = id => document.getElementById(id);
const btnGen = $('btn-generate');
const btnReset = $('btn-reset');
const btnEval = $('btn-eval');
const btnReEval = $('btn-reeval');
const btnVI = $('btn-vi');
const hint = $('phase-hint');
const msg = $('message');
const convInfo = $('converge-info');

/* ---- 工具 ---- */
function showMsg(text, type = 'error') {
  msg.textContent = text;
  msg.className = type;
  if (type === 'success')
    setTimeout(() => { msg.className = ''; msg.textContent = ''; }, 3500);
}
function clearMsg() { msg.className = ''; msg.textContent = ''; }

function setHint(text, cls = '') {
  hint.textContent = text;
  hint.className = cls;
}

function updateStatus() {
  const maxO = G.n > 0 ? G.n - 2 : 0;
  $('st-start').textContent = G.start ? `(${G.start[0]},${G.start[1]})` : '未設定';
  $('st-end').textContent = G.end ? `(${G.end[0]},${G.end[1]})` : '未設定';
  $('st-obs').textContent = `${G.obstacles.length} / ${maxO}`;
}

function updateHint() {
  const maxO = G.n - 2;
  const rem = maxO - G.obstacles.length;
  const map = {
    idle: ['請先生成網格。', 'idle'],
    start: ['🟢 點擊格子設定【起點】', ''],
    end: ['🔴 點擊另一格設定【終點】', ''],
    obstacle: [`⬛ 設定障礙物（還可設定 ${rem} 個）`, 'warn'],
    ready: ['✅ 設定完成！可執行下方演算法', 'done'],
  };
  const [text, cls] = map[G.phase] || ['', ''];
  setHint(text, cls);
}

/* =========================================================
   生成網格
   ========================================================= */
btnGen.addEventListener('click', async () => {
  const n = parseInt($('input-n').value, 10);
  if (isNaN(n) || n < 5 || n > 9) { showMsg('請輸入 5 到 9 之間的整數！'); return; }
  clearMsg();

  const res = await fetch('/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ n }),
  });
  const data = await res.json();
  if (!data.success) { showMsg('伺服器錯誤'); return; }

  G = { n, start: null, end: null, obstacles: [], phase: 'start' };
  btnEval.disabled = true;
  btnReEval.disabled = true;
  btnVI.disabled = true;
  convInfo.className = 'converge-info';
  renderGrid(n);
  updateStatus();
  updateHint();
});

/* =========================================================
   重設格子（保留 n）
   ========================================================= */
btnReset.addEventListener('click', () => {
  if (!G.n) return;
  clearMsg();
  G = { ...G, start: null, end: null, obstacles: [], phase: 'start' };
  btnEval.disabled = true;
  btnReEval.disabled = true;
  btnVI.disabled = true;
  convInfo.className = 'converge-info';
  renderGrid(G.n);
  updateStatus();
  updateHint();
});

/* =========================================================
   繪製網格
   ========================================================= */
function renderGrid(n) {
  let html = '<table id="grid-table"><tbody>';
  for (let r = 0; r < n; r++) {
    html += '<tr>';
    for (let c = 0; c < n; c++) {
      html += `<td id="cell-${r}-${c}" data-r="${r}" data-c="${c}">
        <span class="cell-coord">${r},${c}</span>
        <span class="cell-arrow" id="arrow-${r}-${c}"></span>
        <span class="cell-value" id="val-${r}-${c}"></span>
      </td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table>';
  $('grid-wrapper').innerHTML = html;
  document.querySelectorAll('#grid-table td').forEach(td =>
    td.addEventListener('click', onCellClick));
}

/* =========================================================
   格子點擊
   ========================================================= */
function onCellClick(e) {
  const td = e.currentTarget;
  const r = +td.dataset.r, c = +td.dataset.c;

  if (td.classList.contains('cell-start') ||
    td.classList.contains('cell-end') ||
    td.classList.contains('cell-obstacle')) return;
  if (G.phase === 'idle') return;
  if (G.phase === 'ready') { showMsg('設定完成，若要重設請點「↺ 重設格子」。'); return; }

  clearMsg();

  if (G.phase === 'start') {
    G.start = [r, c];
    td.classList.add('cell-start');
    G.phase = 'end';

  } else if (G.phase === 'end') {
    G.end = [r, c];
    td.classList.add('cell-end');
    G.phase = G.n > 2 ? 'obstacle' : 'ready';

  } else if (G.phase === 'obstacle') {
    G.obstacles.push([r, c]);
    td.classList.add('cell-obstacle');
    if (G.obstacles.length >= G.n - 2) G.phase = 'ready';
  }

  // 起點終點設好後，允許執行（即使障礙物未放滿）
  if (G.start && G.end) {
    btnEval.disabled = false;
    btnVI.disabled = false;
  }
  if (G.phase === 'ready') G.phase = 'ready'; // 確保保持 ready

  updateStatus();
  updateHint();
}

/* =========================================================
   清除格子內的箭頭與數值
   ========================================================= */
function clearCellDisplay() {
  for (let r = 0; r < G.n; r++) {
    for (let c = 0; c < G.n; c++) {
      const a = $(`arrow-${r}-${c}`);
      const v = $(`val-${r}-${c}`);
      if (a) { a.textContent = ''; a.className = 'cell-arrow'; }
      if (v) { v.textContent = ''; v.className = 'cell-value'; }
    }
  }
}

/* =========================================================
   HW1-2：執行策略評估（隨機策略）
   ========================================================= */
async function runPolicyEval() {
  if (!G.start || !G.end) { showMsg('請先設定起點與終點！'); return; }
  clearMsg();
  btnEval.textContent = '計算中…'; btnEval.disabled = true;
  btnVI.disabled = true;

  const res = await fetch('/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ n: G.n, start: G.start, end: G.end, obstacles: G.obstacles }),
  });
  const data = await res.json();
  btnEval.textContent = '▶ 策略評估';
  btnEval.disabled = false;
  btnVI.disabled = false;
  btnReEval.disabled = false;

  if (!data.success) { showMsg(data.error || '評估失敗'); return; }

  clearCellDisplay();

  // 顯示白色箭頭（隨機策略）
  for (const [k, arrow] of Object.entries(data.policy)) {
    const [r, c] = parseKey(k);
    const el = $(`arrow-${r}-${c}`);
    if (el) { el.textContent = arrow; el.className = 'cell-arrow random'; }
  }
  // 顯示綠色 V(s)
  for (const [k, val] of Object.entries(data.values)) {
    const [r, c] = parseKey(k);
    const el = $(`val-${r}-${c}`);
    if (el) { el.textContent = (+val).toFixed(2); el.className = 'cell-value policy'; }
  }

  convInfo.innerHTML =
    `模式：<span>隨機策略評估</span>　γ=<span>0.9</span>　θ=<span>1e-6</span>`;
  convInfo.className = 'converge-info show';
  showMsg('策略評估完成！白色箭頭 = 隨機策略，綠色數值 = V(s)', 'success');
}

btnEval.addEventListener('click', runPolicyEval);
btnReEval.addEventListener('click', runPolicyEval);

/* =========================================================
   HW1-3：執行價值迭代（最佳策略）
   ========================================================= */
btnVI.addEventListener('click', async () => {
  if (!G.start || !G.end) { showMsg('請先設定起點與終點！'); return; }
  clearMsg();
  btnVI.textContent = '計算中…'; btnVI.disabled = true;
  btnEval.disabled = true;

  const res = await fetch('/value_iteration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ n: G.n, start: G.start, end: G.end, obstacles: G.obstacles }),
  });
  const data = await res.json();
  btnVI.textContent = '⚡ 價值迭代';
  btnVI.disabled = false;
  btnEval.disabled = false;
  btnReEval.disabled = false;

  if (!data.success) { showMsg(data.error || '迭代失敗'); return; }

  clearCellDisplay();

  // 顯示金色箭頭（最佳策略）
  for (const [k, arrow] of Object.entries(data.policy)) {
    const [r, c] = parseKey(k);
    const el = $(`arrow-${r}-${c}`);
    if (el) { el.textContent = arrow; el.className = 'cell-arrow optimal'; }
  }
  // 顯示金色 V*(s)
  for (const [k, val] of Object.entries(data.values)) {
    const [r, c] = parseKey(k);
    const el = $(`val-${r}-${c}`);
    if (el) { el.textContent = (+val).toFixed(2); el.className = 'cell-value optimal'; }
  }

  convInfo.innerHTML =
    `模式：<span class="gold">價值迭代（最佳策略）</span>　γ=<span>0.9</span>　θ=<span>1e-6</span>`;
  convInfo.className = 'converge-info show';
  showMsg('價值迭代完成！金色箭頭 = 最佳策略 π*，金色數值 = V*(s)', 'success');
});

/* =========================================================
   工具：解析 "(r, c)" 字串鍵
   ========================================================= */
function parseKey(key) {
  return key.replace(/[()]/g, '').split(',').map(s => parseInt(s.trim(), 10));
}
