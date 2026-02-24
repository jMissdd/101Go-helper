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

    // 【已删除】detectResultFromStatusBlock 函数，因为它会读取 document.body.innerText 导致插件自己读自己的 UI 文本而产生误判。

    // ==========================================
    // 瞬间捕获：利用 Alpine.js 原生响应式机制
    // ==========================================
    let _alpineWatcherRegistered = false;
    let _lastWatcherTriggerTime = 0;
    let _isFirstEffectRun = true;

    function registerAlpineWatchers(store) {
        if (_alpineWatcherRegistered || !store) return;
        
        try {
            // 尝试使用 Alpine v3 的 effect 机制
            if (typeof Alpine.effect === 'function') {
                Alpine.effect(() => {
                    // 访问这些属性，Alpine 会自动收集依赖
                    const dr = store.duizhanResult;
                    const ptsLen = Array.isArray(store.simulatorDuizhanPts) ? store.simulatorDuizhanPts.length : 0;
                    const tr = store.taskinfo ? store.taskinfo.result : null;
                    
                    // 忽略 effect 注册时的第一次自动执行
                    if (_isFirstEffectRun) {
                        _isFirstEffectRun = false;
                        return;
                    }

                    // 【终极解锁方案】：只要 Alpine 监听到任何相关数据的变化，
                    // 说明用户必然在当前棋盘进行了交互（哪怕是瞬间被回滚的错误落子）。
                    // 此时无条件砸碎 PENDING 锁！
                    if (window._problemState === 'PENDING') {
                        console.log(`%c[WATCHER] 捕获到数据变化(dr=${dr}, ptsLen=${ptsLen})，无条件解除 PENDING 锁！`, 'color: #f59e0b; font-weight: bold;');
                        window._problemState = 'READY';
                    }

                    const now = Date.now();
                    // 防抖：避免同一瞬间触发太多次
                    if (now - _lastWatcherTriggerTime > 50) {
                        _lastWatcherTriggerTime = now;
                        console.log(`%c[WATCHER] 瞬间捕获数据变化! duizhanResult=${dr}, ptsLen=${ptsLen}, taskinfo.result=${tr}`, 'color: #10b981');
                        // 延迟 0ms 执行，让 Alpine 先完成它自己的内部状态更新
                        setTimeout(scanGlobalVariables, 0); 
                    }
                });
                _alpineWatcherRegistered = true;
                console.log("%c✅ Alpine.effect 监听器注册成功！", "color: green; font-weight: bold;");
            } else {
                console.log("⚠️ 当前 Alpine 版本不支持 effect，将依赖定时轮询。");
            }
        } catch (e) {
            console.log("❌ 注册 Alpine 监听器失败:", e);
        }
    }

    function readAnswerResultFromStore(val, problemId) {
        let fallbackZero = null;
        const tag = '[Q-' + (problemId || '?') + ']';

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
                        'simulatorDuizhanPts.length': Array.isArray(store.simulatorDuizhanPts) ? store.simulatorDuizhanPts.length : '(无数组)',
                        musthideFirstMoveDone: !!store.musthideFirstMoveDone,
                        'qqdata.myan.result': (store.qqdata && store.qqdata.myan) ? store.qqdata.myan.result : '(无myan)',
                    };
                    console.log(tag + ' Alpine store 快照:', dump);

                    // 【最高优先级：破壁人 taskinfo.result】
                    // 如果 taskinfo.result 已经明确是 1 或 2，直接采信，无视任何锁！
                    if (store.taskinfo && typeof store.taskinfo.result !== 'undefined') {
                        let r = check(store.taskinfo.result);
                        if (r === 1 || r === 2) {
                            console.log(tag + ' [破壁] 结果来源: taskinfo.result =', r);
                            window._problemState = 'READY'; // 强行解锁
                            return r;
                        }
                    }

                    // 【状态机锁】：切题后，等待 watcher 瞬间捕获解锁
                    if (window._problemState === 'PENDING') {
                        console.log(tag + ' 处于 PENDING 锁（等待作答信号），忽略当前结果值:', store.duizhanResult);
                        return 0; // 锁定中，强制返回未作答
                    }

                    // 【安全期】：状态机已解锁，可以安全读取 duizhanResult 了
                    if (typeof store.duizhanResult !== 'undefined') {
                        // 补充条件：出 pending 锁时，如果 musthideFirstMoveDone 明确为 false，强制判定为错
                        if (store.simulatorDuizhanPts.length === 0) {
                            console.log(tag + ' 强制判错: simulatorDuizhanPts.length==0');
                            return 2;
                        }

                        let r = check(store.duizhanResult);
                        if (r !== null) { 
                            console.log(tag + ' 结果来源: duizhanResult =', store.duizhanResult); 
                            return r; 
                        }
                    }
                    
                    // 最后保底 answerResult
                    if (typeof store.answerResult !== 'undefined') {
                        let r = check(store.answerResult);
                        if (r !== null) { console.log(tag + ' 结果来源: answerResult =', store.answerResult); return r; }
                    }
                }
            }
        } catch(e) { console.log('readAnswerResultFromStore 异常:', e.message); }

        // 【修改】：移除了对 val.myan.result 的读取，原因同上

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
                            
                            // 注册瞬间捕获监听器
                            registerAlpineWatchers(store);
                        }
                    }
                } catch(e) {}

                const isFirstLoad = (window._lastProblemId === undefined);
                const isNewProblem = (window._lastProblemId !== currentProblemId && !isFirstLoad);
                console.log(
                    '%c[SCAN] Q=' + currentProblemId +
                    ' | 上次Q=' + window._lastProblemId +
                    ' | isNewProblem=' + isNewProblem +
                    ' | isFirstLoad=' + isFirstLoad +
                    ' | 上次结果=' + window._lastSentAnswerResult,
                    'color: #2563eb'
                );

                let answerResult;
                if (isNewProblem || isFirstLoad) {
                    window._problemResultCache = {}; // 切题或刷新时清空缓存
                    window._problemState = 'PENDING'; // 【状态机】：切题后进入 PENDING 锁状态，必须看到首手动作才解锁
                    window._initialPtsLength = 0;
                    try {
                        if (typeof Alpine !== 'undefined') {
                            const store = Alpine.store('qipan');
                            if (store && Array.isArray(store.simulatorDuizhanPts)) {
                                window._initialPtsLength = store.simulatorDuizhanPts.length;
                            }
                        }
                    } catch (e) {}
                    // 【修改】：切题时重置为未作答；刷新首帧若已出现结果块则直接恢复结果
                    if (isFirstLoad) {
                        // 既然废弃了 UI 检块，这里直接重置为未作答
                        console.log('[SCAN] 新题/刷新 → 强制重置状态为未作答(0)，进入 PENDING 锁，初始步数=' + window._initialPtsLength);
                        answerResult = 0;
                    } else {
                        console.log('[SCAN] 新题/刷新 → 强制重置状态为未作答(0)，进入 PENDING 锁，初始步数=' + window._initialPtsLength);
                        answerResult = 0;
                    }
                } else {
                    answerResult = readAnswerResultFromStore(val, currentProblemId);
                }

                // 缓存答题结果：一旦检测到 1 或 2，就记住它，防止提示语消失后状态回退
                // 【新增逻辑】：只记录第一次的结果，后续无论怎么点都不覆盖
                if (!window._problemResultCache) window._problemResultCache = {};
                
                if (window._problemResultCache[currentProblemId]) {
                    // 如果这道题已经有结果了，强制锁定为第一次的结果
                    answerResult = window._problemResultCache[currentProblemId];
                } else if (answerResult === 1 || answerResult === 2) {
                    // 第一次检测到 1 或 2，存入缓存
                    window._problemResultCache[currentProblemId] = answerResult;
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