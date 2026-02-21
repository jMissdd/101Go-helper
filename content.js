console.log("101围棋助手: Content Script 已加载");

// 1. 注入 inject.js
var s = document.createElement('script');
s.src = chrome.runtime.getURL('inject.js');
s.onload = function() { this.remove(); };
(document.head || document.documentElement).appendChild(s);

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
            <span class="close-btn" title="收起"></span>
        </div>
        <div id="weiqi-helper-content">
            <div id="helper-status" class="helper-info-block">
                <span class="status-tag tag-wait">等待题目数据...</span>
            </div>

            <button id="btn-show-errors" class="helper-btn" style="background-color: #f59e0b; color: white; border: none; margin-top: 8px;">📚 查看错题本</button>

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

    panel.querySelector('.close-btn').addEventListener('click', () => {
        panel.style.display = 'none';
    });

    panel.querySelector('#btn-show-errors').addEventListener('click', () => {
        const area = document.getElementById('error-book-area');
        if (area.style.display === 'none') {
            area.style.display = 'block';
            renderErrorBook();
        } else {
            area.style.display = 'none';
        }
    });

    panel.querySelector('#btn-clear-errors').addEventListener('click', () => {
        if (confirm('确定要清空所有错题记录吗？')) {
            clearErrorBook().then(() => renderErrorBook());
        }
    });

    return panel;
}

createPanel();

// ==========================================
// 3. IndexedDB 错题本存储逻辑
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
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'qid' });
                store.createIndex('timestamp', 'timestamp', { unique: false });
            }
        };
    });
}

async function saveErrorProblem(problemData) {
    if (!problemData || !problemData.publicid) return;
    try {
        const db = await initDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const qid = problemData.publicid;
        const getReq = store.get(qid);
        getReq.onsuccess = () => {
            let record = getReq.result;
            if (record) {
                record.errorCount = (record.errorCount || 1) + 1;
                record.timestamp = Date.now();
                store.put(record);
                console.log(`【错题本】更新错题 Q-${qid}，错误次数: ${record.errorCount}`);
            } else {
                record = {
                    qid: qid,
                    title: problemData.title || '',
                    desc: problemData.desc || '',
                    levelname: problemData.levelname || '',
                    qtypename: problemData.qtypename || '',
                    errorCount: 1,
                    timestamp: Date.now(),
                    url: window.location.href
                };
                store.add(record);
                console.log(`【错题本】新增错题 Q-${qid}`);
            }
        };
    } catch (e) {
        console.error("保存错题失败:", e);
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
                const results = request.result || [];
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
                <span style="color: #dc2626; font-weight: bold; margin-right: 5px;">错${err.errorCount}次</span>
                ${date}
            </div>
        `;
        listEl.appendChild(li);
    });
}

// ==========================================
// 4. 消息监听 & UI 更新
// ==========================================
let currentProblemData = null;

window.addEventListener("message", function(event) {
    if (event.source !== window) return;
    if (!event.data || event.data.type !== "101_GAME_DATA") return;

    console.log("【助手】收到数据，来源:", event.data.source);
    currentProblemData = event.data.data;

    const answerResult = event.data.answerResult;
    const isNewResult = event.data.isNewResult;

    console.log("【助手】答题结果:", answerResult, "是否新结果:", isNewResult);
    updateUI(answerResult, isNewResult);
});

// ==========================================
// 5. UI 更新函数（不含 SGF）
// ==========================================
function updateUI(answerResult, isNewResult) {
    const statusDiv = document.getElementById('helper-status');
    if (!statusDiv || !currentProblemData) return;

    let statusHtml = '<span class="status-tag tag-success">数据捕获成功</span>';

    // 题目基本信息
    if (currentProblemData.publicid) {
        statusHtml += `<div style="margin-top:4px; font-size:12px; color:#666;">题目 Q-${currentProblemData.publicid} | ${currentProblemData.levelname || ''} | ${currentProblemData.qtypename || ''}</div>`;
    }

    // 答题结果（null/undefined 均视为 0：新题未作答）
    const finalResult = (answerResult === null || answerResult === undefined) ? 0 : answerResult;

    if (finalResult === 1) {
        statusHtml += '<div style="margin-top:4px; font-weight:bold; color:#059669;">✅ 本题已通过</div>';
    } else if (finalResult === 2) {
        if (isNewResult) {
            statusHtml += '<div style="margin-top:4px; font-weight:bold; color:#dc2626;">❌ 本题未通过 (已记录到错题本)</div>';
            saveErrorProblem(currentProblemData);
        } else {
            statusHtml += '<div style="margin-top:4px; font-weight:bold; color:#dc2626;">❌ 历史错误 (未通过)</div>';
            statusHtml += '<button id="btn-manual-record" style="margin-top:4px; font-size:11px; padding:2px 6px; background:#f59e0b; color:white; border:none; border-radius:3px; cursor:pointer;">手动加入错题本</button>';
        }
    } else {
        // finalResult === 0
        statusHtml += '<div style="margin-top:4px; font-weight:bold; color:#d97706;">⏳ 尚未作答</div>';
    }

    statusDiv.innerHTML = statusHtml;

    // 绑定手动加入错题本按钮
    const manualBtn = document.getElementById('btn-manual-record');
    if (manualBtn) {
        manualBtn.onclick = () => {
            saveErrorProblem(currentProblemData);
            manualBtn.innerText = "已加入";
            manualBtn.style.background = "#059669";
            manualBtn.disabled = true;
        };
    }
}