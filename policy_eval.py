import random

ACTIONS = ['up', 'down', 'left', 'right']
ARROW_MAP = {
    'up':    '↑',
    'down':  '↓',
    'left':  '←',
    'right': '→',
}

# 方向向量
_DR = {'up': -1, 'down': 1,  'left': 0,  'right': 0}
_DC = {'up': 0,  'down': 0,  'left': -1, 'right': 1}

def get_neighbors(r, c, n, action):
    """給定目前位置與行動，回傳下一個狀態 (row, col)。若撞牆則原地不動。"""
    dr = {'up': -1, 'down': 1, 'left': 0, 'right': 0}
    dc = {'up': 0,  'down': 0, 'left': -1, 'right': 1}
    nr = r + dr[action]
    nc = c + dc[action]
    if 0 <= nr < n and 0 <= nc < n:
        return (nr, nc)
    return (r, c)  # 撞牆，原地


def generate_random_policy(n, obstacles, start, end):
    """為每個可行動格子隨機指定一個行動（上下左右）。
    
    Args:
        n: 網格大小
        obstacles: list of [row, col] 障礙物座標
        start: [row, col] 起始格
        end: [row, col] 終點格
    
    Returns:
        policy: dict { (row, col): action_str }
    """
    obstacle_set = {(o[0], o[1]) for o in obstacles}
    end_tuple = (end[0], end[1]) if end else None

    policy = {}
    for r in range(n):
        for c in range(n):
            if (r, c) in obstacle_set:
                continue  # 障礙物沒有策略
            if end_tuple and (r, c) == end_tuple:
                continue  # 終點（吸收狀態）沒有策略
            policy[(r, c)] = random.choice(ACTIONS)
    return policy


def policy_evaluation(n, policy, obstacles, start, end, gamma=0.9, theta=1e-6, max_iter=10000):
    """使用迭代策略評估推導 V(s)。
    
    MDP 設定：
        - 每步reward = -1
        - 到達終點 reward = 0（終點為吸收狀態，V(end)=0）
        - 撞障礙物 / 牆壁：原地不動，reward = -1
    
    Args:
        n: 網格大小
        policy: dict { (row, col): action_str }
        obstacles: list of [row, col]
        start: [row, col]
        end: [row, col]
        gamma: 折扣因子
        theta: 收斂門檻
        max_iter: 最大迭代次數
    
    Returns:
        V: dict { (row, col): value_float }，保留兩位小數
    """
    obstacle_set = {(o[0], o[1]) for o in obstacles}
    end_tuple   = (end[0], end[1]) if end else None

    # 初始化所有狀態值為 0
    V = {}
    for r in range(n):
        for c in range(n):
            V[(r, c)] = 0.0

    for _ in range(max_iter):
        delta = 0.0
        new_V = dict(V)

        for r in range(n):
            for c in range(n):
                if (r, c) in obstacle_set:
                    continue
                if end_tuple and (r, c) == end_tuple:
                    new_V[(r, c)] = 0.0  # 終點固定為 0
                    continue

                action = policy.get((r, c))
                if action is None:
                    continue

                next_state = get_neighbors(r, c, n, action)

                # 若下一步是障礙物，原地不動
                if next_state in obstacle_set:
                    next_state = (r, c)

                reward = -1.0
                value = reward + gamma * V[next_state]
                delta = max(delta, abs(value - V[(r, c)]))
                new_V[(r, c)] = value

        V = new_V
        if delta < theta:
            break

    # 四捨五入至兩位小數
    return {str(k): round(v, 2) for k, v in V.items()}


def value_iteration(n, obstacles, start, end, gamma=0.9, theta=1e-6, max_iter=10000):
    """價值迭代演算法：計算最佳價值函數 V*(s) 與最佳策略 π*(s)。

    Bellman 最優更新：
        V*(s) = max_a [ R(s,a) + γ · V*(s') ]

    MDP 設定：
        - 每步 reward = -1
        - 到達終點 reward = 0（終點為吸收狀態，V*(end) = 0）
        - 撞牆或障礙物 → 原地不動，reward = -1

    Args:
        n:         網格大小
        obstacles: list of [row, col]
        start:     [row, col]
        end:       [row, col]
        gamma:     折扣因子 (預設 0.9)
        theta:     收斂門檻 (預設 1e-6)
        max_iter:  最大迭代次數

    Returns:
        optimal_policy: dict { str((row,col)): arrow_symbol }
        optimal_values: dict { str((row,col)): value_float (2 decimal) }
    """
    obstacle_set = {(o[0], o[1]) for o in obstacles}
    end_tuple    = (end[0], end[1]) if end else None

    # 初始化所有狀態值為 0
    V = {(r, c): 0.0 for r in range(n) for c in range(n)}

    for _ in range(max_iter):
        delta = 0.0
        new_V = dict(V)

        for r in range(n):
            for c in range(n):
                if (r, c) in obstacle_set:
                    continue
                if end_tuple and (r, c) == end_tuple:
                    new_V[(r, c)] = 0.0   # 終點固定為 0
                    continue

                # 對每個行動計算 Q(s, a)，取最大值
                best_val = float('-inf')
                for action in ACTIONS:
                    nr = r + _DR[action]
                    nc = c + _DC[action]
                    # 撞牆 → 原地
                    if not (0 <= nr < n and 0 <= nc < n):
                        nr, nc = r, c
                    # 撞障礙物 → 原地
                    if (nr, nc) in obstacle_set:
                        nr, nc = r, c

                    q = -1.0 + gamma * V[(nr, nc)]
                    if q > best_val:
                        best_val = q

                delta = max(delta, abs(best_val - V[(r, c)]))
                new_V[(r, c)] = best_val

        V = new_V
        if delta < theta:
            break

    # 從收斂的 V* 提取最佳策略
    optimal_policy = {}
    for r in range(n):
        for c in range(n):
            if (r, c) in obstacle_set:
                continue
            if end_tuple and (r, c) == end_tuple:
                continue

            best_action = None
            best_val    = float('-inf')
            for action in ACTIONS:
                nr = r + _DR[action]
                nc = c + _DC[action]
                if not (0 <= nr < n and 0 <= nc < n):
                    nr, nc = r, c
                if (nr, nc) in obstacle_set:
                    nr, nc = r, c

                q = -1.0 + gamma * V[(nr, nc)]
                if q > best_val:
                    best_val    = q
                    best_action = action

            optimal_policy[(r, c)] = best_action

    # 序列化
    policy_arrows  = {str(k): ARROW_MAP[v] for k, v in optimal_policy.items()}
    optimal_values = {str(k): round(v, 2) for k, v in V.items()}
    return policy_arrows, optimal_values
