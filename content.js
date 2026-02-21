console.log("101围棋助手: Content Script 已加载");

// 1. 注入 inject.js
var s = document.createElement('script');
s.src = chrome.runtime.getURL('inject.js');
s.onload = function() { this.remove(); };
(document.head || document.documentElement).appendChild(s);

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
            
            <button id="btn-show-data" class="helper-btn">🔍 显示原始数据</button>
            <button id="btn-export-sgf" class="helper-btn primary">💾 导出本题 SGF</button>
            <button id="btn-show-errors" class="helper-btn" style="background-color: #f59e0b; color: white; border: none;">📚 查看错题本</button>
            
            <div id="data-display-area" style="display:none; margin-top:10px;">
                <textarea id="sgf-textarea" rows="8" style="width:100%; font-size:11px;"></textarea>
            </div>
            
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
    
    // 绑定显示数据按钮
    panel.querySelector('#btn-show-data').addEventListener('click', () => {
        const area = document.getElementById('data-display-area');
        area.style.display = area.style.display === 'none' ? 'block' : 'none';
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

async function saveErrorProblem(problemData) {
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
                // 更新错误次数和时间
                record.errorCount = (record.errorCount || 1) + 1;
                record.timestamp = Date.now();
                store.put(record);
                console.log(`【错题本】更新错题 Q-${qid}，错误次数: ${record.errorCount}`);
            } else {
                // 新增错题记录
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
                // 按时间倒序排列
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
// 3. 数据处理逻辑（修复：只保留一个监听器）
// ==========================================
let currentProblemData = null;

// 唯一的消息监听器
window.addEventListener("message", function(event) {
    if (event.source != window) return;

    if (event.data.type && (event.data.type == "101_GAME_DATA")) {
        console.log("【助手】收到数据，来源:", event.data.source);
        currentProblemData = event.data.data;
        // 合并 extra 信息（包含 initialSGF）
        if (event.data.extra) {
            currentProblemData.extra = event.data.extra;
        }
        
        // 提取答题结果
        const answerResult = event.data.answerResult;
        const isNewResult = event.data.isNewResult;
        
        console.log("【助手】prepos:", currentProblemData.prepos);
        console.log("【助手】andata:", currentProblemData.andata ? "有官方答案树" : "无");
        console.log("【助手】answers 数组长度:", Array.isArray(currentProblemData.answers) ? currentProblemData.answers.length : "非数组");
        console.log("【助手】extra.initialSGF:", currentProblemData.extra ? (currentProblemData.extra.initialSGF ? "已获取" : "空") : "无extra");
        console.log("【助手】答题结果:", answerResult, "是否新结果:", isNewResult);
        
        updateUI(answerResult, isNewResult);
    }
});

// ==========================================
// 4. SGF 转换工具 & 坐标翻译
// ==========================================
function coordinateToHuman(coord) {
    if (!coord || coord.length !== 2) return coord;
    const colCode = coord.charCodeAt(0) - 97; 
    const rowCode = coord.charCodeAt(1) - 97;
    const colChars = "ABCDEFGHJKLMNOPQRST"; // 19路跳过I
    const colStr = colChars[colCode] || "?";
    const rowStr = (19 - rowCode).toString();
    return `${colStr}${rowStr}`;
}

// ==========================================
// 4.1 从 andata 答案树构建 SGF 变化
// ==========================================
function buildAndataTree(andata, firstColor) {
    // andata 结构：
    // "0": {subs:[1], pt:"", ...}     — 根节点(无落子)
    // "1": {subs:[2], pt:"rb", ...}   — 第一手
    // "2": {subs:[3,6], pt:"sc", ...} — 第二手(这里可能分叉)
    
    function getColor(depth) {
        if (depth % 2 === 0) return firstColor;
        return firstColor === "B" ? "W" : "B";
    }
    
    function traverse(nodeId, depth) {
        const node = andata[nodeId.toString()];
        if (!node) return "";
        
        let result = "";
        
        // 添加当前节点的落子
        if (node.pt && node.pt !== "") {
            let color = getColor(depth);
            result += `;${color}[${node.pt}]`;
            if (node.tip) result += `C[${node.tip}]`;
        }
        
        if (node.subs.length === 0) {
            // 叶子节点，无后续
        } else if (node.subs.length === 1) {
            // 单条线路，继续
            result += traverse(node.subs[0], depth + 1);
        } else {
            // 分支点！每条分支用 (...) 包裹
            for (let childId of node.subs) {
                result += "(" + traverse(childId, depth + 1) + ")";
            }
        }
        
        return result;
    }
    
    const root = andata["0"];
    if (!root || !root.subs || root.subs.length === 0) return "";
    
    if (root.subs.length === 1) {
        return traverse(root.subs[0], 0);
    } else {
        let result = "";
        for (let childId of root.subs) {
            result += "(" + traverse(childId, 0) + ")";
        }
        return result;
    }
}

// ==========================================
// 4.2 完整 SGF 生成器（修复所有数据结构问题）
// ==========================================
function generateSGF(data) {
    // ---- 第一步：构建 SGF 头部（棋盘初始状态）----
    let baseSGF = "";
    
    // 优先使用 inject.js 传来的 initialSGF
    if (data.extra && data.extra.initialSGF) {
        baseSGF = data.extra.initialSGF;
    }
    
    baseSGF = baseSGF.trim();
    
    // 去掉末尾的 ')' 以便继续往里塞内容
    if (baseSGF.endsWith(')')) {
        baseSGF = baseSGF.slice(0, -1);
    }
    
    // 如果还是没有有效的 SGF 头部，就从 prepos 重建
    if (!baseSGF || !baseSGF.startsWith('(;')) {
        baseSGF = "(;GM[1]FF[4]CA[UTF-8]AP[101Helper]SZ[19]";
        if (typeof data.blackfirst !== 'undefined') {
            baseSGF += data.blackfirst ? "PL[B]" : "PL[W]";
        }
        // 从 prepos 添加初始棋子
        if (data.prepos && Array.isArray(data.prepos)) {
            if (data.prepos[0] && data.prepos[0].length > 0) {
                baseSGF += "AB";
                data.prepos[0].forEach(p => baseSGF += "[" + p + "]");
            }
            if (data.prepos[1] && data.prepos[1].length > 0) {
                baseSGF += "AW";
                data.prepos[1].forEach(p => baseSGF += "[" + p + "]");
            }
        }
    }
    
    // 添加题目元数据
    if (data.publicid) baseSGF += `GN[Q-${data.publicid}]`;
    if (data.desc) baseSGF += `C[${data.desc}]`;
    if (data.levelname) baseSGF += `DT[${data.levelname}]`;
    
    let content = baseSGF;
    
    // 确定先手颜色
    let firstColor = (data.blackfirst !== false) ? "B" : "W";
    
    // ---- 第二步：添加官方答案分支 ----
    // 优先使用 andata 答案树（最精确的官方正解）
    if (data.andata && data.andata["0"]) {
        console.log("【SGF生成】使用 andata 官方答案树");
        let treeMoves = buildAndataTree(data.andata, firstColor);
        if (treeMoves) {
            content += treeMoves;
        }
    }
    // 退路：从 answers 扁平数组中提取
    else if (Array.isArray(data.answers)) {
        console.log("【SGF生成】从 answers 数组提取");
        // answers 数组：ty=1 正解, ty=3 错误; st=2 官方, st=1 用户
        let officialCorrect = data.answers.filter(a => a.st === 2 && a.ty === 1);
        if (officialCorrect.length === 0) {
            officialCorrect = data.answers.filter(a => a.ty === 1);
        }
        
        officialCorrect.forEach((ans, idx) => {
            content += "(";
            let turn = firstColor;
            ans.pts.forEach(pt => {
                content += `;${turn}[${pt.p}]`;
                if (pt.c) content += `C[${pt.c}]`;
                turn = (turn === "B") ? "W" : "B";
            });
            content += `C[正解 #${idx + 1}])`;
        });
    }
    
    // ---- 第三步：可选 - 添加错误答案作为参考变化 ----
    if (Array.isArray(data.answers)) {
        let wrongAnswers = data.answers.filter(a => a.ty === 3);
        // 只取部分有代表性的错误答案（避免太多）
        wrongAnswers.slice(0, 5).forEach((ans, idx) => {
            content += "(";
            let turn = firstColor;
            ans.pts.forEach(pt => {
                content += `;${turn}[${pt.p}]`;
                if (pt.c) content += `C[${pt.c}]`;
                turn = (turn === "B") ? "W" : "B";
            });
            content += `C[失败变化 #${idx + 1}])`;
        });
    }
    
    // 关闭 SGF
    content += ")";
    
    console.log("【SGF生成】最终SGF长度:", content.length, "字符");
    return content;
}

// ==========================================
// 5. UI 更新函数
// ==========================================
function updateUI(answerResult, isNewResult) {
    const statusDiv = document.getElementById('helper-status');
    const textArea = document.getElementById('sgf-textarea');
    const exportBtn = document.getElementById('btn-export-sgf');
    
    if (currentProblemData) {
        // 1. 状态更新
        let statusHtml = `<span class="status-tag tag-success">数据捕获成功</span>`;
        
        // 显示题目信息
        if (currentProblemData.publicid) {
            statusHtml += `<div style="margin-top:4px; font-size:12px; color:#666;">题目 Q-${currentProblemData.publicid} | ${currentProblemData.levelname || ''} | ${currentProblemData.qtypename || ''}</div>`;
        }
        
        // 统一获取答题结果
        let finalResult = answerResult;
        if (finalResult === undefined && currentProblemData.extra && typeof currentProblemData.extra.answerResult !== 'undefined') {
            finalResult = currentProblemData.extra.answerResult;
        }
        
        // 显示答题结果
        if (finalResult === 1) {
            statusHtml += `<div style="margin-top:4px; font-weight:bold; color:#059669;">✅ 本题已通过</div>`;
        } else if (finalResult === 2) {
            if (isNewResult) {
                statusHtml += `<div style="margin-top:4px; font-weight:bold; color:#dc2626;">❌ 本题未通过 (已记录到错题本)</div>`;
                // 只有在状态刚刚变为错误时，才调用 IndexedDB 存储错题
                saveErrorProblem(currentProblemData);
            } else {
                statusHtml += `<div style="margin-top:4px; font-weight:bold; color:#dc2626;">❌ 历史错误 (未通过)</div>`;
                // 提供一个手动加入错题本的按钮
                statusHtml += `<button id="btn-manual-record" style="margin-top:4px; font-size:11px; padding:2px 6px; background:#f59e0b; color:white; border:none; border-radius:3px; cursor:pointer;">手动加入错题本</button>`;
            }
        } else if (finalResult === 0) {
            statusHtml += `<div style="margin-top:4px; font-weight:bold; color:#d97706;">⏳ 尚未作答/批改</div>`;
        } else {
            statusHtml += `<div style="margin-top:4px; font-weight:bold; color:#6b7280;">ℹ️ 未获取到答题状态</div>`;
        }
        
        // 2. 推荐首手：从 andata 或 answers 数组中提取
        let firstMoveCoord = null;
        if (currentProblemData.andata && currentProblemData.andata["0"] && currentProblemData.andata["1"]) {
            firstMoveCoord = currentProblemData.andata["1"].pt;
        } else if (Array.isArray(currentProblemData.answers)) {
            // 找官方正解
            let official = currentProblemData.answers.find(a => a.st === 2 && a.ty === 1);
            if (!official) official = currentProblemData.answers.find(a => a.ty === 1);
            if (official && official.pts && official.pts.length > 0) {
                firstMoveCoord = official.pts[0].p;
            }
        }
        
        if (firstMoveCoord) {
            const humanPos = coordinateToHuman(firstMoveCoord);
            statusHtml += `<div style="margin-top:8px; font-weight:bold; color:#059669;">💡 推荐首手: ${humanPos} (${firstMoveCoord})</div>`;
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

        // 3. 生成 SGF 内容供导出/查看
        const finalSGF = generateSGF(currentProblemData);
        textArea.value = finalSGF;
        
        // 4. 绑定导出按钮
        exportBtn.onclick = () => {
             const blob = new Blob([finalSGF], {type: "application/x-go-sgf"});
             const url = URL.createObjectURL(blob);
             const a = document.createElement('a');
             a.href = url;
             const qid = currentProblemData.publicid || 'unknown';
             a.download = `101_Q${qid}_${new Date().toISOString().slice(0,10)}.sgf`;
             document.body.appendChild(a);
             a.click();
             document.body.removeChild(a);
             URL.revokeObjectURL(url);
        };
    }
}