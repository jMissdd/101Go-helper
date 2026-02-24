console.log("101围棋助手: Content Script 已加载");

// 1. 注入 inject.js
var s = document.createElement('script');
s.src = chrome.runtime.getURL('inject.js');
s.onload = function() { this.remove(); };
(document.head || document.documentElement).appendChild(s);

const MODE_KEY = 'weiqi_helper_mode';
const LIMIT_KEY = 'weiqi_helper_time_limit_sec';

let helperMode = localStorage.getItem(MODE_KEY) || 'browse'; // browse | practice
let practiceTimeLimitSec = parseInt(localStorage.getItem(LIMIT_KEY) || '60', 10);
if (!Number.isFinite(practiceTimeLimitSec) || practiceTimeLimitSec < 5) practiceTimeLimitSec = 60;

const practiceSession = {
    byQid: new Map(),
    stats: {
        total: 0,
        correct: 0,
        wrong: 0,
        timeoutWrong: 0,
    }
};

let currentDisplayResult = 0;
let currentCountdownSec = null;
let practiceTimerHandle = null;

function ensurePracticeState(qid, problemData) {
    if (!qid) return null;
    const key = String(qid);
    let state = practiceSession.byQid.get(key);
    if (!state) {
        const now = Date.now();
        state = {
            qid: key,
            status: 0,
            locked: false,
            reason: null,
            counted: false,
            recordedHistory: false,
            startedAt: now,
            deadlineAt: now + practiceTimeLimitSec * 1000,
            data: problemData ? { ...problemData } : null,
        };
        practiceSession.byQid.set(key, state);
    } else if (problemData) {
        state.data = { ...(state.data || {}), ...problemData };
    }
    return state;
}

function formatCountdown(sec) {
    const s = Math.max(0, sec || 0);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    return `${mm}:${ss}`;
}

// ==========================================
// 2. 创建 UI 面板 (可拖动)
// ==========================================
function createPanel() {
    const existingPanel = document.getElementById('weiqi-helper-panel');
    if (existingPanel) return existingPanel;

    const panel = document.createElement('div');
    panel.id = 'weiqi-helper-panel';
    panel.innerHTML = `
        <div id="weiqi-helper-header" style="cursor: move;">
            <span>101围棋助手</span>
            <span class="close-btn" title="收起">×</span>
        </div>
        <div id="weiqi-helper-content">
            <div id="helper-status" class="helper-info-block">
                <span class="status-tag tag-wait">等待题目数据...</span>
            </div>

            <div id="helper-mode-controls" style="margin-top:8px; border:1px solid #e5e7eb; border-radius:6px; padding:8px; background:#f9fafb;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px;">
                    <span style="font-size:12px; color:#374151;">模式</span>
                    <select id="helper-mode" style="font-size:12px; padding:2px 6px;">
                        <option value="browse">浏览模式</option>
                        <option value="practice">做题模式</option>
                    </select>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                    <span style="font-size:12px; color:#374151;">限时(秒)</span>
                    <input id="helper-time-limit" type="number" min="5" step="5" style="width:80px; font-size:12px; padding:2px 6px;" />
                </div>
            </div>

            <div id="practice-stats" class="helper-info-block" style="display:none; margin-top:8px;"></div>
            
            <button id="btn-show-errors" class="helper-btn" style="background-color: #f59e0b; color: white; border: none;">📚 查看错题本</button>
            
            <div id="error-book-area" style="display:none; margin-top:10px; max-height: 200px; overflow-y: auto; border-top: 1px solid #eee; padding-top: 10px;">
                <div style="font-weight: bold; margin-bottom: 5px;">我的错题本</div>
                <ul id="error-list" style="list-style: none; padding: 0; margin: 0; font-size: 12px;">
                    <li style="color: #666;">加载中...</li>
                </ul>
                <button id="btn-clear-errors" style="margin-top: 10px; font-size: 11px; padding: 2px 5px; cursor: pointer;">清空错题本</button>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    // --- 拖动逻辑 ---
    const header = panel.querySelector('#weiqi-helper-header');
    let isDragging = false;
    let offsetX, offsetY;

    header.addEventListener('mousedown', (e) => {
        if (e.target.classList.contains('close-btn')) return;
        isDragging = true;
        offsetX = e.clientX - panel.getBoundingClientRect().left;
        offsetY = e.clientY - panel.getBoundingClientRect().top;
        panel.style.transition = 'none'; // 拖动时取消动画，防止卡顿
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        let newX = e.clientX - offsetX;
        let newY = e.clientY - offsetY;
        
        // 边界检查，防止拖出屏幕
        const maxX = window.innerWidth - panel.offsetWidth;
        const maxY = window.innerHeight - panel.offsetHeight;
        newX = Math.max(0, Math.min(newX, maxX));
        newY = Math.max(0, Math.min(newY, maxY));

        panel.style.left = newX + 'px';
        panel.style.top = newY + 'px';
        panel.style.right = 'auto'; // 覆盖默认的 right 定位
        panel.style.bottom = 'auto'; // 覆盖默认的 bottom 定位
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        panel.style.transition = ''; // 恢复动画
    });
    // --- 拖动逻辑结束 ---

    // 绑定关闭按钮
    panel.querySelector('.close-btn').addEventListener('click', () => {
        panel.style.display = 'none';
    });
    
    // 绑定查看错题本按钮
    panel.querySelector('#btn-show-errors').addEventListener('click', () => {
        const area = document.getElementById('error-book-area');
        if (area.style.display === 'none') {
            area.style.display = 'block';
            renderErrorBook();
        } else {
            area.style.display = 'none';
        }
    });
    
    // 绑定清空错题本按钮
    panel.querySelector('#btn-clear-errors').addEventListener('click', () => {
        if (confirm('确定要清空所有错题记录吗？')) {
            clearErrorBook().then(() => renderErrorBook());
        }
    });

    const modeSelect = panel.querySelector('#helper-mode');
    const limitInput = panel.querySelector('#helper-time-limit');
    modeSelect.value = helperMode;
    limitInput.value = String(practiceTimeLimitSec);

    modeSelect.addEventListener('change', () => {
        helperMode = modeSelect.value === 'practice' ? 'practice' : 'browse';
        localStorage.setItem(MODE_KEY, helperMode);

        if (helperMode === 'practice' && currentProblemId) {
            ensurePracticeState(currentProblemId, currentProblemData);
        }
        if (helperMode === 'browse') {
            currentCountdownSec = null;
        }
        updateUI(currentDisplayResult);
    });

    limitInput.addEventListener('change', () => {
        let sec = parseInt(limitInput.value || '60', 10);
        if (!Number.isFinite(sec) || sec < 5) sec = 60;
        practiceTimeLimitSec = sec;
        limitInput.value = String(practiceTimeLimitSec);
        localStorage.setItem(LIMIT_KEY, String(practiceTimeLimitSec));

        if (helperMode === 'practice' && currentProblemId) {
            const state = ensurePracticeState(currentProblemId, currentProblemData);
            if (state && !state.locked) {
                const now = Date.now();
                state.startedAt = now;
                state.deadlineAt = now + practiceTimeLimitSec * 1000;
            }
        }
        updateUI(currentDisplayResult);
    });

    return panel;
}

// 初始化面板
createPanel();

function getCurrentPracticeStatsText() {
    const s = practiceSession.stats;
    const accuracy = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
    return `📈 做题统计：总${s.total} | 对${s.correct} | 错${s.wrong}（超时${s.timeoutWrong}） | 正确率${accuracy}%`;
}

// ==========================================
// 2.5 IndexedDB 错题本存储逻辑
// ==========================================
const DB_NAME = '101WeiqiHelperDB';
const STORE_NAME = 'error_book';

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onerror = (event) => reject("IndexedDB error: " + event.target.error);
        request.onsuccess = (event) => resolve(event.target.result);
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                // 以题目 ID 为主键
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'qid' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

async function saveProblemHistory(problemData, isCorrect = false) {
    if (!problemData || !problemData.publicid) return;
    
    try {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        
        const qid = problemData.publicid;
        
        // 先查询是否已存在
        const getReq = store.get(qid);
        getReq.onsuccess = () => {
            let record = getReq.result;
            if (record) {
                // 更新次数和时间
                if (isCorrect) {
                    record.correctCount = (record.correctCount || 0) + 1;
                } else {
                    record.errorCount = (record.errorCount || 0) + 1;
                }
                record.timestamp = Date.now();
                store.put(record);
                console.log(`【历史记录】更新 Q-${qid}，对:${record.correctCount || 0} 错:${record.errorCount || 0}`);
            } else {
                // 新增记录
                record = {
                    qid: qid,
                    title: problemData.title || '',
                    desc: problemData.desc || '',
                    levelname: problemData.levelname || '',
                    qtypename: problemData.qtypename || '',
                    errorCount: isCorrect ? 0 : 1,
                    correctCount: isCorrect ? 1 : 0,
                    timestamp: Date.now(),
                    url: window.location.href
                };
                store.add(record);
                console.log(`【历史记录】新增 Q-${qid}，对:${record.correctCount} 错:${record.errorCount}`);
            }
        };
    } catch (e) {
        console.error("保存历史记录失败:", e);
    }
}

async function getProblemHistory(qid) {
    if (!qid) return null; // 防御空 key 报错
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const req = store.get(qid);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        return null;
    }
}

async function getErrorBook() {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                // 过滤出真正有错题记录的，并按时间倒序排列
                const results = (request.result || []).filter(r => r.errorCount > 0);
                results.sort((a, b) => b.timestamp - a.timestamp);
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error("读取错题本失败:", e);
        return [];
    }
}

async function clearErrorBook() {
    try {
        const db = await initDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error("清空错题本失败:", e);
    }
}

async function renderErrorBook() {
    const listEl = document.getElementById('error-list');
    if (!listEl) return;
    
    listEl.innerHTML = '<li style="color: #666;">加载中...</li>';
    
    const errors = await getErrorBook();
    
    if (errors.length === 0) {
        listEl.innerHTML = '<li style="color: #666; padding: 5px 0;">暂无错题记录，继续加油！</li>';
        return;
    }
    
    listEl.innerHTML = '';
    errors.forEach(err => {
        const date = new Date(err.timestamp).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        const li = document.createElement('li');
        li.style.cssText = 'padding: 5px 0; border-bottom: 1px dashed #eee; display: flex; justify-content: space-between; align-items: center;';
        
        li.innerHTML = `
            <div style="flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <a href="${err.url}" target="_blank" style="color: #2563eb; text-decoration: none; font-weight: bold;">Q-${err.qid}</a>
                <span style="color: #666; margin-left: 5px;">${err.levelname} ${err.qtypename}</span>
            </div>
            <div style="text-align: right; color: #999; min-width: 80px;">
                <span style="color: #059669; font-size: 11px; margin-right: 3px;">对${err.correctCount || 0}</span>
                <span style="color: #dc2626; font-weight: bold; margin-right: 5px;">错${err.errorCount}次</span>
                ${date}
            </div>
        `;
        listEl.appendChild(li);
    });
}


// ==========================================
// 3. 数据处理逻辑
// ==========================================
let currentProblemData = null;
let currentProblemHistory = null;
let currentProblemId = null;

async function lockPracticeResult(qid, result, reason) {
    const state = ensurePracticeState(qid, currentProblemData);
    if (!state || state.locked) return;

    state.status = result;
    state.locked = true;
    state.reason = reason;

    if (!state.counted) {
        practiceSession.stats.total += 1;
        if (result === 1) practiceSession.stats.correct += 1;
        else {
            practiceSession.stats.wrong += 1;
            if (reason === 'timeout') practiceSession.stats.timeoutWrong += 1;
        }
        state.counted = true;
    }

    if (!state.recordedHistory && state.data) {
        await saveProblemHistory(state.data, result === 1);
        state.recordedHistory = true;
        currentProblemHistory = await getProblemHistory(qid);
    }
}

async function checkPracticeTimeoutForCurrent() {
    if (helperMode !== 'practice' || !currentProblemId) return;
    const state = ensurePracticeState(currentProblemId, currentProblemData);
    if (!state) return;

    if (state.locked) {
        currentCountdownSec = null;
        return;
    }

    const now = Date.now();
    const leftSec = Math.ceil((state.deadlineAt - now) / 1000);
    currentCountdownSec = Math.max(0, leftSec);
    if (leftSec <= 0) {
        await lockPracticeResult(currentProblemId, 2, 'timeout');
        currentDisplayResult = 2;
    }
}

window.addEventListener("message", async function(event) {
    if (event.source != window) return;
    if (!event.data || event.data.type !== "101_GAME_DATA") return;

    currentProblemData = event.data.data;
    const answerResult = event.data.answerResult;
    const isNewResult = event.data.isNewResult;
    console.log("【助手】来源:", event.data.source, "| 结果:", answerResult, "| 新结果:", isNewResult);
    
    // 如果切题了，重新获取历史记录
    if (currentProblemData && currentProblemData.publicid !== currentProblemId) {
        currentProblemId = currentProblemData.publicid;
        currentProblemHistory = await getProblemHistory(currentProblemId);
    }

    const incomingResult = (answerResult === null || answerResult === undefined) ? 0 : answerResult;

    if (helperMode === 'practice' && currentProblemId) {
        const state = ensurePracticeState(currentProblemId, currentProblemData);
        if (state && !state.locked) {
            if (incomingResult === 1 || incomingResult === 2) {
                await lockPracticeResult(currentProblemId, incomingResult, 'result');
            } else {
                await checkPracticeTimeoutForCurrent();
            }
        }

        currentDisplayResult = state && state.locked ? state.status : incomingResult;
        if (state && state.locked) currentCountdownSec = null;
    } else {
        // 浏览模式不写错题统计
        currentDisplayResult = incomingResult;
        currentCountdownSec = null;
    }

    updateUI(currentDisplayResult);
});

if (!practiceTimerHandle) {
    practiceTimerHandle = setInterval(async () => {
        await checkPracticeTimeoutForCurrent();
        if (helperMode === 'practice') updateUI(currentDisplayResult);
    }, 1000);
}

// ==========================================
// 4. UI 更新函数
// ==========================================
function updateUI(answerResult) {
    const statusDiv = document.getElementById('helper-status');
    if (!statusDiv || !currentProblemData) return;

    let statusHtml = `<span class="status-tag tag-success">数据捕获成功</span>`;
    statusHtml += `<div style="margin-top:4px; font-size:12px; color:#374151;">当前模式：${helperMode === 'practice' ? '📝 做题模式' : '👀 浏览模式'}</div>`;

    if (currentProblemData.publicid) {
        statusHtml += `<div style="margin-top:4px; font-size:12px; color:#666;">题目 Q-${currentProblemData.publicid} | ${currentProblemData.levelname || ''} | ${currentProblemData.qtypename || ''}</div>`;
    }

    // null/undefined 统一视为 0（尚未作答）
    const finalResult = (answerResult === null || answerResult === undefined) ? 0 : answerResult;

    if (finalResult === 1) {
        statusHtml += `<div style="margin-top:4px; font-weight:bold; color:#059669;">✅ 本题已通过</div>`;
    } else if (finalResult === 2) {
        statusHtml += `<div style="margin-top:4px; font-weight:bold; color:#dc2626;">❌ 本题未通过</div>`;
    } else {
        statusHtml += `<div style="margin-top:4px; font-weight:bold; color:#d97706;">⏳ 尚未作答</div>`;
    }

    if (helperMode === 'practice') {
        const countdown = (currentCountdownSec === null) ? '--:--' : formatCountdown(currentCountdownSec);
        statusHtml += `<div style="margin-top:6px; font-size:12px; color:#111827;">⏱️ 本题限时：${practiceTimeLimitSec}s | 剩余：${countdown}</div>`;
    }

    // 渲染历史战绩
    if (currentProblemHistory) {
        const correct = currentProblemHistory.correctCount || 0;
        const error = currentProblemHistory.errorCount || 0;
        statusHtml += `<div style="margin-top:8px; font-size:12px; color:#4b5563; text-align:center; background:#f3f4f6; padding:4px; border-radius:4px;">📊 历史战绩：${correct}对 ${error}错</div>`;
    } else {
        statusHtml += `<div style="margin-top:8px; font-size:12px; color:#4b5563; text-align:center; background:#f3f4f6; padding:4px; border-radius:4px;">📊 历史战绩：初次挑战</div>`;
    }

    statusDiv.innerHTML = statusHtml;

    const statsDiv = document.getElementById('practice-stats');
    if (statsDiv) {
        if (helperMode === 'practice') {
            statsDiv.style.display = 'block';
            statsDiv.innerHTML = getCurrentPracticeStatsText();
        } else {
            statsDiv.style.display = 'none';
            statsDiv.innerHTML = '';
        }
    }
}