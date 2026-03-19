console.log("101鍥存鍔╂墜: Content Script 宸插姞杞?);

// 1. 娉ㄥ叆 inject.js
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
        minimizeBtn.textContent = state.minimized ? '鈻? : '锛?;
        minimizeBtn.title = state.minimized ? '灞曞紑闈㈡澘' : '鏈€灏忓寲闈㈡澘';
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
// 2. 鍒涘缓 UI 闈㈡澘 (鍙嫋鍔?
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
                <span class="panel-title">101鍥存鍔╂墜</span>
                <span id="header-mode-badge" class="panel-mode-badge">娴忚妯″紡</span>
            </div>
            <div class="panel-toolbar">
                <button class="toolbar-preset-btn" type="button" data-preset="small" title="绱у噾灏哄">灏?/button>
                <button class="toolbar-preset-btn" type="button" data-preset="medium" title="鏍囧噯灏哄">涓?/button>
                <button class="toolbar-preset-btn" type="button" data-preset="large" title="鎵╁睍灏哄">澶?/button>
                <button id="btn-minimize-panel" class="toolbar-icon-btn" type="button" title="鏈€灏忓寲闈㈡澘">锛?/button>
                <button class="close-btn toolbar-icon-btn" type="button" title="鍏抽棴闈㈡澘">脳</button>
            </div>
        </div>
        <div id="weiqi-helper-content">
            <div id="helper-status" class="helper-info-block status-card">
                <span class="status-tag tag-wait">绛夊緟棰樼洰鏁版嵁...</span>
            </div>

            <div id="practice-stats" class="helper-info-block practice-stats-card" style="display:none;"></div>

            <div id="book-practice-area" class="panel-feature-card book-feature-card" style="display:none;">
                <div class="feature-card-title">馃摌 妫嬩功缁冧範</div>
                <div id="book-info" class="feature-card-meta"></div>
                <div id="book-progress-bar" class="book-progress-wrap">
                    <div class="book-progress-track">
                        <div id="book-progress-fill" style="background:#8b5cf6; height:100%; width:0%; transition:width 0.3s;"></div>
                    </div>
                    <div id="book-progress-text" class="feature-card-meta feature-card-meta-tight"></div>
                </div>
                <div id="book-stats" class="feature-card-stats"></div>
                <div class="feature-card-actions">
                    <button id="btn-book-prev" class="helper-btn book-nav-btn feature-btn-secondary">猬?涓婁竴棰?/button>
                    <button id="btn-book-next" class="helper-btn book-nav-btn feature-btn-primary">涓嬩竴棰?鉃?/button>
                </div>
                <div class="feature-card-actions feature-card-actions-tight">
                    <button id="btn-book-wrong-only" class="helper-btn book-nav-btn feature-btn-secondary">馃敶 浠呴敊棰?/button>
                    <button id="btn-book-reset" class="helper-btn book-nav-btn feature-btn-danger">馃攧 閲嶇疆鏈珷</button>
                </div>
            </div>

            <div class="panel-quick-actions">
                <button id="btn-quick-settings" class="quick-action-btn" type="button">璁剧疆</button>
                <button id="btn-quick-errors" class="quick-action-btn quick-action-warn" type="button">
                    <span>閿欓鏈?/span>
                    <span id="quick-errors-badge" class="quick-action-badge">0</span>
                </button>
                <button id="btn-quick-search" class="quick-action-btn" type="button">鎼滅储</button>
            </div>

            <div class="panel-scroll-area">
            <section id="helper-mode-section" class="panel-section-card" data-section="settings">
                <button id="btn-toggle-settings-section" class="panel-section-header" type="button">
                    <span>妯″紡涓庨檺鏃?/span>
                    <span id="settings-section-hint" class="panel-section-hint">褰撳墠閰嶇疆</span>
                </button>
                <div class="panel-section-body">
                    <div id="helper-mode-controls" class="panel-settings-grid">
                        <div class="panel-setting-row">
                            <span class="panel-setting-label">妯″紡</span>
                            <select id="helper-mode" class="panel-input panel-select">
                                <option value="browse">娴忚妯″紡</option>
                                <option value="practice">鍋氶妯″紡</option>
                                <option value="book">妫嬩功缁冧範</option>
                            </select>
                        </div>
                        <div class="panel-setting-row">
                            <span class="panel-setting-label">闄愭椂(绉?</span>
                            <input id="helper-time-limit" type="number" min="5" step="5" class="panel-input panel-input-number" />
                        </div>
                    </div>
                </div>
            </section>

            <section id="error-book-section" class="panel-section-card" data-section="error">
                <button id="btn-show-errors" class="panel-section-header panel-section-header-warn" type="button">
                    <span>閿欓鏈噸鍒?/span>
                    <span id="error-section-hint" class="panel-section-hint">寰呭涔?0</span>
                </button>
                <div class="panel-section-body">
                    <div id="error-book-area" class="error-book-area">
                        <div class="error-book-header">
                            <div>
                                <div class="error-book-title">閿欓鏈?/div>
                                <div class="error-book-subtitle">浠呭仛棰樻ā寮忎笅锛岄敊棰橀噸鍒峰仛瀵瑰悗浼氳嚜鍔ㄧЩ鍑哄緟澶嶄範鍒楄〃</div>
                            </div>
                            <button id="btn-clear-errors" class="helper-btn error-clear-btn">娓呯┖</button>
                        </div>

                        <div id="error-book-summary" class="error-book-summary"></div>

                        <div class="error-book-toolbar">
                            <button id="btn-error-filter-review" class="helper-btn error-filter-btn active">寰呭涔?/button>
                            <button id="btn-error-filter-all" class="helper-btn error-filter-btn">鍏ㄩ儴</button>
                            <button id="btn-error-filter-resolved" class="helper-btn error-filter-btn">宸插埛鍥?/button>
                        </div>

                        <ul id="error-list" class="error-book-list">
                            <li class="error-book-empty">鍔犺浇涓?..</li>
                        </ul>
                    </div>
                </div>
            </section>

            <section id="book-search-section" class="panel-section-card" data-section="search">
                <button id="btn-toggle-search-section" class="panel-section-header" type="button">
                    <span>妫嬩功鎼滅储</span>
                    <span class="panel-section-hint">367 鏈彲鎼?/span>
                </button>
                <div class="panel-section-body">
                    <div id="book-search-area" class="search-section-body">
                        <div class="search-input-row">
                            <input id="book-search-input" type="text" placeholder="涔﹀悕 / 浣滆€?/ 闅惧害" class="panel-input search-input" />
                            <button id="btn-book-search" class="helper-btn search-btn">鎼滅储</button>
                        </div>
                        <div id="book-search-status" class="search-status" style="display:none;"></div>
                        <ul id="book-search-results" class="search-results-list">
                            <li class="search-empty">杈撳叆鍏抽敭璇嶆悳绱㈡涔?..</li>
                        </ul>
                    </div>
                </div>
            </section>
                </div>
        </div>
        <div id="weiqi-helper-resizer" title="鎷栨嫿璋冩暣灏哄"></div>
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
        const willBeOpen = !current[key];
        
        if (willBeOpen) {
            ['settings', 'error', 'search'].forEach(k => current[k] = false);
        }
        
        current[key] = willBeOpen;
        applySectionState(panel, current);
    }

    function updateModeDecorations() {
        const modeLabels = { browse: '娴忚妯″紡', practice: '鍋氶妯″紡', book: '妫嬩功缁冧範' };
        const badge = panel.querySelector('#header-mode-badge');
        if (badge) badge.textContent = modeLabels[helperMode] || helperMode;
        const settingsHint = panel.querySelector('#settings-section-hint');
        if (settingsHint) settingsHint.textContent = `${modeLabels[helperMode] || helperMode} 路 ${practiceTimeLimitSec}s`;
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
        if (confirm('纭畾瑕佹竻绌烘墍鏈夐敊棰樿褰曞悧锛?)) {
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

    // 妫嬩功鎼滅储缁戝畾
    let _bookListCache = null;
    const bookSearchInput = panel.querySelector('#book-search-input');
    const bookSearchBtn = panel.querySelector('#btn-book-search');
    const bookSearchStatus = panel.querySelector('#book-search-status');

    async function doBookSearch() {
        const keyword = bookSearchInput.value;
        if (!_bookListCache) {
            bookSearchStatus.style.display = 'block';
            bookSearchStatus.textContent = '鈴?棣栨鍔犺浇妫嬩功鏁版嵁...';
            _bookListCache = await fetchBookList();
            if (_bookListCache.length > 0) {
                bookSearchStatus.textContent = `鉁?宸插姞杞?${_bookListCache.length} 鏈涔;
                setTimeout(() => { bookSearchStatus.style.display = 'none'; }, 2000);
            } else {
                bookSearchStatus.textContent = '鉂?鍔犺浇澶辫触锛岃妫€鏌ョ綉缁滃悗閲嶈瘯';
            }
        }
        const results = searchBooks(_bookListCache, keyword);
        renderBookSearchResults(results, keyword);
    }

    bookSearchBtn.addEventListener('click', doBookSearch);
    bookSearchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doBookSearch();
    });

    // 妫嬩功缁冧範鎸夐挳缁戝畾
    panel.querySelector('#btn-book-next').addEventListener('click', () => {
        const nextQid = getNextBookQid();
        if (nextQid) {
            goToBookQuestion(nextQid);
        } else if (bookWrongOnly) {
            const wrongCount = bookProgress ? Object.values(bookProgress.doneMap).filter(d => d.status === 2).length : 0;
            if (wrongCount === 0) {
                alert('褰撳墠绔犺妭杩樻病鏈夐敊棰樿褰曪紝鍏堝仛鍑犻亾棰樺惂锛?);
            } else {
                alert('浠呴敊棰樻ā寮忥細宸叉槸鏈€鍚庝竴閬撻敊棰橈紙鍏?' + wrongCount + ' 棰橈級');
            }
        } else {
            alert('宸叉槸鏈珷鏈€鍚庝竴棰?);
        }
    });
    panel.querySelector('#btn-book-prev').addEventListener('click', () => {
        const prevQid = getPrevBookQid();
        if (prevQid) {
            goToBookQuestion(prevQid);
        } else if (bookWrongOnly) {
            const wrongCount = bookProgress ? Object.values(bookProgress.doneMap).filter(d => d.status === 2).length : 0;
            if (wrongCount === 0) {
                alert('褰撳墠绔犺妭杩樻病鏈夐敊棰樿褰曪紝鍏堝仛鍑犻亾棰樺惂锛?);
            } else {
                alert('浠呴敊棰樻ā寮忥細宸叉槸绗竴閬撻敊棰橈紙鍏?' + wrongCount + ' 棰橈級');
            }
        } else {
            alert('宸叉槸鏈珷绗竴棰?);
        }
    });
    panel.querySelector('#btn-book-wrong-only').addEventListener('click', () => {
        bookWrongOnly = !bookWrongOnly;
        const btn = panel.querySelector('#btn-book-wrong-only');
        btn.textContent = bookWrongOnly ? '馃搵 鍏ㄩ儴棰樼洰' : '馃敶 浠呴敊棰?;
        btn.style.background = bookWrongOnly ? '#ef4444' : '';
        btn.style.color = bookWrongOnly ? 'white' : '';
        if (bookProgress) {
            bookProgress.wrongOnly = bookWrongOnly;
            if (bookContext) saveBookProgress(bookContext.bookId, bookContext.chapterId, bookProgress);
        }
    });
    panel.querySelector('#btn-book-reset').addEventListener('click', () => {
        if (!bookContext) return;
        if (!confirm(`纭畾閲嶇疆銆?{bookContext.bookName || '鏈珷'}銆嶇殑鍋氶杩涘害鍚楋紵`)) return;
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
        // 鍒囨崲妯″紡鏃惰嚜鍔ㄨ皟鏁村垎鍖哄睍寮€鐘舵€侊紙鍙湪鐢ㄦ埛涓诲姩鍒囨崲鏃惰Е鍙戜竴娆★級
        {
            const sects = loadSectionState();
            if (helperMode === 'book') {
                // 妫嬩功妯″紡锛氬睍寮€鎼滅储锛堟壘涔︼級锛屾敹璧烽敊棰樻湰锛堝噺灏戞嫢鎸わ級
                applySectionState(panel, { ...sects, search: true, error: false });
            } else if (helperMode === 'practice') {
                // 鍋氶妯″紡锛氭敹璧锋悳绱紙鍋氶鏃剁敤涓嶅埌锛夛紝淇濈暀鍏朵粬
                applySectionState(panel, { ...sects, search: false });
            }
            // browse 妯″紡涓嶈嚜鍔ㄨ皟鏁达紝淇濇寔鐢ㄦ埛涓婁竴娆＄殑鐘舵€?
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

// 鍒濆鍖栭潰鏉?
createPanel();

function getCurrentPracticeStatsText() {
    const s = practiceSession.stats;
    const accuracy = s.total > 0 ? Math.round((s.correct / s.total) * 100) : 0;
    return `馃搱 鍋氶缁熻锛氭€?{s.total} | 瀵?{s.correct} | 閿?{s.wrong}锛堣秴鏃?{s.timeoutWrong}锛?| 姝ｇ‘鐜?{accuracy}%`;
}

// ==========================================
// 2.5 IndexedDB 閿欓鏈瓨鍌ㄩ€昏緫
// ==========================================
const DB_NAME = '101WeiqiHelperDB';
const STORE_NAME = 'error_book';
const TRUSTED_101_HOSTS = new Set([
    'www.101weiqi.com',
    '101weiqi.com',
    'www.101weiqi.cn',
    '101weiqi.cn',
]);

// 鏍规嵁褰撳墠鍩熷悕杩斿洖姝ｇ‘鐨?101 鍩虹 URL锛堝悓鏃跺吋瀹?.cn 鍜?.com锛?
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
        const key = item.levelname || '鏈爣娉ㄩ毦搴?;
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
        { label: '寰呭涔?, value: reviewing },
        { label: '閿欓鎬绘暟', value: allErrors.length },
        { label: '宸插埛鍥?, value: resolved },
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
    if (errorHint) errorHint.textContent = `寰呭涔?${reviewing}`;
}

function createErrorBookCard(err) {
    const safeUrl = getTrusted101Url(err.url);
    const dateText = new Date(err.timestamp).toLocaleString('zh-CN', {
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
    const statusText = err.needReview === false ? '宸插埛鍥? : '寰呭涔?;
    const statusClass = err.needReview === false ? 'resolved' : 'reviewing';

    const card = createElement('div', 'error-card');
    const main = createElement('div', 'error-card-main');
    const titleRow = createElement('div', 'error-card-title-row');
    const titleLink = createElement('a', 'error-card-title', `Q-${err.qid}`);
    const badge = createElement('span', `error-card-badge ${statusClass}`, statusText);
    const meta = createElement('div', 'error-card-meta');
    const stats = createElement('div', 'error-card-stats');
    const actions = createElement('div', 'error-card-actions');
    const reviewBtn = createElement('button', 'helper-btn error-review-btn', '鍘婚噸鍒?);

    if (safeUrl) {
        titleLink.href = safeUrl;
        titleLink.target = '_blank';
        titleLink.rel = 'noopener noreferrer';
        reviewBtn.addEventListener('click', () => startErrorReview(err.qid, safeUrl));
    } else {
        titleLink.href = '#';
        titleLink.addEventListener('click', (event) => event.preventDefault());
        titleLink.title = '閾炬帴鏃犳晥';
        reviewBtn.disabled = true;
        reviewBtn.title = '閿欓閾炬帴鏃犳晥锛屾棤娉曡烦杞?;
    }

    meta.append(
        createElement('span', '', err.levelname || '鏈煡闅惧害'),
        createElement('span', '', err.qtypename || '鏈煡棰樺瀷')
    );

    stats.append(
        createElement('span', 'ok', `瀵?${err.correctCount || 0}`),
        createElement('span', 'bad', `閿?${err.errorCount || 0}`),
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
        createElement('span', 'error-group-count', `${group.items.length} 棰榒)
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
                // 浠ラ鐩?ID 涓轰富閿?
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
        console.log(`銆愬巻鍙茶褰曘€戞洿鏂?Q-${qid}锛屽:${record.correctCount || 0} 閿?${record.errorCount || 0} 寰呭涔?${record.needReview !== false}`);
    } catch (e) {
        console.error("淇濆瓨鍘嗗彶璁板綍澶辫触:", e);
    }
}

async function getProblemHistory(qid) {
    if (!qid) return null; // 闃插尽绌?key 鎶ラ敊
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
        console.error("璇诲彇閿欓鏈け璐?", e);
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
        console.error("娓呯┖閿欓鏈け璐?", e);
    }
}

function startErrorReview(qid, url) {
    const safeUrl = getTrusted101Url(url);
    if (!safeUrl) {
        console.warn('[101鍥存鍔╂墜] 鎷掔粷璺宠浆鍒颁笉鍙椾俊浠荤殑鍦板潃:', url);
        return;
    }

    helperMode = 'practice';
    localStorage.setItem(MODE_KEY, 'practice');
    const modeSelect = document.getElementById('helper-mode');
    if (modeSelect) modeSelect.value = 'practice';
    console.log(`銆愰敊棰橀噸鍒枫€戝紑濮嬮噸鍒?Q-${qid}`);
    window.location.href = safeUrl;
}

async function renderErrorBook(filter = 'needReview') {
    const listEl = document.getElementById('error-list');
    const summaryEl = document.getElementById('error-book-summary');
    if (!listEl) return;

    const renderToken = ++errorBookRenderToken;
    listEl.replaceChildren(createErrorBookEmptyItem('鍔犺浇涓?..'));

    const allErrors = await getErrorBook();
    if (renderToken !== errorBookRenderToken) return;

    const errors = filterErrorBookRecords(allErrors, filter);
    const grouped = groupErrorsByDifficulty(errors);

    renderErrorBookSummary(summaryEl, allErrors);

    if (errors.length === 0) {
        if (renderToken !== errorBookRenderToken) return;
        listEl.replaceChildren(createErrorBookEmptyItem('褰撳墠绛涢€変笅娌℃湁棰樼洰锛岀户缁繚鎸併€?));
        return;
    }

    if (renderToken !== errorBookRenderToken) return;
    listEl.replaceChildren(...grouped.map(group => createErrorBookGroup(group)));
}


// ==========================================
// 2.7 妫嬩功鎼滅储閫昏緫
// ==========================================
const BOOK_CACHE_KEY = 'weiqi_helper_book_cache';
const BOOK_CACHE_TTL = 24 * 60 * 60 * 1000; // 24灏忔椂

// ==========================================
// 2.8 妫嬩功缁冧範妯″紡
// ==========================================
const BOOK_PROGRESS_PREFIX = 'book_progress:';

// 妫嬩功涓婁笅鏂囷紙褰撳墠椤甸潰鏄惁鍦ㄦ涔﹂鐩〉锛?
let bookContext = null;
// 褰撳墠绔犺妭瀹屾暣棰樺簭鍒楋紙璺ㄩ〉鍚堝苟鍚庯級
let bookChapterQs = [];
// 褰撳墠绔犺妭杩涘害瀵硅薄
let bookProgress = null;
// 閿欓绛涢€夊紑鍏?
let bookWrongOnly = false;

/**
 * 浠?inject.js 浼犳潵鐨?bookContext 鍒ゆ柇褰撳墠鏄惁鍦ㄦ涔﹀仛棰橀〉
 */
function isOnBookQuestionPage() {
    return bookContext && bookContext.bookId && bookContext.chapterId && bookContext.qid;
}

/**
 * 鑾峰彇杩涘害瀛樺偍 key
 */
function getBookProgressKey(bookId, chapterId) {
    return `${BOOK_PROGRESS_PREFIX}${bookId}:${chapterId}`;
}

/**
 * 鍔犺浇妫嬩功绔犺妭杩涘害
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
 * 淇濆瓨妫嬩功绔犺妭杩涘害
 */
function saveBookProgress(bookId, chapterId, progress) {
    try {
        localStorage.setItem(getBookProgressKey(bookId, chapterId), JSON.stringify(progress));
    } catch(e) { console.error('銆愭涔︺€戜繚瀛樿繘搴﹀け璐?', e); }
}

/**
 * 褰曞叆涓€閬撻鐨勭粨鏋滃埌妫嬩功杩涘害
 */
function recordBookResult(qid, status, reason) {
    if (!bookProgress || !bookContext) return;
    const key = String(qid);
    if (bookProgress.doneMap[key]) return; // 宸查攣瀛樹笉瑕嗙洊

    const entry = {
        status: status, // 1=瀵? 2=閿?
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
    console.log(`銆愭涔︺€慟-${qid} 鈫?${status === 1 ? '瀵? : '閿?}(${reason}), 瀹屾垚${bookProgress.stats.done}/${bookProgress.stats.total}`);
}

/**
 * 鎶撳彇绔犺妭瀹屾暣棰樺簭鍒楋紙璺ㄩ〉鍚堝苟锛?
 * 鍒╃敤 fetch 瑙ｆ瀽姣忛〉 HTML 涓殑 var nodedata = {...} 鎻愬彇 qs
 */
async function fetchChapterFullQs(bookId, chapterId) {
    const cacheKey = `book_chapter_qs:${bookId}:${chapterId}`;
    try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.ts < BOOK_CACHE_TTL && Array.isArray(parsed.qs) && parsed.qs.length > 0) {
                console.log(`銆愭涔︺€戠紦瀛樺懡涓?${parsed.qs.length} 棰榒);
                return parsed.qs;
            }
        }
    } catch(e) {}

    let allQs = [];
    try {
        // 鍏堟姄绗?椤佃幏鍙?maxpage
        const url1 = `${get101BaseUrl()}/book/${bookId}/${chapterId}/?page=1`;
        const html1 = await fetch(url1).then(r => r.text());
        const nd1 = extractNodedata(html1);
        if (!nd1) return [];
        allQs = allQs.concat(nd1.qs);
        const maxpage = nd1.maxpage || 1;

        // 骞惰鎶撳彇鍓╀綑椤?
        if (maxpage > 1) {
            const promises = [];
            for (let p = 2; p <= maxpage; p++) {
                const urlP = `${get101BaseUrl()}/book/${bookId}/${chapterId}/?page=${p}`;
                promises.push(fetch(urlP).then(r => r.text()).then(extractNodedata));
            }
            const pages = await Promise.all(promises);
            pages.forEach(nd => { if (nd) allQs = allQs.concat(nd.qs); });
        }

        // 鎸?qindex 鎺掑簭
        allQs.sort((a, b) => a.qindex - b.qindex);

        localStorage.setItem(cacheKey, JSON.stringify({ qs: allQs, ts: Date.now() }));
        console.log(`銆愭涔︺€戞姄鍙栧畬鎴?${allQs.length} 棰橈紙${maxpage}椤碉級`);
    } catch(e) {
        console.error('銆愭涔︺€戞姄鍙栫珷鑺傞搴忓垪澶辫触:', e);
    }
    return allQs;
}

/**
 * 浠?HTML 涓彁鍙?nodedata.pagedata 鐨?qs 鍜?maxpage
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
 * 鎵惧埌涓嬩竴棰樼殑 qid锛堟寜搴?or 浠呴敊棰橈級
 */
/**
 * 鑾峰彇 doneMap 涓敤浜庢煡鎵剧殑 key锛堜紭鍏堢敤 publicid锛宖allback 鍒?qid锛?
 */
function getBookQKey(q) {
    return String(q.publicid || q.qid);
}

function getNextBookQid() {
    if (!bookChapterQs.length || !bookContext) return null;
    const currentQid = bookContext.qid;
    const currentIdx = bookChapterQs.findIndex(q => q.qid === currentQid || q.publicid === currentQid);

    if (bookWrongOnly) {
        // 浠呴敊棰樻ā寮忥細浠?doneMap 涓壘 status===2 鐨勯锛宬ey 涓?recordBookResult 淇濇寔涓€鑷达紙publicid浼樺厛锛?
        const wrongQs = bookChapterQs.filter(q => {
            const d = bookProgress && bookProgress.doneMap[getBookQKey(q)];
            return d && d.status === 2;
        });
        if (wrongQs.length === 0) return null; // 鏃犻敊棰?
        // 浠庡綋鍓嶄綅缃箣鍚庢壘涓嬩竴涓敊棰橈紝鎵句笉鍒板氨浠庡ご寰幆
        const afterCurrent = wrongQs.filter(q => {
            const idx = bookChapterQs.findIndex(x => x.qid === q.qid || x.publicid === q.publicid);
            return idx > currentIdx;
        });
        const target = afterCurrent.length > 0 ? afterCurrent[0] : wrongQs[0];
        return target.qid || target.publicid;
    } else {
        // 椤哄簭妯″紡锛氫笅涓€棰?
        if (currentIdx < 0 || currentIdx >= bookChapterQs.length - 1) return null;
        const next = bookChapterQs[currentIdx + 1];
        return next.qid || next.publicid;
    }
}

/**
 * 鎵惧埌涓婁竴棰樼殑 qid锛堟敮鎸?bookWrongOnly锛?
 */
function getPrevBookQid() {
    if (!bookChapterQs.length || !bookContext) return null;
    const currentQid = bookContext.qid;
    const currentIdx = bookChapterQs.findIndex(q => q.qid === currentQid || q.publicid === currentQid);

    if (bookWrongOnly) {
        // 浠呴敊棰樻ā寮忥細浠庡綋鍓嶄綅缃箣鍓嶆壘涓婁竴涓敊棰橈紝鎵句笉鍒板氨浠庢湯灏惧惊鐜?
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
 * 璺宠浆鍒颁竴閬撴涔﹂鐩?
 */
function goToBookQuestion(qid) {
    if (!bookContext) return;
    window.location.href = `${get101BaseUrl()}/book/${bookContext.bookId}/${bookContext.chapterId}/${qid}/`;
}

/**
 * 鑾峰彇妫嬩功缁冧範缁熻鏂囨湰
 */
function getBookStatsText() {
    if (!bookProgress) return '';
    const s = bookProgress.stats;
    const accuracy = s.done > 0 ? Math.round((s.correct / s.done) * 100) : 0;
    const total = s.total || bookChapterQs.length || '?';
    let base = `馃摉 鏈珷锛?{s.done}/${total} | 瀵?{s.correct} 閿?{s.wrong}(瓒呮椂${s.timeoutWrong}) | 杩炲${s.streak} | ${accuracy}%`;
    if (bookWrongOnly) {
        // 璁＄畻褰撳墠 doneMap 涓殑閿欓鏁伴噺
        const wrongCount = Object.values(bookProgress.doneMap).filter(d => d.status === 2).length;
        base += `\n馃敶 浠呴敊棰樻ā寮忥細鍏?${wrongCount} 閬撻敊棰樺緟鍒穈;
    }
    return base;
}

/**
 * 鑾峰彇褰撳墠棰樺湪绔犺妭涓殑搴忓彿
 */
function getCurrentBookIndex() {
    if (!bookChapterQs.length || !bookContext) return { current: 0, total: 0 };
    const idx = bookChapterQs.findIndex(q => q.qid === bookContext.qid || q.publicid === bookContext.qid);
    return { current: idx >= 0 ? idx + 1 : 0, total: bookChapterQs.length };
}

/**
 * 鍒濆鍖栨涔︾粌涔狅細鍔犺浇棰樺簭鍒?+ 鎭㈠杩涘害
 */
async function initBookPractice() {
    if (!isOnBookQuestionPage()) return;

    const statusEl = document.getElementById('book-info');
    if (statusEl) statusEl.textContent = '鈴?姝ｅ湪鍔犺浇绔犺妭棰樼洰...';

    // 鏄剧ず妫嬩功缁冧範鍖?
    const area = document.getElementById('book-practice-area');
    if (area) area.style.display = 'block';

    // 濡傛灉宸叉湁 inject.js 浼犳潵鐨勫綋鍓嶉〉 qs 浣滀负鍒濆鏁版嵁
    if (bookContext.qs && bookContext.qs.length > 0 && bookChapterQs.length === 0) {
        bookChapterQs = bookContext.qs;
    }

    // 寮傛鎶撳彇瀹屾暣棰樺簭鍒?
    const fullQs = await fetchChapterFullQs(bookContext.bookId, bookContext.chapterId);
    if (fullQs.length > 0) {
        bookChapterQs = fullQs;
    }

    // 鍔犺浇杩涘害
    bookProgress = loadBookProgress(bookContext.bookId, bookContext.chapterId);
    bookProgress.stats.total = bookChapterQs.length;
    bookWrongOnly = bookProgress.wrongOnly || false;

    // 鎭㈠浠呴敊棰樻寜閽姸鎬?
    const wrongBtn = document.getElementById('btn-book-wrong-only');
    if (wrongBtn) {
        wrongBtn.textContent = bookWrongOnly ? '馃搵 鍏ㄩ儴棰樼洰' : '馃敶 浠呴敊棰?;
        wrongBtn.style.background = bookWrongOnly ? '#ef4444' : '';
        wrongBtn.style.color = bookWrongOnly ? 'white' : '';
    }

    // 纭繚褰撳墠棰樿鍏?practiceSession
    if (currentProblemId) {
        ensurePracticeState(currentProblemId, currentProblemData);
    }

    saveBookProgress(bookContext.bookId, bookContext.chapterId, bookProgress);
    updateUI(currentDisplayResult);
    console.log(`銆愭涔︺€戝垵濮嬪寲瀹屾垚: ${bookContext.bookName} / ${bookContext.chapterName}, ${bookChapterQs.length}棰? 宸插畬鎴?{bookProgress.stats.done}`);
}

async function fetchBookList() {
    // 鍏堟鏌?localStorage 缂撳瓨
    try {
        const cached = localStorage.getItem(BOOK_CACHE_KEY);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (Date.now() - parsed.timestamp < BOOK_CACHE_TTL && Array.isArray(parsed.data) && parsed.data.length > 0) {
                console.log(`銆愭涔︺€戜粠缂撳瓨鍔犺浇 ${parsed.data.length} 鏈涔);
                return parsed.data;
            }
        }
    } catch(e) {}

    // 浠庢湇鍔″櫒鑾峰彇
    try {
        const resp = await fetch(`${get101BaseUrl()}/book/list/`);
        const html = await resp.text();
        const match = html.match(/var\s+g_books\s*=\s*(\[[\s\S]*?\]);/);
        if (!match) {
            console.error('銆愭涔︺€戞湭鎵惧埌 g_books 鏁版嵁');
            return [];
        }
        const books = JSON.parse(match[1]);
        localStorage.setItem(BOOK_CACHE_KEY, JSON.stringify({ data: books, timestamp: Date.now() }));
        console.log(`銆愭涔︺€戜粠鏈嶅姟鍣ㄥ姞杞?${books.length} 鏈涔);
        return books;
    } catch(e) {
        console.error('銆愭涔︺€戣幏鍙栨涔﹀垪琛ㄥけ璐?', e);
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
        listEl.innerHTML = '<li style="color: #999; padding: 6px 0;">杈撳叆鍏抽敭璇嶆悳绱㈡涔?..</li>';
        return;
    }

    if (results.length === 0) {
        listEl.innerHTML = `<li style="color: #999; padding: 6px 0;">鏈壘鍒板尮閰?${keyword}"鐨勬涔?/li>`;
        return;
    }

    listEl.innerHTML = '';
    const countInfo = document.createElement('li');
    countInfo.style.cssText = 'color: #666; padding: 4px 0; font-size: 11px; border-bottom: 1px solid #eee;';
    countInfo.textContent = `鎵惧埌 ${results.length} 鏈涔;
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
                ${b.qcount}棰?路 ${b.username}${descSnippet ? ' 路 ' + descSnippet : ''}
            </div>
        `;
        listEl.appendChild(li);
    });

    if (results.length > maxShow) {
        const more = document.createElement('li');
        more.style.cssText = 'color: #999; padding: 4px 0; font-size: 11px; text-align: center;';
        more.textContent = `杩樻湁 ${results.length - maxShow} 鏈湭鏄剧ず锛岃杈撳叆鏇寸簿纭殑鍏抽敭璇峘;
        listEl.appendChild(more);
    }
}


// ==========================================
// 3. 鏁版嵁澶勭悊閫昏緫
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
    console.log("銆愬姪鎵嬨€戞潵婧?", event.data.source, "| 缁撴灉:", answerResult, "| 鏂扮粨鏋?", isNewResult);

    // 鏇存柊妫嬩功涓婁笅鏂?
    if (event.data.bookContext) {
        bookContext = event.data.bookContext;
        console.log("銆愭涔︺€戜笂涓嬫枃:", bookContext.bookName, '绔犺妭', bookContext.chapterId, '棰?, bookContext.qid);
        // 鑷姩鍒濆鍖栨涔︾粌涔狅紙濡傛灉鍦ㄦ涔︽ā寮忎腑锛?
        if (helperMode === 'book' && isOnBookQuestionPage() && bookChapterQs.length === 0) {
            initBookPractice();
        }
    }
    
    // 濡傛灉鍒囬浜嗭紝閲嶆柊鑾峰彇鍘嗗彶璁板綍
    if (currentProblemData && currentProblemData.publicid !== currentProblemId) {
        currentProblemId = currentProblemData.publicid;
        currentProblemHistory = await getProblemHistory(currentProblemId);
    }

    const incomingResult = (answerResult === null || answerResult === undefined) ? 0 : answerResult;

    if (helperMode === 'book' && isOnBookQuestionPage() && currentProblemId) {
        // 妫嬩功缁冧範妯″紡锛氱粨鏋滈攣瀛樺埌妫嬩功杩涘害
        const state = ensurePracticeState(currentProblemId, currentProblemData);
        if (state && !state.locked) {
            if (incomingResult === 1 || incomingResult === 2) {
                await lockPracticeResult(currentProblemId, incomingResult, 'result');
                recordBookResult(currentProblemId, incomingResult, 'result');
            } else {
                await checkPracticeTimeoutForCurrent();
                // 瓒呮椂涔熷綍鍏ユ涔﹁繘搴?
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
        // 娴忚妯″紡涓嶅啓閿欓缁熻
        currentDisplayResult = incomingResult;
        currentCountdownSec = null;
    }

    updateUI(currentDisplayResult);
});

if (!practiceTimerHandle) {
    practiceTimerHandle = setInterval(async () => {
        if (helperMode === 'practice' || helperMode === 'book') {
            await checkPracticeTimeoutForCurrent();
            // 妫嬩功妯″紡涓嬭秴鏃朵篃瑕佸綍鍏ユ涔﹁繘搴?
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
// 4. UI 鏇存柊鍑芥暟
// ==========================================
function updateFloatingTimer(finalResult) {
    let timerEl = document.getElementById('helper-floating-timer');
    if (!timerEl) {
        timerEl = document.createElement('div');
        timerEl.id = 'helper-floating-timer';
        timerEl.innerHTML = '<span class="time-label">剩余</span><span id="helper-floating-timer-val" class="time-value">--</span><span class="time-unit">s</span>';
        document.body.appendChild(timerEl);
    }
    if ((helperMode === 'practice' || helperMode === 'book') && currentCountdownSec !== null && finalResult === 0) {
        timerEl.style.display = 'flex';
        const valEl = document.getElementById('helper-floating-timer-val');
        if (valEl) valEl.textContent = Math.max(0, currentCountdownSec);
        if (currentCountdownSec <= 10) {
            timerEl.classList.add('warning');
        } else {
            timerEl.classList.remove('warning');
        }
    } else {
        timerEl.style.display = 'none';
    }
}

function updateUI(answerResult) {
    const statusDiv = document.getElementById('helper-status');
    if (!statusDiv || !currentProblemData) return;

    const modeLabels = { browse: '馃憖 娴忚妯″紡', practice: '馃摑 鍋氶妯″紡', book: '馃摌 妫嬩功缁冧範' };
    const finalResult = (answerResult === null || answerResult === undefined) ? 0 : answerResult;
    const toneClass = finalResult === 1 ? 'is-success' : finalResult === 2 ? 'is-fail' : 'is-pending';
    const resultText = finalResult === 1 ? '鉁?鏈宸查€氳繃' : finalResult === 2 ? '鉂?鏈鏈€氳繃' : '鈴?灏氭湭浣滅瓟';
    const historyText = currentProblemHistory
        ? `${currentProblemHistory.correctCount || 0} 瀵?/ ${currentProblemHistory.errorCount || 0} 閿檂
        : '鍒濇鎸戞垬';

    statusDiv.className = `helper-info-block status-card ${toneClass}`;

    let statusHtml = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <div style="font-size: 16px; font-weight: 900; color: #0f172a; display: flex; align-items: center; gap: 6px;">
                <span>${resultText}</span>
            </div>
            <div class="status-card-meta-row" style="margin-top: 0; gap: 4px;">
                <span class="status-meta-pill" style="font-size:10px; padding:2px 6px;">Q-${currentProblemData.publicid || '?'}</span>
                <span class="status-meta-pill" style="font-size:10px; padding:2px 6px;">${currentProblemData.levelname || '鏈煡'}</span>
            </div>
        </div>
    `;

    if (helperMode === 'practice' || helperMode === 'book') {
        const countdown = (currentCountdownSec === null) ? '--:--' : formatCountdown(currentCountdownSec);
        const countdownClass = (currentCountdownSec !== null && currentCountdownSec <= 10) ? 'color: #b91c1c; font-weight:bold;' : 'color: #0f172a;';
        statusHtml += `
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; padding-top: 8px; border-top: 1px dashed rgba(0,0,0,0.1);">
                <div style="${countdownClass}">
                    <span>鈴?娴嬮獙: ${practiceTimeLimitSec}s</span>
                    <strong style="margin-left:4px;">鍓?${countdown}</strong>
                </div>
                <div style="color: #475569;">馃摎 鍘嗗彶锛?{historyText}</div>
            </div>
        `;
    } else {
        statusHtml += `
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 11px; padding-top: 8px; border-top: 1px dashed rgba(0,0,0,0.1);">
                <div style="color: #475569;">馃摎 鍘嗗彶锛?{historyText}</div>
            </div>
        `;
    }

    statusDiv.innerHTML = statusHtml;

    const headerBadge = document.getElementById('header-mode-badge');
    if (headerBadge) headerBadge.textContent = modeLabels[helperMode] || helperMode;
    const settingsHint = document.getElementById('settings-section-hint');
    if (settingsHint) settingsHint.textContent = `${modeLabels[helperMode] || helperMode} 路 ${practiceTimeLimitSec}s`;

    // 妫嬩功缁冧範鍖烘覆鏌?
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
                infoEl.textContent = `馃摌 ${bookContext.bookName || '妫嬩功'} / ${bookContext.chapterName || '绔犺妭'} 鈥?绗?{pos.current}/${pos.total}棰榒;
            }
            if (statsEl) statsEl.textContent = getBookStatsText();
            if (progressFill && progressText && bookProgress) {
                const pct = bookProgress.stats.total > 0 ? Math.round((bookProgress.stats.done / bookProgress.stats.total) * 100) : 0;
                progressFill.style.width = pct + '%';
                progressText.textContent = `杩涘害 ${pct}%锛?{bookProgress.stats.done}/${bookProgress.stats.total}锛塦;
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
