/* =========================================
   grid.js — 互動式網格點擊邏輯
   ========================================= */

/* ====================================================
   Log 工具：將使用者動作傳送至後端 /log_action
   ==================================================== */
async function logAction(action, detail = {}) {
  try {
    await fetch('/log_action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action,
        detail,
        timestamp: new Date().toISOString(),
      }),
    });
  } catch (_) {
    // log 失敗不影響主流程
  }
}

let gridState = {
  n: 0,
  start: null,         // [row, col]
  end: null,           // [row, col]
  obstacles: [],       // [[row, col], ...]
  phase: 'idle',       // idle | start | end | obstacle | done
  randomValues: null,  // 儲存隨機策略 V(s) 供比較用
};

/* ---- DOM 元素 ---- */
const btnGenerate = document.getElementById('btn-generate');
const btnEvaluate = document.getElementById('btn-evaluate');
const btnValueIter = document.getElementById('btn-value-iter');
const inputN = document.getElementById('input-n');
const gridWrapper = document.getElementById('grid-wrapper');
const phaseHint = document.getElementById('phase-hint');
const msgBox = document.getElementById('message');
const statusStart = document.getElementById('status-start');
const statusEnd = document.getElementById('status-end');
const statusObs = document.getElementById('status-obs');
const compareBox = document.getElementById('compare-box');

/* ---- 顯示訊息 ---- */
function showMsg(text, type = 'error') {
  msgBox.textContent = text;
  msgBox.className = type;
  if (type === 'success') {
    setTimeout(() => { msgBox.className = ''; msgBox.textContent = ''; }, 3500);
  }
}
function clearMsg() {
  msgBox.className = '';
  msgBox.textContent = '';
}

/* ---- 更新狀態欄 ---- */
function updateStatus() {
  const maxObs = gridState.n > 0 ? gridState.n - 2 : 0;
  statusStart.textContent = gridState.start
    ? `(${gridState.start[0]}, ${gridState.start[1]})` : '未設定';
  statusEnd.textContent = gridState.end
    ? `(${gridState.end[0]}, ${gridState.end[1]})` : '未設定';
  statusObs.textContent = `${gridState.obstacles.length} / ${maxObs}`;
}

/* ---- 更新操作提示 ---- */
function updateHint() {
  const maxObs = gridState.n - 2;
  const hints = {
    idle: '請先生成網格。',
    start: '🟢 請點擊一個格子設定【起點】',
    end: '🔴 請點擊另一個格子設定【終點】',
    obstacle: `⬛ 請點擊格子設定障礙物（還可設定 ${maxObs - gridState.obstacles.length} 個）`,
    done: '✅ 設定完成！可以點擊【執行隨機策略評估】或【執行價值迭代】',
  };
  phaseHint.textContent = hints[gridState.phase] || '';
  phaseHint.className = gridState.phase === 'done' ? 'done'
    : gridState.phase === 'obstacle' ? 'warning' : '';
}

/* ====================================================
   生成網格
   ==================================================== */
btnGenerate.addEventListener('click', async () => {
  const n = parseInt(inputN.value, 10);
  if (isNaN(n) || n < 5 || n > 9) {
    showMsg('請輸入 5 到 9 之間的整數！');
    logAction('generate_grid_invalid', { n_input: inputN.value });
    return;
  }
  clearMsg();
  logAction('generate_grid_request', { n });

  const res = await fetch('/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ n }),
  });
  const data = await res.json();
  if (!data.success) { showMsg('伺服器錯誤'); return; }

  gridState = { n, start: null, end: null, obstacles: [], phase: 'start', randomValues: null };
  btnEvaluate.disabled = true;
  btnValueIter.disabled = true;
  compareBox.style.display = 'none';
  renderGrid(n);
  updateStatus();
  updateHint();

  logAction('generate_grid_done', { n, max_obstacles: data.max_obstacles });
});

/* ====================================================
   繪製網格
   ==================================================== */
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
  gridWrapper.innerHTML = html;

  // 綁定點擊事件
  gridWrapper.querySelectorAll('td').forEach(td => {
    td.addEventListener('click', onCellClick);
  });
}

/* ====================================================
   格子點擊處理
   ==================================================== */
function onCellClick(e) {
  const td = e.currentTarget;
  const r = parseInt(td.dataset.r, 10);
  const c = parseInt(td.dataset.c, 10);

  // 已分配狀態的格子不可重複點
  if (td.classList.contains('cell-start') ||
    td.classList.contains('cell-end') ||
    td.classList.contains('cell-obstacle')) return;

  clearMsg();

  if (gridState.phase === 'start') {
    gridState.start = [r, c];
    td.classList.add('cell-start');
    gridState.phase = 'end';
    logAction('set_start', { row: r, col: c });

  } else if (gridState.phase === 'end') {
    gridState.end = [r, c];
    td.classList.add('cell-end');
    gridState.phase = gridState.n > 2 ? 'obstacle' : 'done';
    logAction('set_end', { row: r, col: c });

  } else if (gridState.phase === 'obstacle') {
    const maxObs = gridState.n - 2;
    gridState.obstacles.push([r, c]);
    td.classList.add('cell-obstacle');
    logAction('set_obstacle', {
      row: r, col: c,
      obstacle_index: gridState.obstacles.length,
      max_obstacles: maxObs,
    });

    if (gridState.obstacles.length >= maxObs) {
      gridState.phase = 'done';
      logAction('setup_complete', {
        start: gridState.start, end: gridState.end, obstacles: gridState.obstacles,
      });
    }

  } else if (gridState.phase === 'done') {
    showMsg('設定已完成，若要重設請重新生成網格。', 'error');
    logAction('click_after_done', { row: r, col: c });
    return;
  }

  updateStatus();
  updateHint();

  // 起點與終點設好後就可使用兩個演算法按鈕
  if (gridState.start && gridState.end) {
    btnEvaluate.disabled = false;
    btnValueIter.disabled = false;
  }
}

/* ====================================================
   HW1-2：執行隨機策略評估
   ==================================================== */
btnEvaluate.addEventListener('click', async () => {
  if (!gridState.start || !gridState.end) {
    showMsg('請先設定起點與終點！');
    logAction('evaluate_invalid', { reason: '缺少起點或終點' });
    return;
  }
  clearMsg();
  btnEvaluate.textContent = '計算中…';
  btnEvaluate.disabled = true;

  const evalStart = Date.now();
  logAction('evaluate_request', {
    n: gridState.n, start: gridState.start, end: gridState.end,
    obstacle_count: gridState.obstacles.length, obstacles: gridState.obstacles,
  });

  const res = await fetch('/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      n: gridState.n, start: gridState.start,
      end: gridState.end, obstacles: gridState.obstacles,
    }),
  });
  const data = await res.json();
  const elapsed = Date.now() - evalStart;

  btnEvaluate.textContent = '▶ 執行隨機策略評估';
  btnEvaluate.disabled = false;

  if (!data.success) {
    showMsg(data.error || '評估失敗');
    logAction('evaluate_error', { error: data.error, elapsed_ms: elapsed });
    return;
  }

  // 儲存隨機策略 V(s)
  gridState.randomValues = data.values;

  // 清除最佳策略樣式，套用一般箭頭
  clearOptimalStyle();

  // 顯示箭頭與 V(s)
  for (const [key, arrow] of Object.entries(data.policy)) {
    const [r, c] = parseKey(key);
    const arrowEl = document.getElementById(`arrow-${r}-${c}`);
    if (arrowEl) {
      arrowEl.textContent = arrow;
      arrowEl.className = 'cell-arrow';  // 一般樣式（綠色預設）
    }
  }
  for (const [key, val] of Object.entries(data.values)) {
    const [r, c] = parseKey(key);
    const valEl = document.getElementById(`val-${r}-${c}`);
    if (valEl) {
      valEl.textContent = typeof val === 'number' ? val.toFixed(2) : val;
      valEl.className = 'cell-value';
    }
  }
  // 清除格子最佳策略高亮
  document.querySelectorAll('#grid-table td.cell-optimal').forEach(td => {
    td.classList.remove('cell-optimal');
  });

  logAction('evaluate_done', { elapsed_ms: elapsed, policy_count: Object.keys(data.policy).length });
  showMsg('隨機策略評估完成！每格已顯示行動箭頭與 V(s) 價值。', 'success');
});

/* ====================================================
   HW1-3：執行價值迭代（最佳策略）
   ==================================================== */
btnValueIter.addEventListener('click', async () => {
  if (!gridState.start || !gridState.end) {
    showMsg('請先設定起點與終點！');
    logAction('value_iter_invalid', { reason: '缺少起點或終點' });
    return;
  }
  clearMsg();
  btnValueIter.textContent = '⚡ 迭代中…';
  btnValueIter.disabled = true;

  const t0 = Date.now();
  logAction('value_iter_request', {
    n: gridState.n, start: gridState.start, end: gridState.end,
    obstacle_count: gridState.obstacles.length,
  });

  const res = await fetch('/value_iteration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      n: gridState.n, start: gridState.start,
      end: gridState.end, obstacles: gridState.obstacles,
    }),
  });
  const data = await res.json();
  const elapsed = Date.now() - t0;

  btnValueIter.textContent = '⚡ 執行價值迭代（最佳策略）';
  btnValueIter.disabled = false;

  if (!data.success) {
    showMsg(data.error || '價值迭代失敗');
    logAction('value_iter_error', { error: data.error, elapsed_ms: elapsed });
    return;
  }

  // 先清除舊箭頭與數值
  clearOptimalStyle();

  // 顯示最佳策略（金色箭頭）
  for (const [key, arrow] of Object.entries(data.policy)) {
    const [r, c] = parseKey(key);
    const arrowEl = document.getElementById(`arrow-${r}-${c}`);
    const td = document.getElementById(`cell-${r}-${c}`);
    if (arrowEl) {
      arrowEl.textContent = arrow;
      arrowEl.className = 'cell-arrow optimal';  // 金色脈衝
    }
    if (td && !td.classList.contains('cell-start') && !td.classList.contains('cell-end')) {
      td.classList.add('cell-optimal');
    }
  }

  // 顯示最佳 V*(s)（金色數值）
  for (const [key, val] of Object.entries(data.values)) {
    const [r, c] = parseKey(key);
    const valEl = document.getElementById(`val-${r}-${c}`);
    if (valEl) {
      valEl.textContent = typeof val === 'number' ? val.toFixed(2) : val;
      valEl.className = 'cell-value optimal-val';
    }
  }

  // 顯示比較面板
  if (gridState.randomValues) {
    renderComparePanel(gridState.randomValues, data.values, gridState.n);
    compareBox.style.display = 'flex';
  }

  logAction('value_iter_done', { elapsed_ms: elapsed, policy_count: Object.keys(data.policy).length });
  showMsg('🏆 價值迭代完成！金色箭頭代表最佳策略 π*(s)，金色數值為最佳 V*(s)。', 'success');
});

/* ====================================================
   比較面板：隨機 V(s) vs 最佳 V*(s)
   ==================================================== */
function renderComparePanel(randomVals, optimalVals, n) {
  const rndEl = document.getElementById('compare-random');
  const optEl = document.getElementById('compare-optimal');

  rndEl.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  optEl.style.gridTemplateColumns = `repeat(${n}, 1fr)`;

  rndEl.innerHTML = '';
  optEl.innerHTML = '';

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const key = `(${r}, ${c})`;
      const rv = randomVals[key];
      const ov = optimalVals[key];

      const rCell = document.createElement('div');
      rCell.className = 'compare-cell';
      rCell.textContent = rv !== undefined ? (typeof rv === 'number' ? rv.toFixed(1) : rv) : '—';
      rndEl.appendChild(rCell);

      const oCell = document.createElement('div');
      // 最佳值通常 >= 隨機值，有改善的格子用金色標示
      const improved = rv !== undefined && ov !== undefined && parseFloat(ov) > parseFloat(rv);
      oCell.className = 'compare-cell' + (improved ? ' improved' : '');
      oCell.textContent = ov !== undefined ? (typeof ov === 'number' ? ov.toFixed(1) : ov) : '—';
      optEl.appendChild(oCell);
    }
  }
}

/* ---- 清除最佳策略視覺樣式 ---- */
function clearOptimalStyle() {
  document.querySelectorAll('.cell-arrow').forEach(el => {
    el.className = 'cell-arrow';
  });
  document.querySelectorAll('.cell-value').forEach(el => {
    el.className = 'cell-value';
  });
  document.querySelectorAll('#grid-table td.cell-optimal').forEach(td => {
    td.classList.remove('cell-optimal');
  });
}

/* ---- 解析 "(row, col)" 格式的鍵 ---- */
function parseKey(key) {
  const nums = key.replace(/[()]/g, '').split(',').map(s => parseInt(s.trim(), 10));
  return nums;
}

