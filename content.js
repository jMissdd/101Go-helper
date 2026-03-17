console.log("101围棋助手: Content Script 已加载");

// 1. 注入 inject.js
var s = document.createElement('script');
s.src = chrome.runtime.getURL('inject.js');
s.onload = function() { this.remove(); };
(document.head || document.documentElement).appendChild(s);

const MODE_KEY = 'weiqi_helper_mode';
const LIMIT_KEY = 'weiqi_helper_time_limit_sec';
const PANEL_UI_STATE_KEY = 'weiqi_helper_panel_ui_state_v1';
const PANEL_SECTION_STATE_KEY = 'weiqi_helper_panel_sections_v1';
const PANEL_PRESETS = {
    small: { width: 300, height: 340 },
    medium: { width: 360, height: 560 },
    large: { width: 440, height: 720 },
};

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
let currentErrorFilter = 'needReview';
let errorBookRenderToken = 0;

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

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

function getDefaultPanelState() {
    const preset = PANEL_PRESETS.medium;
    return {
        width: preset.width,
        height: preset.height,
        top: 60,
        left: Math.max(12, window.innerWidth - preset.width - 20),
        minimized: false,
        preset: 'medium',
    };
}

function loadPanelState() {
    const fallback = getDefaultPanelState();
    try {
        const raw = localStorage.getItem(PANEL_UI_STATE_KEY);
        if (!raw) return fallback;
        return { ...fallback, ...JSON.parse(raw) };
    } catch (e) {
        return fallback;
    }
}

function savePanelState(state) {
    try {
        localStorage.setItem(PANEL_UI_STATE_KEY, JSON.stringify(state));
    } catch (e) {}
}

function normalizePanelState(state) {
    const fallback = getDefaultPanelState();
    const width = clamp(Number(state.width) || fallback.width, 280, Math.max(280, window.innerWidth - 24));
    const height = clamp(Number(state.height) || fallback.height, 240, Math.max(240, window.innerHeight - 24));
    const minimized = !!state.minimized;
    const visibleHeight = minimized ? 58 : height;
    const left = clamp(Number(state.left) || fallback.left, 8, Math.max(8, window.innerWidth - width - 8));
    const top = clamp(Number(state.top) || fallback.top, 8, Math.max(8, window.innerHeight - visibleHeight - 8));
    const preset = PANEL_PRESETS[state.preset] ? state.preset : '';
    return { width, height, left, top, minimized, preset };
}

function applyPanelState(panel, nextState) {
    const state = normalizePanelState(nextState);
    panel.style.width = `${state.width}px`;
    panel.style.height = state.minimized ? 'auto' : `${state.height}px`;
    panel.style.left = `${state.left}px`;
    panel.style.top = `${state.top}px`;
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';
    panel.classList.toggle('is-minimized', state.minimized);
    panel.dataset.preset = state.preset || '';

    panel.querySelectorAll('.toolbar-preset-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.preset === state.preset);
    });

    const minimizeBtn = panel.querySelector('#btn-minimize-panel');
    if (minimizeBtn) {
        minimizeBtn.textContent = state.minimized ? '▣' : '－';
        minimizeBtn.title = state.minimized ? '展开面板' : '最小化面板';
    }

    savePanelState(state);
    return state;
}

function getPanelStateFromDom(panel) {
    const rect = panel.getBoundingClientRect();
    const saved = loadPanelState();
    return normalizePanelState({
        width: Math.round(rect.width),
        height: panel.classList.contains('is-minimized') ? saved.height : Math.round(rect.height),
        left: Math.round(rect.left),
        top: Math.round(rect.top),
        minimized: panel.classList.contains('is-minimized'),
        preset: panel.dataset.preset || '',
    });
}

function loadSectionState() {
    const fallback = { settings: true, error: false, search: false };
    try {
        const raw = localStorage.getItem(PANEL_SECTION_STATE_KEY);
        if (!raw) return fallback;
        return { ...fallback, ...JSON.parse(raw) };
    } catch (e) {
        return fallback;
    }
}

function saveSectionState(state) {
    try {
        localStorage.setItem(PANEL_SECTION_STATE_KEY, JSON.stringify(state));
    } catch (e) {}
}

function applySectionState(panel, nextState) {
    const state = { settings: true, error: false, search: false, ...nextState };
    ['settings', 'error', 'search'].forEach(key => {
        const section = panel.querySelector(`[data-section="${key}"]`);
        if (!section) return;
        section.classList.toggle('is-collapsed', !state[key]);
    });

    const mappings = [
        ['settings', '#btn-quick-settings', '#btn-toggle-settings-section'],
        ['error', '#btn-quick-errors', '#btn-show-errors'],
        ['search', '#btn-quick-search', '#btn-toggle-search-section'],
    ];

    mappings.forEach(([key, quickSelector, sectionSelector]) => {
        const quickBtn = panel.querySelector(quickSelector);
        const sectionBtn = panel.querySelector(sectionSelector);
        [quickBtn, sectionBtn].forEach(btn => {
            if (!btn) return;
            btn.classList.toggle('active', !!state[key]);
            btn.setAttribute('aria-expanded', state[key] ? 'true' : 'false');
        });
    });

    saveSectionState(state);
    return state;
}

// ==========================================
// 2. 创建 UI 面板 (可拖动)
// ==========================================
function createPanel() {
    const existingPanel = document.getElementById('weiqi-helper-panel');
    if (existingPanel) return existingPanel;

    const panelState = loadPanelState();
    const sectionState = loadSectionState();
    const panel = document.createElement('div');
    panel.id = 'weiqi-helper-panel';
    panel.innerHTML = `
        <div id="weiqi-helper-header">
            <div class="panel-title-group">
                <span class="panel-title">101围棋助手</span>
                <span id="header-mode-badge" class="panel-mode-badge">浏览模式</span>
            </div>
            <div class="panel-toolbar">
                <button class="toolbar-preset-btn" type="button" data-preset="small" title="紧凑尺寸">小</button>
                <button class="toolbar-preset-btn" type="button" data-preset="medium" title="标准尺寸">中</button>
                <button class="toolbar-preset-btn" type="button" data-preset="large" title="扩展尺寸">大</button>
                <button id="btn-minimize-panel" class="toolbar-icon-btn" type="button" title="最小化面板">－</button>
                <button class="close-btn toolbar-icon-btn" type="button" title="关闭面板">×</button>
            </div>
        </div>
        <div id="weiqi-helper-content">
            <div id="helper-status" class="helper-info-block status-card">
                <span class="status-tag tag-wait">等待题目数据...</span>
            </div>

            <div class="panel-quick-actions">
                <button id="btn-quick-settings" class="quick-action-btn" type="button">设置</button>
                <button id="btn-quick-errors" class="quick-action-btn quick-action-warn" type="button">
                    <span>错题本</span>
                    <span id="quick-errors-badge" class="quick-action-badge">0</span>
                </button>
                <button id="btn-quick-search" class="quick-action-btn" type="button">搜索</button>
            </div>

            <section id="helper-mode-section" class="panel-section-card" data-section="settings">
                <button id="btn-toggle-settings-section" class="panel-section-header" type="button">
                    <span>模式与限时</span>
                    <span id="settings-section-hint" class="panel-section-hint">当前配置</span>
                </button>
                <div class="panel-section-body">
                    <div id="helper-mode-controls" class="panel-settings-grid">
                        <div class="panel-setting-row">
                            <span class="panel-setting-label">模式</span>
                            <select id="helper-mode" class="panel-input panel-select">
                                <option value="browse">浏览模式</option>
                                <option value="practice">做题模式</option>
                                <option value="book">棋书练习</option>
                            </select>
                        </div>
                        <div class="panel-setting-row">
                            <span class="panel-setting-label">限时(秒)</span>
                            <input id="helper-time-limit" type="number" min="5" step="5" class="panel-input panel-input-number" />
                        </div>
                    </div>
                </div>
            </section>

            <div id="practice-stats" class="helper-info-block practice-stats-card" style="display:none; margin-top:8px;"></div>

            <section id="error-book-section" class="panel-section-card" data-section="error">
                <button id="btn-show-errors" class="panel-section-header panel-section-header-warn" type="button">
                    <span>错题本重刷</span>
                    <span id="error-section-hint" class="panel-section-hint">待复习 0</span>
                </button>
                <div class="panel-section-body">
                    <div id="error-book-area" class="error-book-area">
                        <div class="error-book-header">
                            <div>
                                <div class="error-book-title">错题本</div>
                                <div class="error-book-subtitle">仅做题模式下，错题重刷做对后会自动移出待复习列表</div>
                            </div>
                            <button id="btn-clear-errors" class="helper-btn error-clear-btn">清空</button>
                        </div>

                        <div id="error-book-summary" class="error-book-summary"></div>

                        <div class="error-book-toolbar">
                            <button id="btn-error-filter-review" class="helper-btn error-filter-btn active">待复习</button>
                            <button id="btn-error-filter-all" class="helper-btn error-filter-btn">全部</button>
                            <button id="btn-error-filter-resolved" class="helper-btn error-filter-btn">已刷回</button>
                        </div>

                        <ul id="error-list" class="error-book-list">
                            <li class="error-book-empty">加载中...</li>
                        </ul>
                    </div>
                </div>
            </section>

            <div id="book-practice-area" class="panel-feature-card book-feature-card" style="display:none;">
                <div class="feature-card-title">📘 棋书练习</div>
                <div id="book-info" class="feature-card-meta"></div>
                <div id="book-progress-bar" class="book-progress-wrap">
                    <div class="book-progress-track">
                        <div id="book-progress-fill" style="background:#8b5cf6; height:100%; width:0%; transition:width 0.3s;"></div>
                    </div>
                    <div id="book-progress-text" class="feature-card-meta feature-card-meta-tight"></div>
                </div>
                <div id="book-stats" class="feature-card-stats"></div>
                <div class="feature-card-actions">
                    <button id="btn-book-prev" class="helper-btn book-nav-btn feature-btn-secondary">⬅ 上一题</button>
                    <button id="btn-book-next" class="helper-btn book-nav-btn feature-btn-primary">下一题 ➡</button>
                </div>
                <div class="feature-card-actions feature-card-actions-tight">
                    <button id="btn-book-wrong-only" class="helper-btn book-nav-btn feature-btn-secondary">🔴 仅错题</button>
                    <button id="btn-book-reset" class="helper-btn book-nav-btn feature-btn-danger">🔄 重置本章</button>
                </div>
            </div>

            <section id="book-search-section" class="panel-section-card" data-section="search">
                <button id="btn-toggle-search-section" class="panel-section-header" type="button">
                    <span>棋书搜索</span>
                    <span class="panel-section-hint">367 本可搜</span>
                </button>
                <div class="panel-section-body">
                    <div id="book-search-area" class="search-section-body">
                        <div class="search-input-row">
                            <input id="book-search-input" type="text" placeholder="书名 / 作者 / 难度" class="panel-input search-input" />
                            <button id="btn-book-search" class="helper-btn search-btn">搜索</button>
                        </div>
                        <div id="book-search-status" class="search-status" style="display:none;"></div>
                        <ul id="book-search-results" class="search-results-list">
                            <li class="search-empty">输入关键词搜索棋书...</li>
                        </ul>
                    </div>
                </div>
            </section>
        </div>
        <div id="weiqi-helper-resizer" title="拖拽调整尺寸"></div>
    `;
    document.body.appendChild(panel);
    applyPanelState(panel, panelState);
    applySectionState(panel, sectionState);

    const header = panel.querySelector('#weiqi-helper-header');
    const resizer = panel.querySelector('#weiqi-helper-resizer');
    const closeBtn = panel.querySelector('.close-btn');
    const minimizeBtn = panel.querySelector('#btn-minimize-panel');
    let isDragging = false;
    let isResizing = false;
    let offsetX, offsetY;
    let startWidth, startHeight, startX, startY;

    function persistCurrentPanelState(patch = {}) {
        const nextState = { ...getPanelStateFromDom(panel), ...patch };
        return applyPanelState(panel, nextState);
    }

    function toggleSection(key) {
        const current = loadSectionState();
        current[key] = !current[key];
        applySectionState(panel, current);
    }

    function updateModeDecorations() {
        const modeLabels = { browse: '浏览模式', practice: '做题模式', book: '棋书练习' };
        const badge = panel.querySelector('#header-mode-badge');
        if (badge) badge.textContent = modeLabels[helperMode] || helperMode;
        const settingsHint = panel.querySelector('#settings-section-hint');
        if (settingsHint) settingsHint.textContent = `${modeLabels[helperMode] || helperMode} · ${practiceTimeLimitSec}s`;
    }

    panel.querySelectorAll('.toolbar-preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = PANEL_PRESETS[btn.dataset.preset];
            if (!preset) return;
            const current = getPanelStateFromDom(panel);
            persistCurrentPanelState({
                width: preset.width,
                height: preset.height,
                minimized: false,
                preset: btn.dataset.preset,
                left: clamp(current.left, 8, Math.max(8, window.innerWidth - preset.width - 8)),
                top: clamp(current.top, 8, Math.max(8, window.innerHeight - preset.height - 8)),
            });
        });
    });

    minimizeBtn.addEventListener('click', () => {
        const current = getPanelStateFromDom(panel);
        persistCurrentPanelState({ minimized: !current.minimized });
    });

    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('.panel-toolbar')) return;
        isDragging = true;
        offsetX = e.clientX - panel.getBoundingClientRect().left;
        offsetY = e.clientY - panel.getBoundingClientRect().top;
        panel.style.transition = 'none';
    });

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        isResizing = true;
        const rect = panel.getBoundingClientRect();
        startWidth = rect.width;
        startHeight = rect.height;
        startX = e.clientX;
        startY = e.clientY;
        panel.style.transition = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            const rect = panel.getBoundingClientRect();
            const newX = clamp(e.clientX - offsetX, 8, Math.max(8, window.innerWidth - rect.width - 8));
            const newY = clamp(e.clientY - offsetY, 8, Math.max(8, window.innerHeight - rect.height - 8));
            panel.style.left = `${newX}px`;
            panel.style.top = `${newY}px`;
            panel.style.right = 'auto';
            panel.style.bottom = 'auto';
        } else if (isResizing) {
            const current = getPanelStateFromDom(panel);
            const nextWidth = clamp(startWidth + (e.clientX - startX), 280, Math.max(280, window.innerWidth - current.left - 8));
            const nextHeight = clamp(startHeight + (e.clientY - startY), 240, Math.max(240, window.innerHeight - current.top - 8));
            panel.style.width = `${nextWidth}px`;
            panel.style.height = `${nextHeight}px`;
            panel.dataset.preset = '';
            panel.querySelectorAll('.toolbar-preset-btn').forEach(btn => btn.classList.remove('active'));
        }
    });

    document.addEventListener('mouseup', () => {
        if (isDragging || isResizing) {
            persistCurrentPanelState();
        }
        isDragging = false;
        isResizing = false;
        panel.style.transition = '';
    });

    window.addEventListener('resize', () => {
        applyPanelState(panel, getPanelStateFromDom(panel));
    });

    closeBtn.addEventListener('click', () => {
        panel.style.display = 'none';
    });

    panel.querySelector('#btn-quick-settings').addEventListener('click', () => toggleSection('settings'));
    panel.querySelector('#btn-quick-errors').addEventListener('click', () => {
        toggleSection('error');
        if (loadSectionState().error) renderErrorBook(currentErrorFilter);
    });
    panel.querySelector('#btn-quick-search').addEventListener('click', () => toggleSection('search'));
    panel.querySelector('#btn-toggle-settings-section').addEventListener('click', () => toggleSection('settings'));
    panel.querySelector('#btn-show-errors').addEventListener('click', () => {
        toggleSection('error');
        if (loadSectionState().error) renderErrorBook(currentErrorFilter);
    });
    panel.querySelector('#btn-toggle-search-section').addEventListener('click', () => toggleSection('search'));

    panel.querySelector('#btn-clear-errors').addEventListener('click', () => {
        if (confirm('确定要清空所有错题记录吗？')) {
            clearErrorBook().then(() => renderErrorBook(currentErrorFilter));
        }
    });

    const errorFilterReviewBtn = panel.querySelector('#btn-error-filter-review');
    const errorFilterAllBtn = panel.querySelector('#btn-error-filter-all');
    const errorFilterResolvedBtn = panel.querySelector('#btn-error-filter-resolved');

    function setErrorFilter(filter) {
        currentErrorFilter = filter;
        [errorFilterReviewBtn, errorFilterAllBtn, errorFilterResolvedBtn].forEach(btn => {
            btn.classList.remove('active');
        });
        if (filter === 'needReview') errorFilterReviewBtn.classList.add('active');
        if (filter === 'all') errorFilterAllBtn.classList.add('active');
        if (filter === 'resolved') errorFilterResolvedBtn.classList.add('active');
        renderErrorBook(filter);
    }

    errorFilterReviewBtn.addEventListener('click', () => setErrorFilter('needReview'));
    errorFilterAllBtn.addEventListener('click', () => setErrorFilter('all'));
    errorFilterResolvedBtn.addEventListener('click', () => setErrorFilter('resolved'));

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
    updateModeDecorations();

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
        updateModeDecorations();
        // 切换模式时自动调整分区展开状态（只在用户主动切换时触发一次）
        {
            const sects = loadSectionState();
            if (helperMode === 'book') {
                // 棋书模式：展开搜索（找书），收起错题本（减少拥挤）
                applySectionState(panel, { ...sects, search: true, error: false });
            } else if (helperMode === 'practice') {
                // 做题模式：收起搜索（做题时用不到），保留其他
                applySectionState(panel, { ...sects, search: false });
            }
            // browse 模式不自动调整，保持用户上一次的状态
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
        updateModeDecorations();
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
const TRUSTED_101_HOSTS = new Set([
    'www.101weiqi.com',
    '101weiqi.com',
    'www.101weiqi.cn',
    '101weiqi.cn',
]);

// 根据当前域名返回正确的 101 基础 URL（同时兼容 .cn 和 .com）
function get101BaseUrl() {
    const host = window.location.hostname;
    return host.endsWith('.com') ? 'https://www.101weiqi.com' : 'https://www.101weiqi.cn';
}

function getDifficultyRank(levelname) {
    if (!levelname) return 9999;
    const text = String(levelname).toUpperCase().trim();

    const kMatch = text.match(/^(\d+)\s*K\+?$/);
    if (kMatch) return 1000 + parseInt(kMatch[1], 10);

    const dMatch = text.match(/^(\d+)\s*D\+?$/);
    if (dMatch) return 500 - parseInt(dMatch[1], 10);

    return 9999;
}

function groupErrorsByDifficulty(errors) {
    const groups = {};
    errors.forEach((item) => {
        const key = item.levelname || '未标注难度';
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
    });

    return Object.entries(groups)
        .sort((a, b) => getDifficultyRank(a[0]) - getDifficultyRank(b[0]))
        .map(([level, items]) => ({
            level,
            items: items.sort((x, y) => (y.timestamp || 0) - (x.timestamp || 0)),
        }));
}

function filterErrorBookRecords(records, filter = 'needReview') {
    const allRecords = Array.isArray(records) ? records : [];
    if (filter === 'all') return allRecords;
    if (filter === 'resolved') return allRecords.filter(item => item.needReview === false);
    if (filter === 'needReview') return allRecords.filter(item => item.needReview !== false);
    return allRecords;
}

function getTrusted101Url(url) {
    try {
        const parsed = new URL(url, window.location.href);
        if (parsed.protocol !== 'https:') return null;
        if (!TRUSTED_101_HOSTS.has(parsed.hostname)) return null;
        return parsed.toString();
    } catch (e) {
        return null;
    }
}

function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (typeof text !== 'undefined') element.textContent = String(text);
    return element;
}

function createErrorBookEmptyItem(text) {
    const li = createElement('li', 'error-book-empty', text);
    return li;
}

function renderErrorBookSummary(summaryEl, allErrors) {
    if (!summaryEl) return;

    const reviewing = allErrors.filter(item => item.needReview !== false).length;
    const resolved = allErrors.filter(item => item.needReview === false).length;
    const cards = [
        { label: '待复习', value: reviewing },
        { label: '错题总数', value: allErrors.length },
        { label: '已刷回', value: resolved },
    ];

    summaryEl.replaceChildren(...cards.map(card => {
        const wrapper = createElement('div', 'error-book-summary-card');
        wrapper.append(
            createElement('div', 'error-book-summary-number', card.value),
            createElement('div', 'error-book-summary-label', card.label)
        );
        return wrapper;
    }));

    const quickBadge = document.getElementById('quick-errors-badge');
    if (quickBadge) quickBadge.textContent = String(reviewing);
    const errorHint = document.getElementById('error-section-hint');
    if (errorHint) errorHint.textContent = `待复习 ${reviewing}`;
}

function createErrorBookCard(err) {
    const safeUrl = getTrusted101Url(err.url);
    const dateText = new Date(err.timestamp).toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
    const statusText = err.needReview === false ? '已刷回' : '待复习';
    const statusClass = err.needReview === false ? 'resolved' : 'reviewing';

    const card = createElement('div', 'error-card');
    const main = createElement('div', 'error-card-main');
    const titleRow = createElement('div', 'error-card-title-row');
    const titleLink = createElement('a', 'error-card-title', `Q-${err.qid}`);
    const badge = createElement('span', `error-card-badge ${statusClass}`, statusText);
    const meta = createElement('div', 'error-card-meta');
    const stats = createElement('div', 'error-card-stats');
    const actions = createElement('div', 'error-card-actions');
    const reviewBtn = createElement('button', 'helper-btn error-review-btn', '去重刷');

    if (safeUrl) {
        titleLink.href = safeUrl;
        titleLink.target = '_blank';
        titleLink.rel = 'noopener noreferrer';
        reviewBtn.addEventListener('click', () => startErrorReview(err.qid, safeUrl));
    } else {
        titleLink.href = '#';
        titleLink.addEventListener('click', (event) => event.preventDefault());
        titleLink.title = '链接无效';
        reviewBtn.disabled = true;
        reviewBtn.title = '错题链接无效，无法跳转';
    }

    meta.append(
        createElement('span', '', err.levelname || '未知难度'),
        createElement('span', '', err.qtypename || '未知题型')
    );

    stats.append(
        createElement('span', 'ok', `对 ${err.correctCount || 0}`),
        createElement('span', 'bad', `错 ${err.errorCount || 0}`),
        createElement('span', 'time', dateText)
    );

    titleRow.append(titleLink, badge);
    main.append(titleRow, meta, stats);
    actions.appendChild(reviewBtn);
    card.append(main, actions);
    return card;
}

function createErrorBookGroup(group) {
    const li = createElement('li', 'error-group');
    const details = createElement('details', 'error-group-details');
    details.open = true;

    const summary = createElement('summary', 'error-group-header');
    summary.append(
        createElement('span', 'error-group-title', group.level),
        createElement('span', 'error-group-count', `${group.items.length} 题`)
    );

    const list = createElement('div', 'error-group-list');
    group.items.forEach(err => {
        list.appendChild(createErrorBookCard(err));
    });

    details.append(summary, list);
    li.appendChild(details);
    return li;
}

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

async function saveProblemHistory(problemData, isCorrect = false, options = {}) {
    if (!problemData || !problemData.publicid) return;

    const mode = options.mode || helperMode || 'browse';
    const qid = problemData.publicid;

    try {
        const existing = await getProblemHistory(qid);

        const now = Date.now();
        const record = existing || {
            qid: qid,
            title: problemData.title || '',
            desc: problemData.desc || '',
            levelname: problemData.levelname || '',
            qtypename: problemData.qtypename || '',
            errorCount: 0,
            correctCount: 0,
            timestamp: now,
            url: window.location.href,
            needReview: false,
            lastResult: null,
            lastMode: mode,
            lastReviewAt: null,
        };

        record.title = problemData.title || record.title || '';
        record.desc = problemData.desc || record.desc || '';
        record.levelname = problemData.levelname || record.levelname || '';
        record.qtypename = problemData.qtypename || record.qtypename || '';
        record.url = window.location.href;
        record.timestamp = now;
        record.lastMode = mode;

        if (isCorrect) {
            record.correctCount = (record.correctCount || 0) + 1;
            record.lastResult = 'correct';

            if (mode === 'practice' && (record.errorCount || 0) > 0) {
                record.needReview = false;
                record.lastReviewAt = now;
            }
        } else {
            record.errorCount = (record.errorCount || 0) + 1;
            record.lastResult = 'wrong';
            record.needReview = true;
            record.lastReviewAt = now;
        }

        const db = await initDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            const store = tx.objectStore(STORE_NAME);
            const request = store.put(record);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
            tx.onerror = () => reject(tx.error);
            tx.onabort = () => reject(tx.error || new Error('IndexedDB transaction aborted'));
        });
        console.log(`【历史记录】更新 Q-${qid}，对:${record.correctCount || 0} 错:${record.errorCount || 0} 待复习:${record.needReview !== false}`);
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

function startErrorReview(qid, url) {
    const safeUrl = getTrusted101Url(url);
    if (!safeUrl) {
        console.warn('[101围棋助手] 拒绝跳转到不受信任的地址:', url);
        return;
    }

    helperMode = 'practice';
    localStorage.setItem(MODE_KEY, 'practice');
    const modeSelect = document.getElementById('helper-mode');
    if (modeSelect) modeSelect.value = 'practice';
    console.log(`【错题重刷】开始重刷 Q-${qid}`);
    window.location.href = safeUrl;
}

async function renderErrorBook(filter = 'needReview') {
    const listEl = document.getElementById('error-list');
    const summaryEl = document.getElementById('error-book-summary');
    if (!listEl) return;

    const renderToken = ++errorBookRenderToken;
    listEl.replaceChildren(createErrorBookEmptyItem('加载中...'));

    const allErrors = await getErrorBook();
    if (renderToken !== errorBookRenderToken) return;

    const errors = filterErrorBookRecords(allErrors, filter);
    const grouped = groupErrorsByDifficulty(errors);

    renderErrorBookSummary(summaryEl, allErrors);

    if (errors.length === 0) {
        if (renderToken !== errorBookRenderToken) return;
        listEl.replaceChildren(createErrorBookEmptyItem('当前筛选下没有题目，继续保持。'));
        return;
    }

    if (renderToken !== errorBookRenderToken) return;
    listEl.replaceChildren(...grouped.map(group => createErrorBookGroup(group)));
}


// ==========================================
// 2.7 棋书搜索逻辑
// ==========================================
const BOOK_CACHE_KEY = 'weiqi_helper_book_cache';
const BOOK_CACHE_TTL = 24 * 60 * 60 * 1000; // 24小时

// ==========================================
// 2.8 棋书练习模式
// ==========================================
const BOOK_PROGRESS_PREFIX = 'book_progress:';

// 棋书上下文（当前页面是否在棋书题目页）
let bookContext = null;
// 当前章节完整题序列（跨页合并后）
let bookChapterQs = [];
// 当前章节进度对象
let bookProgress = null;
// 错题筛选开关
let bookWrongOnly = false;

/**
 * 从 inject.js 传来的 bookContext 判断当前是否在棋书做题页
 */
function isOnBookQuestionPage() {
    return bookContext && bookContext.bookId && bookContext.chapterId && bookContext.qid;
}

/**
 * 获取进度存储 key
 */
function getBookProgressKey(bookId, chapterId) {
    return `${BOOK_PROGRESS_PREFIX}${bookId}:${chapterId}`;
}

/**
 * 加载棋书章节进度
 */
function loadBookProgress(bookId, chapterId) {
    try {
        const raw = localStorage.getItem(getBookProgressKey(bookId, chapterId));
        if (raw) {
            const p = JSON.parse(raw);
            if (p && typeof p === 'object') return p;
        }
    } catch(e) {}
    return {
        doneMap: {},   // { [qid]: { status, reason, costSec, ts } }
        stats: { total: 0, done: 0, correct: 0, wrong: 0, timeoutWrong: 0, streak: 0 },
        lastQid: null,
        wrongOnly: false,
    };
}

/**
 * 保存棋书章节进度
 */
function saveBookProgress(bookId, chapterId, progress) {
    try {
        localStorage.setItem(getBookProgressKey(bookId, chapterId), JSON.stringify(progress));
    } catch(e) { console.error('【棋书】保存进度失败:', e); }
}

/**
 * 录入一道题的结果到棋书进度
 */
function recordBookResult(qid, status, reason) {
    if (!bookProgress || !bookContext) return;
    const key = String(qid);
    if (bookProgress.doneMap[key]) return; // 已锁存不覆盖

    const entry = {
        status: status, // 1=对, 2=错
        reason: reason, // 'result' | 'timeout'
        ts: Date.now(),
    };
    bookProgress.doneMap[key] = entry;

    bookProgress.stats.done += 1;
    if (status === 1) {
        bookProgress.stats.correct += 1;
        bookProgress.stats.streak += 1;
    } else {
        bookProgress.stats.wrong += 1;
        bookProgress.stats.streak = 0;
        if (reason === 'timeout') bookProgress.stats.timeoutWrong += 1;
    }
    bookProgress.lastQid = key;

    saveBookProgress(bookContext.bookId, bookContext.chapterId, bookProgress);
    console.log(`【棋书】Q-${qid} → ${status === 1 ? '对' : '错'}(${reason}), 完成${bookProgress.stats.done}/${bookProgress.stats.total}`);
}

/**
 * 抓取章节完整题序列（跨页合并）
 * 利用 fetch 解析每页 HTML 中的 var nodedata = {...} 提取 qs
 */
async function fetchChapterFullQs(bookId, chapterId) {
    const cacheKey = `book_chapter_qs:${bookId}:${chapterId}`;
    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.ts < BOOK_CACHE_TTL && Array.isArray(parsed.qs) && parsed.qs.length > 0) {
                console.log(`【棋书】缓存命中 ${parsed.qs.length} 题`);
                return parsed.qs;
            }
        }
    } catch(e) {}

    let allQs = [];
    try {
        // 先抓第1页获取 maxpage
        const url1 = `${get101BaseUrl()}/book/${bookId}/${chapterId}/?page=1`;
        const html1 = await fetch(url1).then(r => r.text());
        const nd1 = extractNodedata(html1);
        if (!nd1) return [];
        allQs = allQs.concat(nd1.qs);
        const maxpage = nd1.maxpage || 1;

        // 并行抓取剩余页
        if (maxpage > 1) {
            const promises = [];
            for (let p = 2; p <= maxpage; p++) {
                const urlP = `${get101BaseUrl()}/book/${bookId}/${chapterId}/?page=${p}`;
                promises.push(fetch(urlP).then(r => r.text()).then(extractNodedata));
            }
            const pages = await Promise.all(promises);
            pages.forEach(nd => { if (nd) allQs = allQs.concat(nd.qs); });
        }

        // 按 qindex 排序
        allQs.sort((a, b) => a.qindex - b.qindex);

        localStorage.setItem(cacheKey, JSON.stringify({ qs: allQs, ts: Date.now() }));
        console.log(`【棋书】抓取完成 ${allQs.length} 题（${maxpage}页）`);
    } catch(e) {
        console.error('【棋书】抓取章节题序列失败:', e);
    }
    return allQs;
}

/**
 * 从 HTML 中提取 nodedata.pagedata 的 qs 和 maxpage
 */
function extractNodedata(html) {
    const match = html.match(/var\s+nodedata\s*=\s*(\{[\s\S]*?\});\s*(?:<\/script>|const |var |let )/);
    if (!match) return null;
    try {
        const nd = JSON.parse(match[1]);
        const pd = nd.pagedata || nd;
        return {
            maxpage: pd.maxpage || 1,
            qs: (pd.qs || []).map(q => ({
                qid: q.qid, publicid: q.publicid,
                qindex: q.qindex, levelname: q.levelname,
                blackfirst: q.blackfirst,
            })),
        };
    } catch(e) { return null; }
}

/**
 * 找到下一题的 qid（按序 or 仅错题）
 */
/**
 * 获取 doneMap 中用于查找的 key（优先用 publicid，fallback 到 qid）
 */
function getBookQKey(q) {
    return String(q.publicid || q.qid);
}

function getNextBookQid() {
    if (!bookChapterQs.length || !bookContext) return null;
    const currentQid = bookContext.qid;
    const currentIdx = bookChapterQs.findIndex(q => q.qid === currentQid || q.publicid === currentQid);

    if (bookWrongOnly) {
        // 仅错题模式：从 doneMap 中找 status===2 的题，key 与 recordBookResult 保持一致（publicid优先）
        const wrongQs = bookChapterQs.filter(q => {
            const d = bookProgress && bookProgress.doneMap[getBookQKey(q)];
            return d && d.status === 2;
        });
        if (wrongQs.length === 0) return null; // 无错题
        // 从当前位置之后找下一个错题，找不到就从头循环
        const afterCurrent = wrongQs.filter(q => {
            const idx = bookChapterQs.findIndex(x => x.qid === q.qid || x.publicid === q.publicid);
            return idx > currentIdx;
        });
        const target = afterCurrent.length > 0 ? afterCurrent[0] : wrongQs[0];
        return target.qid || target.publicid;
    } else {
        // 顺序模式：下一题
        if (currentIdx < 0 || currentIdx >= bookChapterQs.length - 1) return null;
        const next = bookChapterQs[currentIdx + 1];
        return next.qid || next.publicid;
    }
}

/**
 * 找到上一题的 qid（支持 bookWrongOnly）
 */
function getPrevBookQid() {
    if (!bookChapterQs.length || !bookContext) return null;
    const currentQid = bookContext.qid;
    const currentIdx = bookChapterQs.findIndex(q => q.qid === currentQid || q.publicid === currentQid);

    if (bookWrongOnly) {
        // 仅错题模式：从当前位置之前找上一个错题，找不到就从末尾循环
        const wrongQs = bookChapterQs.filter(q => {
            const d = bookProgress && bookProgress.doneMap[getBookQKey(q)];
            return d && d.status === 2;
        });
        if (wrongQs.length === 0) return null;
        const beforeCurrent = wrongQs.filter(q => {
            const idx = bookChapterQs.findIndex(x => x.qid === q.qid || x.publicid === q.publicid);
            return idx < currentIdx;
        });
        const target = beforeCurrent.length > 0 ? beforeCurrent[beforeCurrent.length - 1] : wrongQs[wrongQs.length - 1];
        return target.qid || target.publicid;
    } else {
        if (currentIdx <= 0) return null;
        const prev = bookChapterQs[currentIdx - 1];
        return prev.qid || prev.publicid;
    }
}

/**
 * 跳转到一道棋书题目
 */
function goToBookQuestion(qid) {
    if (!bookContext) return;
    window.location.href = `${get101BaseUrl()}/book/${bookContext.bookId}/${bookContext.chapterId}/${qid}/`;
}

/**
 * 获取棋书练习统计文本
 */
function getBookStatsText() {
    if (!bookProgress) return '';
    const s = bookProgress.stats;
    const accuracy = s.done > 0 ? Math.round((s.correct / s.done) * 100) : 0;
    const total = s.total || bookChapterQs.length || '?';
    let base = `📖 本章：${s.done}/${total} | 对${s.correct} 错${s.wrong}(超时${s.timeoutWrong}) | 连对${s.streak} | ${accuracy}%`;
    if (bookWrongOnly) {
        // 计算当前 doneMap 中的错题数量
        const wrongCount = Object.values(bookProgress.doneMap).filter(d => d.status === 2).length;
        base += `\n🔴 仅错题模式：共 ${wrongCount} 道错题待刷`;
    }
    return base;
}

/**
 * 获取当前题在章节中的序号
 */
function getCurrentBookIndex() {
    if (!bookChapterQs.length || !bookContext) return { current: 0, total: 0 };
    const idx = bookChapterQs.findIndex(q => q.qid === bookContext.qid || q.publicid === bookContext.qid);
    return { current: idx >= 0 ? idx + 1 : 0, total: bookChapterQs.length };
}

/**
 * 初始化棋书练习：加载题序列 + 恢复进度
 */
async function initBookPractice() {
    if (!isOnBookQuestionPage()) return;

    const statusEl = document.getElementById('book-info');
    if (statusEl) statusEl.textContent = '⏳ 正在加载章节题目...';

    // 显示棋书练习区
    const area = document.getElementById('book-practice-area');
    if (area) area.style.display = 'block';

    // 如果已有 inject.js 传来的当前页 qs 作为初始数据
    if (bookContext.qs && bookContext.qs.length > 0 && bookChapterQs.length === 0) {
        bookChapterQs = bookContext.qs;
    }

    // 异步抓取完整题序列
    const fullQs = await fetchChapterFullQs(bookContext.bookId, bookContext.chapterId);
    if (fullQs.length > 0) {
        bookChapterQs = fullQs;
    }

    // 加载进度
    bookProgress = loadBookProgress(bookContext.bookId, bookContext.chapterId);
    bookProgress.stats.total = bookChapterQs.length;
    bookWrongOnly = bookProgress.wrongOnly || false;

    // 恢复仅错题按钮状态
    const wrongBtn = document.getElementById('btn-book-wrong-only');
    if (wrongBtn) {
        wrongBtn.textContent = bookWrongOnly ? '📋 全部题目' : '🔴 仅错题';
        wrongBtn.style.background = bookWrongOnly ? '#ef4444' : '';
        wrongBtn.style.color = bookWrongOnly ? 'white' : '';
    }

    // 确保当前题记入 practiceSession
    if (currentProblemId) {
        ensurePracticeState(currentProblemId, currentProblemData);
    }

    saveBookProgress(bookContext.bookId, bookContext.chapterId, bookProgress);
    updateUI(currentDisplayResult);
    console.log(`【棋书】初始化完成: ${bookContext.bookName} / ${bookContext.chapterName}, ${bookChapterQs.length}题, 已完成${bookProgress.stats.done}`);
}

async function fetchBookList() {
    // 先检查 localStorage 缓存
    try {
        const cached = localStorage.getItem(BOOK_CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < BOOK_CACHE_TTL && Array.isArray(parsed.data) && parsed.data.length > 0) {
                console.log(`【棋书】从缓存加载 ${parsed.data.length} 本棋书`);
                return parsed.data;
            }
        }
    } catch(e) {}

    // 从服务器获取
    try {
        const resp = await fetch(`${get101BaseUrl()}/book/list/`);
        const html = await resp.text();
        const match = html.match(/var\s+g_books\s*=\s*(\[[\s\S]*?\]);/);
        if (!match) {
            console.error('【棋书】未找到 g_books 数据');
            return [];
        }
        const books = JSON.parse(match[1]);
        localStorage.setItem(BOOK_CACHE_KEY, JSON.stringify({ data: books, timestamp: Date.now() }));
        console.log(`【棋书】从服务器加载 ${books.length} 本棋书`);
        return books;
    } catch(e) {
        console.error('【棋书】获取棋书列表失败:', e);
        return [];
    }
}

function searchBooks(books, keyword) {
    if (!keyword || !keyword.trim()) return [];
    const kw = keyword.trim().toLowerCase();
    return books.filter(b =>
        (b.name && b.name.toLowerCase().includes(kw)) ||
        (b.username && b.username.toLowerCase().includes(kw)) ||
        (b.levelname && b.levelname.toLowerCase().includes(kw)) ||
        (b.desc && b.desc.toLowerCase().includes(kw))
    );
}

function renderBookSearchResults(results, keyword) {
    const listEl = document.getElementById('book-search-results');
    if (!listEl) return;

    if (!keyword || !keyword.trim()) {
        listEl.innerHTML = '<li style="color: #999; padding: 6px 0;">输入关键词搜索棋书...</li>';
        return;
    }

    if (results.length === 0) {
        listEl.innerHTML = `<li style="color: #999; padding: 6px 0;">未找到匹配"${keyword}"的棋书</li>`;
        return;
    }

    listEl.innerHTML = '';
    const countInfo = document.createElement('li');
    countInfo.style.cssText = 'color: #666; padding: 4px 0; font-size: 11px; border-bottom: 1px solid #eee;';
    countInfo.textContent = `找到 ${results.length} 本棋书`;
    listEl.appendChild(countInfo);

    const maxShow = 50;
    results.slice(0, maxShow).forEach(b => {
        const li = document.createElement('li');
        li.className = 'book-result-item';
        const descSnippet = b.shortdesc ? b.shortdesc.substring(0, 30) : '';
        li.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center;">
                <a href="${get101BaseUrl()}/book/${b.id}/" target="_blank"
                   style="color:#2563eb; text-decoration:none; font-weight:bold; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${b.name}
                </a>
                <span style="color:#666; font-size:11px; min-width:40px; text-align:right;">${b.levelname}</span>
            </div>
            <div style="font-size:11px; color:#999; margin-top:2px;">
                ${b.qcount}题 · ${b.username}${descSnippet ? ' · ' + descSnippet : ''}
            </div>
        `;
        listEl.appendChild(li);
    });

    if (results.length > maxShow) {
        const more = document.createElement('li');
        more.style.cssText = 'color: #999; padding: 4px 0; font-size: 11px; text-align: center;';
        more.textContent = `还有 ${results.length - maxShow} 本未显示，请输入更精确的关键词`;
        listEl.appendChild(more);
    }
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
        await saveProblemHistory(state.data, result === 1, { mode: helperMode });
        state.recordedHistory = true;
        currentProblemHistory = await getProblemHistory(qid);
    }
}

async function checkPracticeTimeoutForCurrent() {
    if ((helperMode !== 'practice' && helperMode !== 'book') || !currentProblemId) return;
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

    // 更新棋书上下文
    if (event.data.bookContext) {
        bookContext = event.data.bookContext;
        console.log("【棋书】上下文:", bookContext.bookName, '章节', bookContext.chapterId, '题', bookContext.qid);
        // 自动初始化棋书练习（如果在棋书模式中）
        if (helperMode === 'book' && isOnBookQuestionPage() && bookChapterQs.length === 0) {
            initBookPractice();
        }
    }
    
    // 如果切题了，重新获取历史记录
    if (currentProblemData && currentProblemData.publicid !== currentProblemId) {
        currentProblemId = currentProblemData.publicid;
        currentProblemHistory = await getProblemHistory(currentProblemId);
    }

    const incomingResult = (answerResult === null || answerResult === undefined) ? 0 : answerResult;

    if (helperMode === 'book' && isOnBookQuestionPage() && currentProblemId) {
        // 棋书练习模式：结果锁存到棋书进度
        const state = ensurePracticeState(currentProblemId, currentProblemData);
        if (state && !state.locked) {
            if (incomingResult === 1 || incomingResult === 2) {
                await lockPracticeResult(currentProblemId, incomingResult, 'result');
                recordBookResult(currentProblemId, incomingResult, 'result');
            } else {
                await checkPracticeTimeoutForCurrent();
                // 超时也录入棋书进度
                if (state.locked && state.status === 2) {
                    recordBookResult(currentProblemId, 2, 'timeout');
                }
            }
        }
        currentDisplayResult = state && state.locked ? state.status : incomingResult;
        if (state && state.locked) currentCountdownSec = null;
    } else if (helperMode === 'practice' && currentProblemId) {
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
        if (helperMode === 'practice' || helperMode === 'book') {
            await checkPracticeTimeoutForCurrent();
            // 棋书模式下超时也要录入棋书进度
            if (helperMode === 'book' && currentProblemId) {
                const state = practiceSession.byQid.get(String(currentProblemId));
                if (state && state.locked && state.reason === 'timeout' && bookProgress) {
                    recordBookResult(currentProblemId, 2, 'timeout');
                }
            }
            updateUI(currentDisplayResult);
        }
    }, 1000);
}

// ==========================================
// 4. UI 更新函数
// ==========================================
function updateUI(answerResult) {
    const statusDiv = document.getElementById('helper-status');
    if (!statusDiv || !currentProblemData) return;

    const modeLabels = { browse: '👀 浏览模式', practice: '📝 做题模式', book: '📘 棋书练习' };
    const finalResult = (answerResult === null || answerResult === undefined) ? 0 : answerResult;
    const toneClass = finalResult === 1 ? 'is-success' : finalResult === 2 ? 'is-fail' : 'is-pending';
    const resultText = finalResult === 1 ? '✅ 本题已通过' : finalResult === 2 ? '❌ 本题未通过' : '⏳ 尚未作答';
    const historyText = currentProblemHistory
        ? `${currentProblemHistory.correctCount || 0} 对 / ${currentProblemHistory.errorCount || 0} 错`
        : '初次挑战';

    statusDiv.className = `helper-info-block status-card ${toneClass}`;

    let statusHtml = `
        <div class="status-card-head">
            <span class="status-tag tag-success">数据捕获成功</span>
            <span class="status-mode-pill">${modeLabels[helperMode] || helperMode}</span>
        </div>
        <div class="status-card-main">${resultText}</div>
        <div class="status-card-meta-row">
            <span class="status-meta-pill">题目 Q-${currentProblemData.publicid || '?'}</span>
            <span class="status-meta-pill">${currentProblemData.levelname || '未知难度'}</span>
            <span class="status-meta-pill">${currentProblemData.qtypename || '未知题型'}</span>
        </div>
    `;

    if (helperMode === 'practice' || helperMode === 'book') {
        const countdown = (currentCountdownSec === null) ? '--:--' : formatCountdown(currentCountdownSec);
        const countdownClass = (currentCountdownSec !== null && currentCountdownSec <= 10) ? 'is-warning' : '';
        statusHtml += `
            <div class="status-card-timer-row ${countdownClass}">
                <span>⏱️ 本题限时 ${practiceTimeLimitSec}s</span>
                <strong>剩余 ${countdown}</strong>
            </div>
        `;
    }

    statusHtml += `<div class="status-card-history">📚 历史战绩：${historyText}</div>`;

    statusDiv.innerHTML = statusHtml;

    const headerBadge = document.getElementById('header-mode-badge');
    if (headerBadge) headerBadge.textContent = modeLabels[helperMode] || helperMode;
    const settingsHint = document.getElementById('settings-section-hint');
    if (settingsHint) settingsHint.textContent = `${modeLabels[helperMode] || helperMode} · ${practiceTimeLimitSec}s`;

    // 棋书练习区渲染
    const bookArea = document.getElementById('book-practice-area');
    if (bookArea) {
        if (helperMode === 'book' && isOnBookQuestionPage()) {
            bookArea.style.display = 'block';
            const infoEl = document.getElementById('book-info');
            const statsEl = document.getElementById('book-stats');
            const progressFill = document.getElementById('book-progress-fill');
            const progressText = document.getElementById('book-progress-text');

            if (infoEl && bookContext) {
                const pos = getCurrentBookIndex();
                infoEl.textContent = `📘 ${bookContext.bookName || '棋书'} / ${bookContext.chapterName || '章节'} — 第${pos.current}/${pos.total}题`;
            }
            if (statsEl) statsEl.textContent = getBookStatsText();
            if (progressFill && progressText && bookProgress) {
                const pct = bookProgress.stats.total > 0 ? Math.round((bookProgress.stats.done / bookProgress.stats.total) * 100) : 0;
                progressFill.style.width = pct + '%';
                progressText.textContent = `进度 ${pct}%（${bookProgress.stats.done}/${bookProgress.stats.total}）`;
            }
        } else {
            bookArea.style.display = 'none';
        }
    }

    const statsDiv = document.getElementById('practice-stats');
    if (statsDiv) {
        if (helperMode === 'practice') {
            statsDiv.style.display = 'block';
            statsDiv.className = 'helper-info-block practice-stats-card';
            statsDiv.innerHTML = getCurrentPracticeStatsText();
        } else {
            statsDiv.style.display = 'none';
            statsDiv.innerHTML = '';
        }
    }
}