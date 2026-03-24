from flask import Flask, render_template, request, jsonify, session
from policy_eval import generate_random_policy, policy_evaluation, value_iteration, ARROW_MAP
import os
import logging
from logging.handlers import RotatingFileHandler
from datetime import datetime

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', os.urandom(24))

# ============================================================
#  Logger 設定
# ============================================================
LOG_DIR  = os.path.join(os.path.dirname(__file__), 'logs')
LOG_FILE = os.path.join(LOG_DIR, 'app.log')
os.makedirs(LOG_DIR, exist_ok=True)

# 格式：時間 | 層級 | 訊息
_fmt = logging.Formatter(
    fmt='%(asctime)s | %(levelname)-8s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

_file_handler = RotatingFileHandler(
    LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3, encoding='utf-8'
)
_file_handler.setFormatter(_fmt)

_console_handler = logging.StreamHandler()
_console_handler.setFormatter(_fmt)

logger = logging.getLogger('rl_app')
logger.setLevel(logging.DEBUG)
logger.addHandler(_file_handler)
logger.addHandler(_console_handler)


def log_api(endpoint: str, req_data: dict, resp_data: dict, status: str = 'OK'):
    """統一記錄 API 對話紀錄（request + response）。"""
    logger.info(
        f'[API] {endpoint} | STATUS={status} '
        f'| REQ={req_data} '
        f'| RESP={resp_data}'
    )


# ============================================================
#  路由
# ============================================================

@app.route('/')
def index():
    logger.info('[PAGE] 使用者開啟主頁面')
    return render_template('index.html')


@app.route('/generate', methods=['POST'])
def generate():
    """接收 n 值，回傳初始化的網格資料。"""
    data = request.get_json()
    n = int(data.get('n', 5))
    n = max(5, min(9, n))  # 限制範圍 5~9

    session['n'] = n
    session['start'] = None
    session['end'] = None
    session['obstacles'] = []

    resp = {'success': True, 'n': n, 'max_obstacles': n - 2}
    log_api('/generate', {'n_input': data.get('n'), 'n_clamped': n}, resp)
    return jsonify(resp)


@app.route('/evaluate', methods=['POST'])
def evaluate():
    """接收網格狀態，執行策略生成與評估，回傳 policy 與 V(s)。"""
    data = request.get_json()
    n         = int(data.get('n', 5))
    start     = data.get('start')      # [row, col] or null
    end       = data.get('end')        # [row, col] or null
    obstacles = data.get('obstacles', [])  # [[row, col], ...]

    req_summary = {
        'n': n,
        'start': start,
        'end': end,
        'obstacle_count': len(obstacles),
        'obstacles': obstacles,
    }

    if not start or not end:
        resp = {'error': '請先設定起點與終點！'}
        log_api('/evaluate', req_summary, resp, status='BAD_REQUEST')
        return jsonify(resp), 400

    policy = generate_random_policy(n, obstacles, start, end)
    values = policy_evaluation(n, policy, obstacles, start, end)

    # 將 policy 轉成箭頭符號並序列化為字串鍵
    policy_arrows = {str(k): ARROW_MAP[v] for k, v in policy.items()}

    resp = {
        'success': True,
        'policy': policy_arrows,
        'values': values,
    }

    # Log 摘要（value 太多不全印，只印前 5 筆）
    values_sample = dict(list(values.items())[:5])
    log_api('/evaluate', req_summary, {
        'success': True,
        'policy_count': len(policy_arrows),
        'values_sample': values_sample,
    })
    return jsonify(resp)


@app.route('/log_action', methods=['POST'])
def log_action():
    """接收前端使用者行為 log，寫入 app.log。"""
    data      = request.get_json(silent=True) or {}
    action    = data.get('action', 'unknown')
    detail    = data.get('detail', {})
    timestamp = data.get('timestamp', datetime.now().isoformat())

    logger.info(f'[ACTION] {timestamp} | {action} | {detail}')
    return jsonify({'logged': True})


@app.route('/value_iteration', methods=['POST'])
def run_value_iteration():
    """執行價值迭代演算法，回傳最佳策略與最佳 V*(s)。"""
    data      = request.get_json()
    n         = int(data.get('n', 5))
    start     = data.get('start')
    end       = data.get('end')
    obstacles = data.get('obstacles', [])

    req_summary = {
        'n': n, 'start': start, 'end': end,
        'obstacle_count': len(obstacles), 'obstacles': obstacles,
    }

    if not start or not end:
        resp = {'error': '請先設定起點與終點！'}
        log_api('/value_iteration', req_summary, resp, status='BAD_REQUEST')
        return jsonify(resp), 400

    policy_arrows, optimal_values = value_iteration(n, obstacles, start, end)

    resp = {'success': True, 'policy': policy_arrows, 'values': optimal_values}
    values_sample = dict(list(optimal_values.items())[:5])
    log_api('/value_iteration', req_summary, {
        'success': True,
        'policy_count': len(policy_arrows),
        'values_sample': values_sample,
    })
    return jsonify(resp)


# ============================================================
if __name__ == '__main__':
    logger.info('=' * 60)
    logger.info('  RL Grid App 啟動')
    logger.info('=' * 60)
    app.run(debug=True)
