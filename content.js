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
            <span class="close-btn" title="收起">×</span>
        </div>
        <div id="weiqi-helper-content">
            <div id="helper-status" class="helper-info-block">
                <span class="status-tag tag-wait">等待题目数据...</span>
            </div>
            
            <button id="btn-show-data" class="helper-btn">� 显示原始数据</button>
            <button id="btn-export-sgf" class="helper-btn primary">💾 导出本题 SGF</button>
            
            <div id="data-display-area" style="display:none; margin-top:10px;">
                <textarea id="sgf-textarea" rows="5" style="width:100%; font-size:11px;"></textarea>
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

    return panel;
}

// 初始化面板
createPanel();


// ==========================================
// 3. 数据处理逻辑
// ==========================================
let currentProblemData = null;

// 监听来自 inject.js 的消息
window.addEventListener("message", function(event) {
    if (event.source != window) return;

    if (event.data.type && (event.data.type == "101_GAME_DATA")) {
        console.log("【助手捕捉】收到数据", event.data.data);
        currentProblemData = event.data.data;
        updateUI();
    }
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
    const textArea = document.getElementById('sgf-textarea');
    const exportBtn = document.getElementById('btn-export-sgf');
    
    if (currentProblemData) {
        // 1. 状态更新
        let statusHtml = `<span class="status-tag tag-success">数据捕获成功</span>`;
        
        // 2. 尝试解析第一手推荐
        if (currentProblemData.answers && currentProblemData.answers.ok && currentProblemData.answers.ok.length > 0) {
             const bestVariant = currentProblemData.answers.ok[0];
             if (bestVariant.pts && bestVariant.pts.length > 0) {
                 const firstMove = bestVariant.pts[0].p;
                 const humanPos = coordinateToHuman(firstMove);
                 statusHtml += `<div style="margin-top:8px; font-weight:bold; color:#059669;">✅ 推荐首手: ${humanPos} (${firstMove})</div>`;
             }
        } else {
             // 如果没有答案，说明是做题模式
             statusHtml += `<div style="margin-top:8px; font-weight:bold; color:#d97706;">⚠️ 当前为做题模式，服务器未下发答案。仅可导出初始盘面。</div>`;
        }
        statusDiv.innerHTML = statusHtml;

        // 3. 生成 SGF 内容供导出/查看
        const finalSGF = generateSGF(currentProblemData);
        textArea.value = finalSGF;
        
        // 4. 绑定导出按钮
        // 移除旧监听器最好的办法是克隆节点，或者简单地覆盖 onclick
        exportBtn.onclick = () => {
             const blob = new Blob([finalSGF], {type: "application/x-go-sgf"});
             const url = URL.createObjectURL(blob);
             const a = document.createElement('a');
             a.href = url;
             a.download = `101_Problem_${new Date().toISOString().slice(0,10)}.sgf`;
             document.body.appendChild(a);
             a.click();
             document.body.removeChild(a);
             URL.revokeObjectURL(url);
        };
    }
}