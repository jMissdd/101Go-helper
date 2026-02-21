(function() {
    console.log("101围棋助手 v6.0 (专注对错识别版) 已注入...");

    // ==========================================
    // 文本识别答题结果
    // ==========================================
    function parseResultFromText(text) {
        if (!text) return null;
        const t = String(text);
        if (
            t.includes('阁下一定是高手') ||
            t.includes('一出手就不同凡响') ||
            t.includes('好厉害，我们交个朋友吧') ||
            t.includes('你真强') ||
            t.includes('请受我一拜') ||
            t.includes('回答正确')
        ) return 1;

        if (
            t.includes('相信你不是答错') ||
            t.includes('只是手滑了对吧') ||
            t.includes('没那么简单呢') ||
            t.includes('回答错误')
        ) return 2;

        return null;
    }

    function captureTransientResult(result, reason) {
        if (result !== 1 && result !== 2) return;
        window._transientAnswerResult = result;
        window._transientAnswerAt = Date.now();
        console.log('【瞬时捕获】' + reason + ':', result === 1 ? '正确' : '错误');
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
        const textEl = document.querySelector('.qipan-result .result-text');
        if (textEl) {
            const parsed = parseResultFromText(textEl.textContent || '');
            if (parsed !== null) return parsed;
        }
        return null;
    }

    // ==========================================
    // 扫描全局变量，提取题目数据和答题结果
    // ==========================================
    function scanGlobalVariables() {
        const candidates = ['qqdata', 'g_chess_data', 'pdata', 'chess_data'];

        for (let i = 0; i < candidates.length; i++) {
            const name = candidates[i];
            const val = window[name];

            if (val && (val.prepos || val.answers || val.sgf)) {
                console.log('%c【Bingo】发现全局变量: ' + name, 'color: green; font-weight: bold; font-size: 14px;');

                let answerResult = null;

                // 1. Alpine store
                try {
                    if (typeof Alpine !== 'undefined') {
                        const store = Alpine.store('qipan');
                        if (store) {
                            if (typeof store.duizhanResult !== 'undefined') {
                                const n = normalizeResult(store.duizhanResult);
                                if (n !== null) { answerResult = n; console.log('  Alpine store.duizhanResult:', answerResult); }
                            }
                            if (answerResult === null && store.taskinfo && typeof store.taskinfo.result !== 'undefined') {
                                const n = normalizeResult(store.taskinfo.result);
                                if (n !== null) { answerResult = n; console.log('  Alpine store.taskinfo.result:', answerResult); }
                            }
                            if (answerResult === null && typeof store.answerResult !== 'undefined') {
                                const n = normalizeResult(store.answerResult);
                                if (n !== null) { answerResult = n; console.log('  Alpine store.answerResult:', answerResult); }
                            }
                            if (answerResult === null && store.qqdata && store.qqdata.myan && typeof store.qqdata.myan.result !== 'undefined') {
                                const n = normalizeResult(store.qqdata.myan.result);
                                if (n !== null) { answerResult = n; console.log('  Alpine store.qqdata.myan.result:', answerResult); }
                            }
                        }
                    }
                } catch(e) {
                    console.log('  读取 Alpine store 失败:', e.message);
                }

                // 2. qqdata.myan 历史记录
                if (answerResult === null && val.myan && typeof val.myan.result !== 'undefined') {
                    answerResult = val.myan.result;
                    console.log('  qqdata.myan 历史结果:', answerResult);
                }

                // 3. 结果面板图标 + 瞬时缓存
                if (answerResult === null) {
                    try {
                        const panelResult = detectResultFromResultPanel();
                        if (panelResult !== null) {
                            answerResult = panelResult;
                            captureTransientResult(panelResult, '结果面板图标');
                        }
                        if (answerResult === null && window._transientAnswerResult && window._transientAnswerAt) {
                            if (Date.now() - window._transientAnswerAt < 15000) {
                                answerResult = window._transientAnswerResult;
                                console.log('  使用瞬时缓存:', answerResult);
                            }
                        }
                    } catch(e) {}
                }

                // 4. 最终默认  0（新题未作答）
                if (answerResult === null) answerResult = 0;

                // 5. 缓存结果，防止弹窗消失后回退
                const currentProblemId = val.publicid || val.id || 'unknown';
                if (!window._problemResultCache) window._problemResultCache = {};
                if (answerResult === 1 || answerResult === 2) {
                    window._problemResultCache[currentProblemId] = answerResult;
                } else if (window._problemResultCache[currentProblemId]) {
                    answerResult = window._problemResultCache[currentProblemId];
                }

                // 6. 只在状态变化时发送消息
                if (window._lastSentAnswerResult !== answerResult ||
                    window._lastProblemId !== currentProblemId ||
                    !window._hasSentData) {

                    const isNewResult = (
                        window._hasSentData &&
                        window._lastProblemId === currentProblemId &&
                        window._lastSentAnswerResult !== answerResult
                    );

                    window._lastSentAnswerResult = answerResult;
                    window._lastProblemId = currentProblemId;
                    window._hasSentData = true;

                    window.postMessage({
                        type: '101_GAME_DATA',
                        source: 'GLOBAL_' + name,
                        data: val,
                        answerResult: answerResult,
                        isNewResult: isNewResult
                    }, '*');
                }

                return true;
            }
        }
        return false;
    }

    // ==========================================
    // 执行策略：启动 + 延迟重试
    // ==========================================
    scanGlobalVariables();

    window.addEventListener('load', function() {
        setTimeout(scanGlobalVariables, 800);
        setTimeout(scanGlobalVariables, 2000);
    });

    // ==========================================
    // MutationObserver：实时捕获瞬时弹窗文本
    // ==========================================
    let observerScanTimer = null;
    const observer = new MutationObserver(function(mutations) {
        let found = false;
        for (let i = 0; i < mutations.length; i++) {
            const mutation = mutations[i];

            if (mutation.type === 'characterData') {
                const text = mutation.target ? (mutation.target.textContent || '') : '';
                const parsed = parseResultFromText(text);
                if (parsed !== null) {
                    captureTransientResult(parsed, 'Mutation文本更新');
                    found = true;
                    break;
                }
            }

            if (mutation.type === 'childList') {
                for (let j = 0; j < mutation.addedNodes.length; j++) {
                    const node = mutation.addedNodes[j];
                    if (node.nodeType === 1) {
                        const parsed = parseResultFromText(node.textContent || '');
                        if (parsed !== null) {
                            captureTransientResult(parsed, 'Mutation新增节点');
                            found = true;
                            break;
                        }
                    }
                }
                if (found) break;
            }

            if (mutation.type === 'attributes') {
                const panelResult = detectResultFromResultPanel();
                if (panelResult !== null) {
                    captureTransientResult(panelResult, '属性变更-面板');
                    found = true;
                    break;
                }
            }
        }

        if (found) {
            clearTimeout(observerScanTimer);
            observerScanTimer = setTimeout(scanGlobalVariables, 300);
        }
    });

    function startObserver() {
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
            attributeFilter: ['class', 'style']
        });
    }

    if (document.body) {
        startObserver();
    } else {
        document.addEventListener('DOMContentLoaded', startObserver);
    }

    // ==========================================
    // 定时轮询兜底（每秒一次）
    // ==========================================
    setInterval(scanGlobalVariables, 1000);

    // ==========================================
    // XHR 拦截器：捕获换题响应
    // ==========================================
    const _origOpen = XMLHttpRequest.prototype.open;
    const _origSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._interceptUrl = url;
        return _origOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function() {
        const self = this;
        this.addEventListener('load', function() {
            if (!self._interceptUrl) return;
            const url = self._interceptUrl;
            const isTarget = (
                url.includes('/getanquestion') ||
                url.includes('/getqdaynextquestion') ||
                url.includes('/getqquestion') ||
                url.includes('/gettopicdetail')
            );
            if (!isTarget) return;
            try {
                const resp = JSON.parse(self.responseText);
                const problem = (resp && resp.data) ? resp.data : null;
                if (problem && (problem.publicid || problem.id || problem.prepos || problem.answers)) {
                    console.log('【XHR拦截】新题数据，来自:', url);
                    window.postMessage({
                        type: '101_GAME_DATA',
                        source: 'XHR_INTERCEPT',
                        data: problem,
                        answerResult: 0,
                        isNewResult: false
                    }, '*');
                    window._lastProblemId = null;
                    window._hasSentData = false;
                    setTimeout(scanGlobalVariables, 600);
                    setTimeout(scanGlobalVariables, 1500);
                }
            } catch(e) {}
        });
        return _origSend.apply(this, arguments);
    };

})();