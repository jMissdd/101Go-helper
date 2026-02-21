(function() {
    console.log("101围棋助手: 内鬼脚本 v5.0 (数据结构修正版) 已注入...");

    // ==========================================
    // 基础工具：SGF 手动组装（从 prepos 构建初始棋盘）
    // ==========================================
    function constructInitialSGF(data) {
        if (!data) return "";
        let sgfHead = "(;GM[1]FF[4]CA[UTF-8]AP[101Helper]SZ[19]";
        
        if (typeof data.blackfirst !== 'undefined') {
            sgfHead += data.blackfirst ? "PL[B]" : "PL[W]";
        }

        if (Array.isArray(data.prepos)) {
            if (data.prepos[0] && data.prepos[0].length > 0) {
                sgfHead += "AB";
                data.prepos[0].forEach(p => sgfHead += "[" + p + "]");
            }
            if (data.prepos[1] && data.prepos[1].length > 0) {
                sgfHead += "AW";
                data.prepos[1].forEach(p => sgfHead += "[" + p + "]");
            }
        }
        sgfHead += ")";
        return sgfHead;
    }

    // ==========================================
    // 尝试从 Alpine.store('qipan') 读取完整棋盘
    // Alpine 解码了 qqdata.c 字段，包含全部棋子
    // ==========================================
    function readBoardFromAlpine(qqdata) {
        try {
            // Alpine v3 访问全局 store
            if (typeof Alpine === 'undefined') return null;
            const store = Alpine.store('qipan');
            if (!store) return null;

            // 101weiqi 的 qipan store 把解析好的棋局存在某个结构里
            // 尝试直接访问 store.qqdata（Alpine 中的 qqdata 可能已含完整 prepos）
            if (store.qqdata && store.qqdata.prepos) {
                const alpinePrepos = store.qqdata.prepos;
                const origPrepos = qqdata.prepos;
                const alpineBlack = alpinePrepos[0] || [];
                const alpineWhite = alpinePrepos[1] || [];
                const origBlack = origPrepos ? (origPrepos[0] || []) : [];
                const origWhite = origPrepos ? (origPrepos[1] || []) : [];
                
                if (alpineBlack.length > origBlack.length || alpineWhite.length > origWhite.length) {
                    return store.qqdata;
                }
            }

            // 尝试直接找 board 数组（二维数组，可能是 1=黑,2=白）
            if (store.board && Array.isArray(store.board)) {
                return { _alpineBoard: store.board, _source: 'board' };
            }

        } catch(e) {
            console.log("Alpine store 读取失败:", e.message);
        }
        return null;
    }

    // 从二维 board 数组还原 SGF prepos 数据
    function boardArrayToSGF(boardArr, blackfirst) {
        const colLetters = 'abcdefghijklmnopqrs';
        const blacks = [], whites = [];
        for (let row = 0; row < boardArr.length; row++) {
            const cols = boardArr[row];
            if (!Array.isArray(cols)) continue;
            for (let col = 0; col < cols.length; col++) {
                const val = cols[col];
                const coord = colLetters[col] + colLetters[row];
                if (val === 1 || val === 'B' || val === 'b') blacks.push(coord);
                else if (val === 2 || val === 'W' || val === 'w') whites.push(coord);
            }
        }
        let sgf = "(;GM[1]FF[4]CA[UTF-8]AP[101Helper]SZ[19]";
        if (typeof blackfirst !== 'undefined') sgf += blackfirst ? "PL[B]" : "PL[W]";
        if (blacks.length > 0) sgf += "AB" + blacks.map(c => "[" + c + "]").join('');
        if (whites.length > 0) sgf += "AW" + whites.map(c => "[" + c + "]").join('');
        sgf += ")";
        return sgf;
    }

    function normalizeResult(raw) {
        if (raw === 1 || raw === '1') return 1;
        if (raw === 2 || raw === '2') return 2;
        if (raw === 0 || raw === '0' || raw === 4 || raw === '4') return 0;
        return null;
    }

    function detectResultFromResultPanel() {
        const iconOk = document.querySelector('.qipan-result .icon.ok');
        if (iconOk) return 1;

        const iconFail = document.querySelector('.qipan-result .icon.fail');
        if (iconFail) return 2;

        const resultBox = document.querySelector('.qipan-result');
        if (resultBox && resultBox.classList.contains('error')) return 2;

        return null;
    }

    function readAnswerResultFromStore(val) {
        // 收集所有来源的结果，优先返回 1 或 2，最后才考虑 0
        let fallbackZero = null;

        const check = (raw) => {
            const n = normalizeResult(raw);
            if (n === 1 || n === 2) return n;   // 明确结果，直接采用
            if (n === 0) fallbackZero = 0;       // 记录"未作答"，但继续找
            return null;
        };

        try {
            if (typeof Alpine !== 'undefined') {
                const store = Alpine.store('qipan');
                if (store) {
                    let r;
                    if (typeof store.duizhanResult !== 'undefined') {
                        r = check(store.duizhanResult);
                        if (r !== null) return r;
                    }
                    if (store.taskinfo && typeof store.taskinfo.result !== 'undefined') {
                        r = check(store.taskinfo.result);
                        if (r !== null) return r;
                    }
                    if (typeof store.answerResult !== 'undefined') {
                        r = check(store.answerResult);
                        if (r !== null) return r;
                    }
                    if (store.qqdata && store.qqdata.myan && typeof store.qqdata.myan.result !== 'undefined') {
                        r = check(store.qqdata.myan.result);
                        if (r !== null) return r;
                    }
                }
            }
        } catch(e) {}

        if (val && val.myan && typeof val.myan.result !== 'undefined') {
            const r = check(val.myan.result);
            if (r !== null) return r;
        }

        return fallbackZero; // 所有来源都没有 1/2，才返回 0 或 null
    }

    // ==========================================
    // 扫描全局变量，提取题目数据和答题结果
    // ==========================================
    function scanGlobalVariables() {
        const candidates = ['qqdata', 'g_chess_data', 'pdata', 'chess_data'];
        
        for (let i = 0; i < candidates.length; i++) {
            let name = candidates[i];
            let val = window[name];
            
            if (val && (val.prepos || val.answers || val.sgf)) {
                // 尝试从 Alpine store 获取最新的题目 ID 和数据，解决无刷新下一题的问题
                let currentProblemId = val.publicid || val.id || 'unknown';
                try {
                    if (typeof Alpine !== 'undefined') {
                        const store = Alpine.store('qipan');
                        if (store && store.qqdata) {
                            val = store.qqdata; // 使用 Alpine 中最新的数据
                            currentProblemId = val.publicid || val.id || currentProblemId;
                        }
                    }
                } catch(e) {}

                // 获取答题结果：优先状态字段，其次结果面板
                let answerResult = readAnswerResultFromStore(val);

                if (answerResult === null) {
                    const panelResult = detectResultFromResultPanel();
                    if (panelResult !== null) {
                        answerResult = panelResult;
                    }
                }

                // 第一步：尝试从 Alpine store 读取完整棋盘
                let initialSGF = "";
                const alpineData = readBoardFromAlpine(val);
                
                if (alpineData && alpineData._alpineBoard) {
                    // Alpine 返回了二维数组形式的棋盘
                    initialSGF = boardArrayToSGF(alpineData._alpineBoard, val.blackfirst);
                } else if (alpineData && alpineData.prepos) {
                    // Alpine store 里的 prepos 比 qqdata 原始的更完整
                    initialSGF = constructInitialSGF(alpineData);
                } else {
                    // 退路：用 qqdata 原始 prepos（可能不完整）
                    if (val.sgf && typeof val.sgf === 'string' && val.sgf.includes('AB[')) {
                        initialSGF = val.sgf;
                    } else {
                        initialSGF = constructInitialSGF(val);
                    }
                }

                // 缓存答题结果：一旦检测到 1 或 2，就记住它，防止提示语消失后状态回退
                if (!window._problemResultCache) window._problemResultCache = {};
                if (answerResult === 1 || answerResult === 2) {
                    window._problemResultCache[currentProblemId] = answerResult;
                } else if (window._problemResultCache[currentProblemId]) {
                    answerResult = window._problemResultCache[currentProblemId];
                }

                if (window._lastSentAnswerResult !== answerResult || window._lastProblemId !== currentProblemId || !window._hasSentData) {
                    const isNewResult = (window._hasSentData && window._lastProblemId === currentProblemId && window._lastSentAnswerResult !== answerResult);
                    
                    window._lastSentAnswerResult = answerResult;
                    window._lastProblemId = currentProblemId;
                    window._hasSentData = true;

                    // Alpine store 返回的是 Proxy 对象，postMessage 无法克隆，需要先转为纯对象
                    let plainVal;
                    try {
                        plainVal = JSON.parse(JSON.stringify(val));
                    } catch(e) {
                        plainVal = window[name]; // 深拷贝失败时回退到原始全局变量
                    }
                    
                    window.postMessage({
                        type: "101_GAME_DATA",
                        source: "GLOBAL_" + name,
                        data: plainVal, 
                        answerResult: answerResult, // 1=正确, 2=错误
                        isNewResult: isNewResult,   // 是否是刚刚发生的状态变化
                        extra: { 
                            initialSGF: initialSGF
                        }
                    }, "*");
                }
                
                return true;
            }
        }
        return false;
    }

    // ==========================================
    // 执行策略：多次尝试，等 Alpine 就绪
    // ==========================================
    if (!scanGlobalVariables()) {
        console.log("首次扫描未发现全局变量，启动轮询...");
    }

    // 页面加载完成后，等 Alpine 也初始化完再读
    window.addEventListener('load', function() {
        setTimeout(scanGlobalVariables, 800);  // 等 Alpine 初始化
        setTimeout(scanGlobalVariables, 2000); // 再等一次确保 Alpine store 就绪
    });
    
    // 增加 MutationObserver 实时监听 DOM 变化，防止提示语一闪而过被漏掉
    let observerScanTimer = null;
    const observer = new MutationObserver((mutations) => {
        let shouldCheck = false;
        for (let mutation of mutations) {
            if (mutation.type === 'attributes') {
                const target = mutation.target;
                if (target && target.nodeType === Node.ELEMENT_NODE) {
                    const cls = target.className ? String(target.className) : '';
                    if (cls.includes('qipan-result') || cls.includes('icon') || cls.includes('ok') || cls.includes('fail')) {
                        shouldCheck = true;
                        break;
                    }
                }
            } else if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                shouldCheck = true;
                break;
            }
        }
        if (shouldCheck) {
            if (detectResultFromResultPanel() !== null) {
                if (observerScanTimer) clearTimeout(observerScanTimer);
                observerScanTimer = setTimeout(() => {
                    scanGlobalVariables();
                }, 30);
            }
        }
    });
    
    // 监听整个 body 的子节点变化
    const startObserve = () => {
        if (!document.body) return;
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style']
        });
    };
    if (document.body) startObserve();
    else window.addEventListener('DOMContentLoaded', startObserve, { once: true });

    // 定时轮询保底
    let checks = 0;
    const timer = setInterval(function() {
        checks++;
        // 持续轮询，以便在答题状态改变时能捕获到
        scanGlobalVariables();
        if (checks > 600) { // 轮询 10 分钟后停止
            clearInterval(timer);
        }
    }, 1000);

    // XHR 拦截保底（部分页面通过 AJAX 加载题目）
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) { 
        this._url = url; 
        return originalOpen.apply(this, arguments); 
    };
    XMLHttpRequest.prototype.send = function() {
        this.addEventListener('load', function() {
            if (this.responseText && (this.responseText.includes('prepos') || this.responseText.includes('answers'))) {
                try {
                    const data = JSON.parse(this.responseText);
                    const computedSGF = constructInitialSGF(data);
                    window.postMessage({ 
                        type: "101_GAME_DATA", 
                        source: "XHR", 
                        data: data, 
                        extra: { initialSGF: computedSGF } 
                    }, "*");
                } catch(e) {}
            }
        });
        return originalSend.apply(this, arguments);
    };

})();