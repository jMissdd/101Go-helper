// 这是一个“内鬼”脚本，它运行在页面的真实环境中
// 可以直接访问 window 对象上的全局变量

(function() {
    console.log("101围棋助手: 启动网络拦截与框架探测模式...");

    // ==========================================
    // 1. 核武器：XHR (Ajax) 请求拦截
    // ==========================================
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function(method, url) {
        this._method = method;
        this._url = url;
        return originalOpen.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        this.addEventListener('load', function() {
            // 只有成功的请求才处理
            if (this.status >= 200 && this.status < 300) {
                 try {
                     // 尝试解析 JSON
                     if (this.responseText && (this.responseText.includes('sgf') || this.responseText.includes('(;'))) {
                         console.log(`【网络拦截】捕获到疑似题目数据! URL: ${this._url}`);
                         try {
                             const data = JSON.parse(this.responseText);
                             
                             // 尝试附加初始盘面
                             let initialSGF = data.sgf || window.initialSGF || "";
                             if (!initialSGF && window.currentExtraData && window.currentExtraData.sgf) {
                                 initialSGF = window.currentExtraData.sgf;
                             }
                             data._extractedInitialSGF = initialSGF;

                             window.postMessage({ type: "101_GAME_DATA", source: "XHR_INTERCEPT", data: data, url: this._url }, "*");
                         } catch(e) {
                             // 如果不是 JSON，可能是纯文本 SGF
                             console.log("非 JSON 格式，可能是纯文本 SGF");
                         }
                     }
                 } catch (e) {
                     console.error("解析响应失败:", e);
                 }
            }
        });
        return originalSend.apply(this, arguments);
    };

    // ==========================================
    // 2. 针对 Alpine.js 的探测 (日志里出现了 alpine.min.js)
    // ==========================================
    function checkAlpine() {
        if (window.Alpine) {
            console.log("发现 Alpine.js! 尝试获取组件数据...");
            const roots = document.querySelectorAll('[x-data]');
            roots.forEach((el, index) => {
                try {
                    const data = el._x_dataStack ? el._x_dataStack[0] : null;
                    if (data) {
                        let plainData = {};
                        try {
                             plainData = JSON.parse(JSON.stringify(data));
                        } catch(e) { plainData = data; }

                        // 检查特征字段
                        if (plainData.sgf || plainData.answers || (typeof plainData === 'string' && plainData.includes('(;'))) {
                             console.log(`%c【Bingo!】在 Alpine 组件 [${index}] 中找到题目数据!`, "color: green; font-weight: bold; font-size: 14px;");
                             
                             // 尝试从页面全局变量中寻找初始盘面 (做题模式下很有用)
                             let initialSGF = plainData.sgf || window.initialSGF || "";
                             if (!initialSGF && window.currentExtraData && window.currentExtraData.sgf) {
                                 initialSGF = window.currentExtraData.sgf;
                             }
                             
                             // 把找到的初始盘面附加到数据中
                             plainData._extractedInitialSGF = initialSGF;

                             // 广播出去
                             window.postMessage({ type: "101_GAME_DATA", source: "ALPINE_JS", data: plainData }, "*");
                        }
                    }
                } catch(e) {}
            });
        }
    }

    // 定时检查 Alpine，因为它可能初始化得比较晚
    setTimeout(checkAlpine, 1000);
    setTimeout(checkAlpine, 3000);

    // ==========================================
    // 3. 拦截 Fetch API (以防网站用 fetch 而不是 XHR)
    // ==========================================
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch(...args);
        
        const clone = response.clone();
        clone.text().then(text => {
             if (text.includes('sgf') || text.includes('(;')) {
                 console.log(`【Fetch拦截】捕获到疑似题目数据!`);
                 try {
                     const data = JSON.parse(text);
                     
                     // 尝试附加初始盘面
                     let initialSGF = data.sgf || window.initialSGF || "";
                     if (!initialSGF && window.currentExtraData && window.currentExtraData.sgf) {
                         initialSGF = window.currentExtraData.sgf;
                     }
                     data._extractedInitialSGF = initialSGF;

                     window.postMessage({ type: "101_GAME_DATA", source: "FETCH_INTERCEPT", data: data }, "*");
                 } catch(e) {}
             }
        }).catch(() => {});

        return response;
    };

})();

