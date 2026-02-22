(function() {
    console.log("101围棋助手 v6.0 已注入...");

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

    function readAnswerResultFromStore(val, problemId) {
        let fallbackZero = null;
        const tag = '[Q-' + (problemId || '?') + ']';

        // 切题后 2.5 秒内 duizhanResult 还是上一题的脏值，跳过它
        const skipDuizhan = window._newProblemAt && (Date.now() - window._newProblemAt < 2500);
        if (skipDuizhan) console.log(tag + ' [Grace期] 跳过 duizhanResult，剩余', Math.round(2500 - (Date.now() - window._newProblemAt)) + 'ms');

        const check = (raw) => {
            const n = normalizeResult(raw);
            if (n === 1 || n === 2) return n;
            if (n === 0) fallbackZero = 0;
            return null;
        };

        try {
            if (typeof Alpine !== 'undefined') {
                const store = Alpine.store('qipan');
                if (store) {
                    const dump = {
                        duizhanResult:    store.duizhanResult,
                        'taskinfo.result': store.taskinfo ? store.taskinfo.result : '(无taskinfo)',
                        answerResult:     store.answerResult,
                        'qqdata.myan.result': (store.qqdata && store.qqdata.myan) ? store.qqdata.myan.result : '(无myan)',
                    };
                    console.log(tag + ' Alpine store 快照:', dump);

                    let r;
                    if (!skipDuizhan && typeof store.duizhanResult !== 'undefined') {
                        r = check(store.duizhanResult);
                        if (r !== null) { console.log(tag + ' 结果来源: duizhanResult =', store.duizhanResult); return r; }
                    }
                    if (store.taskinfo && typeof store.taskinfo.result !== 'undefined') {
                        r = check(store.taskinfo.result);
                        if (r !== null) { console.log(tag + ' 结果来源: taskinfo.result =', store.taskinfo.result); return r; }
                    }
                    if (typeof store.answerResult !== 'undefined') {
                        r = check(store.answerResult);
                        if (r !== null) { console.log(tag + ' 结果来源: answerResult =', store.answerResult); return r; }
                    }
                    if (store.qqdata && store.qqdata.myan && typeof store.qqdata.myan.result !== 'undefined') {
                        r = check(store.qqdata.myan.result);
                        if (r !== null) { console.log(tag + ' 结果来源: store.qqdata.myan.result =', store.qqdata.myan.result); return r; }
                    }
                }
            }
        } catch(e) { console.log('readAnswerResultFromStore 异常:', e.message); }

        if (val && val.myan && typeof val.myan.result !== 'undefined') {
            const r = check(val.myan.result);
            if (r !== null) { console.log(tag + ' 结果来源: val.myan.result =', val.myan.result); return r; }
        }

        console.log(tag + ' 所有来源均无明确结果，fallbackZero =', fallbackZero);
        return fallbackZero;
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
                // 尝试从 Alpine store 获取最新的题目 ID 和数据
                let currentProblemId = val.publicid || val.id || 'unknown';
                try {
                    if (typeof Alpine !== 'undefined') {
                        const store = Alpine.store('qipan');
                        if (store && store.qqdata) {
                            val = store.qqdata;
                            currentProblemId = val.publicid || val.id || currentProblemId;
                        }
                    }
                } catch(e) {}

                const isNewProblem = (window._lastProblemId !== currentProblemId && window._lastProblemId !== undefined);
                console.log(
                    '%c[SCAN] Q=' + currentProblemId +
                    ' | 上次Q=' + window._lastProblemId +
                    ' | isNewProblem=' + isNewProblem +
                    ' | 上次结果=' + window._lastSentAnswerResult,
                    'color: #2563eb'
                );

                let answerResult;
                if (isNewProblem) {
                    window._newProblemAt = Date.now(); // 记录切题时刻，用于 Grace 期
                    const myanResult = (val.myan && typeof val.myan.result !== 'undefined') ? val.myan.result : '(无myan)';
                    console.log('[SCAN] 新题 → 只看 val.myan.result =', myanResult);
                    answerResult = (val.myan && typeof val.myan.result !== 'undefined') ? normalizeResult(val.myan.result) : null;
                    if (answerResult === null) answerResult = 0;
                    console.log('[SCAN] 新题最终 answerResult =', answerResult);
                } else {
                    answerResult = readAnswerResultFromStore(val, currentProblemId);
                    if (answerResult === null) {
                        const panelResult = detectResultFromResultPanel();
                        if (panelResult !== null) {
                            console.log('[SCAN] 面板图标补充结果:', panelResult);
                            answerResult = panelResult;
                        }
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
                        answerResult: answerResult,
                        isNewResult: isNewResult
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
                    window.postMessage({
                        type: "101_GAME_DATA",
                        source: "XHR",
                        data: data,
                        answerResult: null,
                        isNewResult: false
                    }, "*");
                } catch(e) {}
            }
        });
        return originalSend.apply(this, arguments);
    };

})();