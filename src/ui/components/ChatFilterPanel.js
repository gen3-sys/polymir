/**
 * POLYMIR CHAT FILTER PANEL
 * =========================
 * Client-side GUI component for managing chat filter settings
 * Works with the server's chat filter via WebSocket
 */

export class ChatFilterPanel {
    constructor(container, wsAdapter) {
        this.container = typeof container === 'string'
            ? document.querySelector(container)
            : container;
        this.wsAdapter = wsAdapter;
        this.config = null;
        this.words = null;
        this.isVisible = false;

        this.createPanel();
        this.setupMessageHandlers();
    }

    createPanel() {
        this.panel = document.createElement('div');
        this.panel.className = 'chat-filter-panel';
        this.panel.innerHTML = `
            <div class="cfp-header">
                <h4>Chat Filter Settings</h4>
                <button class="cfp-close">&times;</button>
            </div>

            <div class="cfp-section">
                <label class="cfp-toggle">
                    <input type="checkbox" id="cfp-enabled" checked>
                    <span>Filter Enabled</span>
                </label>
            </div>

            <div class="cfp-section">
                <h5>Filter Mode</h5>
                <div class="cfp-modes">
                    <label class="cfp-mode">
                        <input type="radio" name="cfp-mode" value="censor" checked>
                        <span>Censor with ***</span>
                        <small>Replace bad words with asterisks</small>
                    </label>
                    <label class="cfp-mode">
                        <input type="radio" name="cfp-mode" value="reveal">
                        <span>Click to Reveal</span>
                        <small>Hide message until clicked (spoiler style)</small>
                    </label>
                    <label class="cfp-mode">
                        <input type="radio" name="cfp-mode" value="hide">
                        <span>Hide Completely</span>
                        <small>Don't show message at all</small>
                    </label>
                </div>
            </div>

            <div class="cfp-section">
                <h5>Custom Words/Phrases</h5>
                <p class="cfp-hint">Add words, phrases (with spaces), or wildcards (use * for any characters)</p>
                <div class="cfp-add-word">
                    <input type="text" id="cfp-new-word" placeholder="Add word, phrase, or pattern...">
                    <button id="cfp-add-btn">Add</button>
                </div>
                <div class="cfp-word-list" id="cfp-custom-words"></div>
            </div>

            <div class="cfp-section">
                <h5>Whitelisted (Never Filter)</h5>
                <div class="cfp-word-list cfp-whitelist" id="cfp-whitelisted"></div>
            </div>

            <div class="cfp-section">
                <h5>Test Filter</h5>
                <div class="cfp-test">
                    <input type="text" id="cfp-test-input" placeholder="Type to test filter...">
                    <div id="cfp-test-result"></div>
                </div>
            </div>

            <div class="cfp-stats">
                <span>Total filtered entries: <strong id="cfp-count">0</strong></span>
            </div>
        `;

        // Add styles
        if (!document.getElementById('cfp-styles')) {
            const style = document.createElement('style');
            style.id = 'cfp-styles';
            style.textContent = this.getStyles();
            document.head.appendChild(style);
        }

        this.container.appendChild(this.panel);
        this.setupEventListeners();
    }

    getStyles() {
        return `
            .chat-filter-panel {
                display: none;
                position: absolute;
                background: rgba(0, 0, 0, 0.95);
                border: 2px solid #0f0;
                width: 320px;
                max-height: 500px;
                overflow-y: auto;
                font-family: 'Courier New', monospace;
                font-size: 12px;
                color: #0f0;
                z-index: 100;
            }
            .chat-filter-panel.visible { display: block; }
            .cfp-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px;
                background: rgba(0, 50, 0, 0.5);
                border-bottom: 1px solid #0f0;
            }
            .cfp-header h4 { margin: 0; color: #0ff; font-size: 14px; }
            .cfp-close {
                background: transparent;
                border: none;
                color: #0f0;
                font-size: 20px;
                cursor: pointer;
                padding: 0 5px;
            }
            .cfp-close:hover { color: #f00; }
            .cfp-section {
                padding: 10px;
                border-bottom: 1px solid rgba(0, 255, 0, 0.2);
            }
            .cfp-section h5 {
                margin: 0 0 8px 0;
                color: #ff0;
                font-size: 12px;
            }
            .cfp-toggle {
                display: flex;
                align-items: center;
                cursor: pointer;
            }
            .cfp-toggle input { margin-right: 8px; accent-color: #0f0; }
            .cfp-modes { display: flex; flex-direction: column; gap: 8px; }
            .cfp-mode {
                display: flex;
                flex-direction: column;
                padding: 8px;
                background: rgba(0, 0, 0, 0.3);
                border: 1px solid rgba(0, 255, 0, 0.3);
                cursor: pointer;
            }
            .cfp-mode:hover { border-color: #0f0; }
            .cfp-mode input { margin-right: 8px; accent-color: #0f0; }
            .cfp-mode span { display: flex; align-items: center; }
            .cfp-mode small { color: #888; font-size: 10px; margin-top: 4px; margin-left: 20px; }
            .cfp-hint { color: #888; font-size: 10px; margin: 0 0 8px 0; }
            .cfp-add-word {
                display: flex;
                gap: 5px;
                margin-bottom: 8px;
            }
            .cfp-add-word input {
                flex: 1;
                background: #000;
                border: 1px solid #0f0;
                color: #0f0;
                padding: 6px;
                font-family: inherit;
                font-size: 11px;
            }
            .cfp-add-word input:focus { outline: none; border-color: #0ff; }
            .cfp-add-word button {
                background: #0f0;
                color: #000;
                border: none;
                padding: 6px 12px;
                cursor: pointer;
                font-family: inherit;
                font-weight: bold;
            }
            .cfp-add-word button:hover { background: #0c0; }
            .cfp-word-list {
                display: flex;
                flex-wrap: wrap;
                gap: 4px;
                max-height: 100px;
                overflow-y: auto;
                padding: 5px;
                background: rgba(0, 0, 0, 0.3);
                min-height: 30px;
            }
            .cfp-word {
                display: inline-flex;
                align-items: center;
                background: #300;
                color: #f88;
                padding: 3px 8px;
                border-radius: 3px;
                font-size: 10px;
                cursor: pointer;
            }
            .cfp-word:hover { background: #500; }
            .cfp-word .remove {
                margin-left: 6px;
                color: #f00;
                font-weight: bold;
            }
            .cfp-whitelist .cfp-word {
                background: #030;
                color: #8f8;
            }
            .cfp-whitelist .cfp-word:hover { background: #050; }
            .cfp-test input {
                width: 100%;
                background: #000;
                border: 1px solid #0f0;
                color: #0f0;
                padding: 6px;
                font-family: inherit;
                font-size: 11px;
                box-sizing: border-box;
            }
            .cfp-test input:focus { outline: none; border-color: #0ff; }
            #cfp-test-result {
                margin-top: 5px;
                padding: 5px;
                background: rgba(0, 0, 0, 0.3);
                min-height: 20px;
                font-size: 11px;
            }
            .cfp-test-filtered { color: #f80; }
            .cfp-test-clean { color: #0f0; }
            .cfp-test-hidden { color: #f00; }
            .cfp-stats {
                padding: 8px 10px;
                background: rgba(0, 50, 0, 0.3);
                font-size: 11px;
            }
            .cfp-stats strong { color: #ff0; }
        `;
    }

    setupEventListeners() {
        // Close button
        this.panel.querySelector('.cfp-close').onclick = () => this.hide();

        // Enable toggle
        this.panel.querySelector('#cfp-enabled').onchange = (e) => {
            this.setEnabled(e.target.checked);
        };

        // Mode radios
        this.panel.querySelectorAll('input[name="cfp-mode"]').forEach(radio => {
            radio.onchange = (e) => this.setMode(e.target.value);
        });

        // Add word
        const addBtn = this.panel.querySelector('#cfp-add-btn');
        const addInput = this.panel.querySelector('#cfp-new-word');

        addBtn.onclick = () => this.addWord(addInput.value);
        addInput.onkeydown = (e) => {
            if (e.key === 'Enter') this.addWord(addInput.value);
        };

        // Test input
        let testTimeout;
        this.panel.querySelector('#cfp-test-input').oninput = (e) => {
            clearTimeout(testTimeout);
            testTimeout = setTimeout(() => this.testFilter(e.target.value), 300);
        };
    }

    setupMessageHandlers() {
        if (!this.wsAdapter) return;

        this.wsAdapter.on('message', (data) => {
            switch (data.type) {
                case 'filter_config':
                    this.updateConfig(data.config);
                    break;
                case 'filter_words':
                    this.updateWords(data.words);
                    break;
                case 'filter_word_added':
                case 'filter_word_removed':
                case 'filter_word_whitelisted':
                case 'filter_mode_set':
                case 'filter_toggled':
                    this.updateConfig(data.config);
                    this.requestWords();
                    break;
                case 'filter_test_result':
                    this.showTestResult(data);
                    break;
            }
        });
    }

    show() {
        this.panel.classList.add('visible');
        this.isVisible = true;
        this.requestConfig();
        this.requestWords();
    }

    hide() {
        this.panel.classList.remove('visible');
        this.isVisible = false;
    }

    toggle() {
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    // Server communication
    requestConfig() {
        if (this.wsAdapter) {
            this.wsAdapter.send({ type: 'filter_get_config' });
        }
    }

    requestWords() {
        if (this.wsAdapter) {
            this.wsAdapter.send({ type: 'filter_get_words' });
        }
    }

    setEnabled(enabled) {
        if (this.wsAdapter) {
            this.wsAdapter.send({ type: 'filter_toggle', enabled });
        }
    }

    setMode(mode) {
        if (this.wsAdapter) {
            this.wsAdapter.send({ type: 'filter_set_mode', mode });
        }
    }

    addWord(word) {
        if (!word || !word.trim()) return;
        if (this.wsAdapter) {
            this.wsAdapter.send({ type: 'filter_add_word', word: word.trim() });
        }
        this.panel.querySelector('#cfp-new-word').value = '';
    }

    removeWord(word) {
        if (this.wsAdapter) {
            this.wsAdapter.send({ type: 'filter_remove_word', word });
        }
    }

    whitelistWord(word) {
        if (this.wsAdapter) {
            this.wsAdapter.send({ type: 'filter_whitelist_word', word });
        }
    }

    testFilter(text) {
        if (!text || !text.trim()) {
            this.panel.querySelector('#cfp-test-result').innerHTML = '';
            return;
        }
        if (this.wsAdapter) {
            this.wsAdapter.send({ type: 'filter_test', text });
        }
    }

    // UI updates
    updateConfig(config) {
        this.config = config;

        // Update enabled checkbox
        this.panel.querySelector('#cfp-enabled').checked = config.enabled;

        // Update mode radios
        const modeRadio = this.panel.querySelector(`input[name="cfp-mode"][value="${config.mode}"]`);
        if (modeRadio) modeRadio.checked = true;

        // Update count
        this.panel.querySelector('#cfp-count').textContent = config.entryCount || 0;
    }

    updateWords(words) {
        this.words = words;

        // Update custom words list
        const customContainer = this.panel.querySelector('#cfp-custom-words');
        customContainer.innerHTML = words.custom.map(word => `
            <span class="cfp-word" title="Click to remove, Shift+Click to whitelist">
                ${this.escapeHtml(word)}
                <span class="remove">&times;</span>
            </span>
        `).join('');

        // Add click handlers
        customContainer.querySelectorAll('.cfp-word').forEach((el, i) => {
            el.onclick = (e) => {
                const word = words.custom[i];
                if (e.shiftKey) {
                    this.whitelistWord(word);
                } else {
                    this.removeWord(word);
                }
            };
        });

        // Update whitelist
        const whitelistContainer = this.panel.querySelector('#cfp-whitelisted');
        whitelistContainer.innerHTML = words.whitelisted.map(word => `
            <span class="cfp-word" title="Click to remove from whitelist">
                ${this.escapeHtml(word)}
                <span class="remove">&times;</span>
            </span>
        `).join('');

        whitelistContainer.querySelectorAll('.cfp-word').forEach((el, i) => {
            el.onclick = () => {
                // Remove from whitelist (not implemented in server yet, would need unwhitelist)
                // For now, just show info
                console.log('Would remove from whitelist:', words.whitelisted[i]);
            };
        });
    }

    showTestResult(result) {
        const container = this.panel.querySelector('#cfp-test-result');

        if (result.hidden) {
            container.innerHTML = `<span class="cfp-test-hidden">[MESSAGE WOULD BE HIDDEN]</span>`;
        } else if (result.wasFiltered) {
            container.innerHTML = `
                <span class="cfp-test-filtered">${this.escapeHtml(result.filtered)}</span>
                <br><small>Matched: ${result.matches.map(m => m.entry || m).join(', ')}</small>
            `;
        } else {
            container.innerHTML = `<span class="cfp-test-clean">${this.escapeHtml(result.original)} (clean)</span>`;
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    setPosition(x, y) {
        this.panel.style.left = x + 'px';
        this.panel.style.top = y + 'px';
    }

    setWebSocket(wsAdapter) {
        this.wsAdapter = wsAdapter;
        this.setupMessageHandlers();
    }
}

export default ChatFilterPanel;
