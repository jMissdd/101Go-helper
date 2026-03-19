console.log("101围棋助手: Content Script 已加载");

// 1. 注入 inject.js
var s = document.createElement('script');
s.src = chrome.runtime.getURL('inject.js');
s.onload = function() { this.remove(); };
(document.head || document.documentElement).appendChild(s);

const MODE_KEY = 'weiqi_helper_mode';
const LIMIT_KEY = 'weiqi_helper_time_limit_sec';

let helperMode = localStorage.getItem(MODE_KEY) || 'browse'; // browse | practice | book
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
// 2. 创建 UI 面板
// ==========================================
function createPanel() {
    const existingPanel = document.getElementById('weiqi-helper-panel');
    if (existingPanel) return existingPanel;

    const panel = document.createElement('div');
    panel.id = 'weiqi-helper-panel';
    panel.innerHTML = `
        <div id="weiqi-helper-header">
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
                        <option value="book">棋书练习</option>
                    </select>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                    <span style="font-size:12px; color:#374151;">限时(秒)</span>
                    <input id="helper-time-limit" type="number" min="5" step="5" style="width:80px; font-size:12px; padding:2px 6px;" />
                </div>
            </div>

            <div id="practice-stats" class="helper-info-block" style="display:none; margin-top:8px;"></div>
            
            <button id="btn-show-data" class="helper-btn">� 显示原始数据</button>
            <button id="btn-export-sgf" class="helper-btn primary">💾 导出本题 SGF</button>
            
            <div id="data-display-area" style="display:none; margin-top:10px;">
                <textarea id="sgf-textarea" rows="5" style="width:100%; font-size:11px;"></textarea>
            </div>

            <div id="book-practice-area" style="display:none; margin-top:10px; border:1px solid #8b5cf6; border-radius:6px; padding:8px; background:#faf5ff;">
                <div style="font-weight:bold; font-size:12px; color:#7c3aed; margin-bottom:6px;">📘 棋书练习</div>
                <div id="book-info" style="font-size:11px; color:#6b7280; margin-bottom:4px;"></div>
                <div id="book-progress-bar" style="margin-bottom:6px;">
                    <div style="background:#e5e7eb; border-radius:3px; height:6px; overflow:hidden;">
                        <div id="book-progress-fill" style="background:#8b5cf6; height:100%; width:0%; transition:width 0.3s;"></div>
                    </div>
                    <div id="book-progress-text" style="font-size:11px; color:#6b7280; margin-top:2px;"></div>
                </div>
                <div id="book-stats" style="font-size:11px; color:#4b5563; margin-bottom:6px;"></div>
                <div style="display:flex; gap:4px; flex-wrap:wrap;">
                    <button id="btn-book-prev" class="helper-btn book-nav-btn" style="flex:1; margin:0; padding:4px; font-size:11px;">⬅ 上一题</button>
                    <button id="btn-book-next" class="helper-btn book-nav-btn" style="flex:1; margin:0; padding:4px; font-size:11px; background:#8b5cf6; color:white; border-color:#7c3aed;">下一题 ➡</button>
                </div>
                <div style="display:flex; gap:4px; margin-top:4px;">
                    <button id="btn-book-wrong-only" class="helper-btn book-nav-btn" style="flex:1; margin:0; padding:4px; font-size:11px;">🔴 仅错题</button>
                    <button id="btn-book-reset" class="helper-btn book-nav-btn" style="flex:1; margin:0; padding:4px; font-size:11px;">🔄 重置本章</button>
                </div>
            </div>

            <div id="book-search-area" style="margin-top:10px; border-top: 1px solid #e5e7eb; padding-top: 10px;">
                <div style="font-weight: bold; font-size: 12px; margin-bottom: 6px;">📖 棋书搜索</div>
                <div style="display:flex; gap:4px;">
                    <input id="book-search-input" type="text" placeholder="书名 / 作者 / 难度"
                           style="flex:1; font-size:12px; padding:4px 6px; border:1px solid #d1d5db; border-radius:4px; outline:none;" />
                    <button id="btn-book-search" class="helper-btn" style="width:auto; margin:0; padding:4px 10px; background:#3b82f6; color:white; border-color:#2563eb; font-size:12px;">搜索</button>
                </div>
                <div id="book-search-status" style="font-size:11px; color:#999; margin-top:4px; display:none;"></div>
                <ul id="book-search-results" style="list-style:none; padding:0; margin:6px 0 0 0; font-size:12px; max-height:200px; overflow-y:auto;">
                    <li style="color: #999; padding: 6px 0;">输入关键词搜索棋书...</li>
                </ul>
            </div>
        </div>
    `;
    document.body.appendChild(panel);

    // 绑定关闭按钮
    panel.querySelector('.close-btn').addEventListener('click', () => {
        panel.style.display = 'none';
    });
    
    // 绑定显示数据按钮
    panel.querySelector('#btn-show-data').addEventListener('click', () => {
        const area = document.getElementById('data-display-area');
        area.style.display = area.style.display === 'none' ? 'block' : 'none';
    });

    // 棋书搜索绑定
    let _bookListCache = null;
    const bookSearchInput = panel.querySelector('#book-search-input');
    const bookSearchBtn = panel.querySelector('#btn-book-search');
    const bookSearchStatus = panel.querySelector('#book-search-status');

    async function doBookSearch() {
        const keyword = bookSearchInput.value;
        if (!_bookListCache) {
            bookSearchStatus.style.display = 'block';
            bookSearchStatus.textContent = '⏳ 首次加载棋书数据...';
            _bookListCache = await fetchBookList();
            if (_bookListCache.length > 0) {
                bookSearchStatus.textContent = `✅ 已加载 ${_bookListCache.length} 本棋书`;
                setTimeout(() => { bookSearchStatus.style.display = 'none'; }, 2000);
            } else {
                bookSearchStatus.textContent = '❌ 加载失败，请检查网络后重试';
            }
        }
        const results = searchBooks(_bookListCache, keyword);
        renderBookSearchResults(results, keyword);
    }

    bookSearchBtn.addEventListener('click', doBookSearch);
    bookSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doBookSearch();
    });

    // 棋书练习按钮绑定
    panel.querySelector('#btn-book-next').addEventListener('click', () => {
        const nextQid = getNextBookQid();
        if (nextQid) {
            goToBookQuestion(nextQid);
        } else if (bookWrongOnly) {
            const wrongCount = bookProgress ? Object.values(bookProgress.doneMap).filter(d => d.status === 2).length : 0;
            if (wrongCount === 0) {
                alert('当前章节还没有错题记录，先做几道题吧！');
            } else {
                alert('仅错题模式：已是最后一道错题（共 ' + wrongCount + ' 题）');
            }
        } else {
            alert('已是本章最后一题');
        }
    });
    panel.querySelector('#btn-book-prev').addEventListener('click', () => {
        const prevQid = getPrevBookQid();
        if (prevQid) {
            goToBookQuestion(prevQid);
        } else if (bookWrongOnly) {
            const wrongCount = bookProgress ? Object.values(bookProgress.doneMap).filter(d => d.status === 2).length : 0;
            if (wrongCount === 0) {
                alert('当前章节还没有错题记录，先做几道题吧！');
            } else {
                alert('仅错题模式：已是第一道错题（共 ' + wrongCount + ' 题）');
            }
        } else {
            alert('已是本章第一题');
        }
    });
    panel.querySelector('#btn-book-wrong-only').addEventListener('click', () => {
        bookWrongOnly = !bookWrongOnly;
        const btn = panel.querySelector('#btn-book-wrong-only');
        btn.textContent = bookWrongOnly ? '📋 全部题目' : '🔴 仅错题';
        btn.style.background = bookWrongOnly ? '#ef4444' : '';
        btn.style.color = bookWrongOnly ? 'white' : '';
        if (bookProgress) {
            bookProgress.wrongOnly = bookWrongOnly;
            if (bookContext) saveBookProgress(bookContext.bookId, bookContext.chapterId, bookProgress);
        }
    });
    panel.querySelector('#btn-book-reset').addEventListener('click', () => {
        if (!bookContext) return;
        if (!confirm(`确定重置「${bookContext.bookName || '本章'}」的做题进度吗？`)) return;
        bookProgress = {
            doneMap: {},
            stats: { total: bookChapterQs.length, done: 0, correct: 0, wrong: 0, timeoutWrong: 0, streak: 0 },
            lastQid: null,
            wrongOnly: false,
        };
        saveBookProgress(bookContext.bookId, bookContext.chapterId, bookProgress);
        updateUI(0);
    });

    const modeSelect = panel.querySelector('#helper-mode');
    const limitInput = panel.querySelector('#helper-time-limit');
    modeSelect.value = helperMode;
    limitInput.value = String(practiceTimeLimitSec);

    modeSelect.addEventListener('change', () => {
        const val = modeSelect.value;
        helperMode = (val === 'practice' || val === 'book') ? val : 'browse';
        localStorage.setItem(MODE_KEY, helperMode);

        if (helperMode === 'practice' && currentProblemId) {
            ensurePracticeState(currentProblemId, currentProblemData);
        }
        if (helperMode === 'browse' || helperMode === 'book') {
            currentCountdownSec = null;
        }
        if (helperMode === 'book' && isOnBookQuestionPage()) {
            initBookPractice();
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

// 监听来自 inject.js 的消息
window.addEventListener("message", function(event) {
    if (event.source != window) return;

    currentProblemData = event.data.data;
    const answerResult = event.data.answerResult;
    const isNewResult = event.data.isNewResult;
    console.log("【助手】来源:", event.data.source, "| 结果:", answerResult, "| 新结果:", isNewResult);
    
    // 如果切题了，重新获取历史记录
    if (currentProblemData && currentProblemData.publicid !== currentProblemId) {
        currentProblemId = currentProblemData.publicid;
        currentProblemHistory = await getProblemHistory(currentProblemId);
    }

    // 如果产生了新结果（从 0 变成 1 或 2），记录到数据库
    if (isNewResult && (answerResult === 1 || answerResult === 2)) {
        await saveProblemHistory(currentProblemData, answerResult === 1);
        // 重新获取最新的历史记录以更新 UI
        currentProblemHistory = await getProblemHistory(currentProblemId);
    }

    updateUI(answerResult);
});

// ==========================================
// 4. SGF 转换工具 & 坐标翻译
// ==========================================
function coordinateToHuman(coord) {
    if (!coord || coord.length !== 2) return coord;
    // 'a'=97. 围棋盘左上是aa=A19
    const colCode = coord.charCodeAt(0) - 97; 
    const rowCode = coord.charCodeAt(1) - 97;

    const colChars = "ABCDEFGHJKLMNOPQRST"; // 19路跳过I
    const colStr = colChars[colCode] || "?";
    
    // 假设是19路盘，行也是倒序
    const rowStr = (19 - rowCode).toString();

    return `${colStr}${rowStr}`;
}

// 简单的多分支 SGF 生成器
function generateSGF(data) {
    // 这里如果拿到的是 pure SGF 字符串，直接返回
    if (typeof data.sgf === 'string') return data.sgf;

    // 如果拿到的是 answers 对象，我们就构造一个 SGF
    if (data.answers && data.answers.ok && data.answers.ok.length > 0) {
        let content = "(;GM[1]SZ[19]AP[101Helper:1.0]\n";
        
        // 遍历所有正解分支
        data.answers.ok.forEach((variant, idx) => {
            // SGF 分支开始
            content += "(\n";
            content += `C[正解分支 #${idx+1} (用户: ${variant.username})]\n`;
            
            // 默认第一手是被动方(黑)或者主动方(白)? 每日一题好像都是黑先
            // 我们简单轮流 B/W
            let turn = "B"; 
            
            variant.pts.forEach(pt => {
                 content += `;${turn}[${pt.p}]`;
                 if(pt.c) content += `C[${pt.c}]`;
                 turn = (turn === "B") ? "W" : "B";
            });
            
            content += ")\n";
        });
        
        content += ")";
        return content;
    }
    
    // 如果是做题模式，没有 answers.ok，或者 ok 是空的
    // 我们尝试返回从页面提取的初始盘面 SGF
    if (data._extractedInitialSGF) {
        return data._extractedInitialSGF;
    }
    
    // 如果连初始盘面都没找到，至少返回一个空的 SGF 框架
    return "(;GM[1]SZ[19]AP[101Helper:1.0]\n)";
}

function updateUI() {
    const statusDiv = document.getElementById('helper-status');
    if (!statusDiv || !currentProblemData) return;

    let statusHtml = `<span class="status-tag tag-success">数据捕获成功</span>`;

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

    // 渲染历史战绩
    if (currentProblemHistory) {
        const correct = currentProblemHistory.correctCount || 0;
        const error = currentProblemHistory.errorCount || 0;
        statusHtml += `<div style="margin-top:8px; font-size:12px; color:#4b5563; text-align:center; background:#f3f4f6; padding:4px; border-radius:4px;">📊 历史战绩：${correct}对 ${error}错</div>`;
    } else {
        statusHtml += `<div style="margin-top:8px; font-size:12px; color:#4b5563; text-align:center; background:#f3f4f6; padding:4px; border-radius:4px;">📊 历史战绩：初次挑战</div>`;
    }

    statusDiv.innerHTML = statusHtml;
}