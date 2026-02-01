// State
let selectedFiles = [];
let apiKey = '';
let storeName = ''; // Selected store name (from stores list)
let stores = []; // List of all available stores
let selectedStore = null; // Currently selected store object
let allowedExtensions = new Set(['.pdf', '.md']);
let documents = [];
let nextPageToken = null; // Token for loading next page
let currentDeleteDocument = null;
let isAuthenticated = false;
let authState = 'checking'; // 'checking', 'first-entry', 'pin-entry', 'authenticated', 'store-selection'

// API Base URL
const API_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// Encryption/Decryption - runs in Web Worker to prevent UI freeze
let _cryptoWorker = null;
let _cryptoPromises = {};

function getCryptoWorker() {
    if (_cryptoWorker) return _cryptoWorker;
    try {
        _cryptoWorker = new Worker('crypto-worker.js');
        _cryptoWorker.onmessage = (e) => {
            const { id, result, error } = e.data;
            if (_cryptoPromises[id]) {
                if (error) _cryptoPromises[id].reject(new Error(error));
                else _cryptoPromises[id].resolve(result);
                delete _cryptoPromises[id];
            }
        };
    } catch (err) {
        console.warn('Web Worker not available, using sync crypto (may freeze UI)');
    }
    return _cryptoWorker;
}

function cryptoWorkerEncrypt(text, pin, apiKey) {
    const worker = getCryptoWorker();
    if (!worker) return Promise.resolve(simpleEncryptSync(text, pin, apiKey));
    const id = 'enc-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    return new Promise((resolve, reject) => {
        _cryptoPromises[id] = { resolve, reject };
        worker.postMessage({ id, action: 'encrypt', params: { text, pin, apiKey } });
    });
}

function cryptoWorkerDecrypt(encryptedHex, pin, apiKey) {
    const worker = getCryptoWorker();
    if (!worker) return Promise.resolve(simpleDecryptSync(encryptedHex, pin, apiKey));
    const id = 'dec-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    return new Promise((resolve, reject) => {
        _cryptoPromises[id] = { resolve, reject };
        worker.postMessage({ id, action: 'decrypt', params: { encryptedHex, pin, apiKey } });
    });
}

// Sync fallback (blocks main thread)
function deriveKeyFromPIN(pin) {
    let key = pin;
    for (let i = 0; i < 1000; i++) {
        key = btoa(key).replace(/[^A-Za-z0-9]/g, '');
    }
    return key.substring(0, 32).padEnd(32, '0');
}

function simpleEncryptSync(text, pin, apiKey) {
    const combinedKey = pin + (apiKey || '');
    const keyStr = deriveKeyFromPIN(combinedKey);
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        const keyChar = keyStr.charCodeAt(i % keyStr.length);
        result += String.fromCharCode(charCode ^ keyChar);
    }
    return Array.from(result).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

function simpleDecryptSync(encryptedHex, pin, apiKey) {
    const combinedKey = pin + (apiKey || '');
    const keyStr = deriveKeyFromPIN(combinedKey);
    let text = '';
    for (let i = 0; i < encryptedHex.length; i += 2) {
        text += String.fromCharCode(parseInt(encryptedHex.substr(i, 2), 16));
    }
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        const keyChar = keyStr.charCodeAt(i % keyStr.length);
        result += String.fromCharCode(charCode ^ keyChar);
    }
    return result;
}

// decodeApiKey function removed - no longer using base64 or Haguvi_Multichannel encoding

async function validateApiKey(key) {
    // Test the API key by making a simple request
    try {
        // Use a minimal test endpoint - we'll test with storeName if available
        // For now, just check if it's a valid format (non-empty string)
        if (!key || key.trim().length === 0) {
            return false;
        }
        // Additional validation can be added here
        return true;
    } catch (error) {
        return false;
    }
}

// DOM Elements
const storeNameInput = document.getElementById('storeName');
const selectFilesBtn = document.getElementById('selectFilesBtn');
const uploadBtn = document.getElementById('uploadBtn');
const clearBtn = document.getElementById('clearBtn');
const fileList = document.getElementById('fileList');
const statusSection = document.getElementById('statusSection');
const statusList = document.getElementById('statusList');
const fileInput = document.getElementById('fileInput');
const refreshBtn = document.getElementById('refreshBtn');
const documentsContainer = document.getElementById('documentsContainer');
const paginationControls = document.getElementById('paginationControls');
const loadMoreBtn = document.getElementById('loadMoreBtn');
const confirmModal = document.getElementById('confirmModal');
const confirmMessage = document.getElementById('confirmMessage');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const confirmCancelBtn = document.getElementById('confirmCancelBtn');
const documentCount = document.getElementById('documentCount');
const pinModal = document.getElementById('pinModal');
const pinInput = document.getElementById('pinInput');
const pinConfirmInput = document.getElementById('pinConfirmInput');
const pinSubmitBtn = document.getElementById('pinSubmitBtn');
const pinCancelBtn = document.getElementById('pinCancelBtn');
const pinMessage = document.getElementById('pinMessage');
const pinTitle = document.getElementById('pinTitle');

// Loading overlay helpers
function showLoadingOverlay(text) {
    const overlay = document.getElementById('loadingOverlay');
    const textEl = document.getElementById('loadingOverlayText');
    if (overlay) overlay.style.display = 'flex';
    if (textEl) textEl.textContent = text || 'טוען...';
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

// Initialize
function init() {
    console.log('=== Initialization Debug ===');
    console.log('DOM readyState:', document.readyState);
    
    // Check all critical elements
    const elements = {
        storeNameInput,
        selectFilesBtn,
        uploadBtn,
        clearBtn,
        fileList,
        statusSection,
        statusList,
        fileInput,
        refreshBtn,
        documentsContainer,
        paginationControls,
        loadMoreBtn,
        confirmModal,
        confirmMessage,
        confirmDeleteBtn,
        confirmCancelBtn,
        documentCount,
        pinModal,
        pinInput,
        pinConfirmInput,
        pinSubmitBtn,
        pinCancelBtn
    };
    
    console.log('Element check:');
    for (const [name, element] of Object.entries(elements)) {
        if (!element) {
            console.error(`❌ ${name} is NULL`);
        } else {
            console.log(`✅ ${name} found`);
        }
    }
    
    console.log('Initial nextPageToken:', nextPageToken);
    console.log('=========================');
    
    // Check authentication state first
    checkAuthState();

    // Event listeners (with null checks)
    // Store name input removed - stores are selected from list
    // File types are always .pdf and .md - no need for input handler
    if (selectFilesBtn && fileInput) selectFilesBtn.addEventListener('click', () => fileInput.click());
    if (fileInput) fileInput.addEventListener('change', handleFileSelect);
    if (uploadBtn) uploadBtn.addEventListener('click', handleUpload);
    if (clearBtn) clearBtn.addEventListener('click', handleClear);
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            console.log('Refresh button clicked');
            loadDocuments(true);
        });
    }
    
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', () => {
            console.log('Load More button clicked, current nextPageToken:', nextPageToken);
            loadDocuments(false);
        });
    } else {
        console.error('ERROR: loadMoreBtn element not found! Check HTML for id="loadMoreBtn"');
    }
    
    if (confirmDeleteBtn) confirmDeleteBtn.addEventListener('click', handleConfirmDelete);
    if (confirmCancelBtn) confirmCancelBtn.addEventListener('click', hideConfirmModal);
    
    if (pinSubmitBtn) pinSubmitBtn.addEventListener('click', handlePinSubmit);
    if (pinCancelBtn) pinCancelBtn.addEventListener('click', hidePinModal);
    
    // Close modals on overlay click
    if (confirmModal) {
        confirmModal.addEventListener('click', (e) => {
            if (e.target === confirmModal || e.target.classList.contains('modal-overlay')) {
                hideConfirmModal();
            }
        });
    }
    
    if (pinModal) {
        pinModal.addEventListener('click', (e) => {
            if (e.target === pinModal || e.target.classList.contains('modal-overlay')) {
                hidePinModal();
            }
        });
    }
    
    // PIN input restrictions
    if (pinInput) {
        pinInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handlePinSubmit();
            }
        });
    }
    
    if (pinConfirmInput) {
        pinConfirmInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.replace(/\D/g, '').substring(0, 4);
        });
        pinConfirmInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handlePinSubmit();
            }
        });
    }
    
    const pinStoreNameInput = document.getElementById('pinStoreNameInput');
    if (pinStoreNameInput) {
        pinStoreNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handlePinSubmit();
            }
        });
    }
}

// Authentication Management
function checkAuthState() {
    const encryptedData = localStorage.getItem('gemini-encrypted');
    console.log('Checking auth state, encrypted data exists:', !!encryptedData);
    if (!encryptedData) {
        // First time user
        authState = 'first-entry';
        showFirstEntryUI();
        return;
    }
    
    // Returning user - show PIN entry
    authState = 'pin-entry';
    showPinEntryUI();
}

function showFirstEntryUI() {
    // Hide main content until authenticated
    const configSection = document.querySelector('.config-section');
    const documentsSection = document.querySelector('.documents-section');
    const fileSection = document.querySelector('.file-section');
    
    if (configSection) configSection.style.display = 'none';
    if (documentsSection) documentsSection.style.display = 'none';
    if (fileSection) fileSection.style.display = 'none';
    
    // Show first entry message
    showFirstEntryMessage();
}

function showFirstEntryMessage() {
    const container = document.querySelector('.container');
    let messageDiv = document.getElementById('firstEntryMessage');
    
    if (!messageDiv) {
        messageDiv = document.createElement('div');
        messageDiv.id = 'firstEntryMessage';
        messageDiv.className = 'first-entry-message';
        messageDiv.innerHTML = `
            <div class="first-entry-card">
                <h2>ברוכים הבאים!</h2>
                <p>הזן את מפתח ה-API שלך:</p>
                <div class="form-group" style="max-width: 600px; margin: 2rem auto;">
                    <label for="firstEntryApiKey" style="display: block; margin-bottom: 0.5rem; text-align: right;">מפתח API</label>
                    <input type="text" id="firstEntryApiKey" placeholder="הזן את מפתח ה-API" autocomplete="off" style="text-align: center; font-family: monospace; width: 100%; padding: 0.875rem 1rem; background: var(--bg-tertiary); border: 2px solid var(--border); border-radius: 0.5rem; color: var(--text-primary); font-size: 1rem; margin-bottom: 1rem;">
                    <button class="btn btn-primary" onclick="handleFirstEntry()" style="margin-top: 1rem; width: 100%;">
                        המשך
                    </button>
                </div>
            </div>
        `;
        container.insertBefore(messageDiv, container.firstChild);
        
        // Add enter key listener
        const firstEntryInput = document.getElementById('firstEntryApiKey');
        if (firstEntryInput) {
            firstEntryInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    handleFirstEntry();
                }
            });
        }
    }
}

function showPinEntryUI() {
    // Hide main content
    const configSection = document.querySelector('.config-section');
    const documentsSection = document.querySelector('.documents-section');
    const fileSection = document.querySelector('.file-section');
    
    if (configSection) configSection.style.display = 'none';
    if (documentsSection) documentsSection.style.display = 'none';
    if (fileSection) fileSection.style.display = 'none';
    
    // Always show login modal
    console.log('Showing PIN entry UI, calling showPinModal...');
    showPinModal('login');
}

function showAuthenticatedUI() {
    // Hide first entry message
    const messageDiv = document.getElementById('firstEntryMessage');
    if (messageDiv) messageDiv.remove();
    
    // Hide main sections until store is selected
    const configSection = document.querySelector('.config-section');
    const documentsSection = document.querySelector('.documents-section');
    const fileSection = document.querySelector('.file-section');
    
    if (configSection) configSection.style.display = 'none';
    if (documentsSection) documentsSection.style.display = 'none';
    if (fileSection) fileSection.style.display = 'none';
    
    // Add logout button to header if not exists
    let logoutBtn = document.getElementById('logoutBtn');
    if (!logoutBtn) {
        const header = document.querySelector('.header-content');
        if (header) {
            logoutBtn = document.createElement('button');
            logoutBtn.id = 'logoutBtn';
            logoutBtn.className = 'btn btn-secondary';
            logoutBtn.style.marginTop = '1rem';
            logoutBtn.innerHTML = `
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width: 1rem; height: 1rem;">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                התנתק
            `;
            logoutBtn.addEventListener('click', handleLogout);
            header.appendChild(logoutBtn);
        }
    }
    
    // Load config
    loadConfig();
}

function handleLogout() {
    if (confirm('האם אתה בטוח שברצונך להתנתק? תצטרך להזין את ה-PIN שוב.')) {
        // Clear authentication
        isAuthenticated = false;
        apiKey = '';
        authState = 'pin-entry';
        
        // Clear selected store
        selectedStore = null;
        storeName = '';
        stores = [];
        
        // Show PIN entry again
        showPinEntryUI();
        
        // Remove logout button
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) logoutBtn.remove();
    }
}

async function handleFirstEntry() {
    const apiKeyInput = document.getElementById('firstEntryApiKey');
    const continueBtn = apiKeyInput?.closest('.first-entry-card')?.querySelector('button');
    
    if (!apiKeyInput) return;
    
    const enteredApiKey = apiKeyInput.value.trim();
    
    if (!enteredApiKey) {
        showNotification('אנא הזן את הקוד שלך', 'error');
        apiKeyInput.focus();
        return;
    }
    
    showLoadingOverlay('בודק קוד...');
    try {
        const isValid = await validateApiKey(enteredApiKey);
        if (!isValid) {
            showNotification('מפתח API לא תקין. אנא ודא שמפתח ה-API שהוזן נכון', 'error');
            apiKeyInput.value = '';
            apiKeyInput.focus();
            return;
        }
        apiKey = enteredApiKey;
        showPinModal('setup');
    } catch (e) {
        showNotification('שגיאה באימות: ' + (e.message || 'נסה שוב'), 'error');
    } finally {
        hideLoadingOverlay();
    }
}

function showPinModal(mode) {
    // mode: 'setup' or 'login'
    if (!pinModal) {
        console.error('PIN modal not found!');
        return;
    }
    
    if (pinInput) pinInput.value = '';
    if (pinConfirmInput) pinConfirmInput.value = '';
    
    const pinConfirmGroup = document.getElementById('pinConfirmGroup');
    const pinStoreNameGroup = document.getElementById('pinStoreNameGroup');
    const pinStoreNameInput = document.getElementById('pinStoreNameInput');
    
    if (mode === 'setup') {
        if (pinTitle) pinTitle.textContent = 'הגדר קוד PIN';
        if (pinMessage) pinMessage.textContent = 'בחר קוד PIN בן 4 ספרות לשימוש בעתיד';
        if (pinConfirmGroup) pinConfirmGroup.style.display = 'block';
        if (pinStoreNameGroup) pinStoreNameGroup.style.display = 'none';
        if (pinInput) {
            pinInput.placeholder = 'הזן 4 ספרות';
            pinInput.maxLength = '4';
        }
        if (pinConfirmInput) pinConfirmInput.placeholder = 'אשר את ה-PIN';
        const apiKeyInput = document.getElementById('firstEntryApiKey');
        if (apiKeyInput) {
            apiKeyInput.type = 'password';
            apiKeyInput.disabled = true;
        }
    } else {
        if (pinTitle) pinTitle.textContent = 'התחברות';
        if (pinMessage) pinMessage.textContent = 'הזן את קוד ה-PIN כדי להמשיך';
        if (pinConfirmGroup) pinConfirmGroup.style.display = 'none';
        if (pinInput) {
            pinInput.placeholder = 'הזן 4 ספרות';
            pinInput.maxLength = '4';
        }
    }
    
    pinModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    if (pinInput) pinInput.focus();
}

function hidePinModal() {
    if (!pinModal) return;
    pinModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    if (pinInput) pinInput.value = '';
    if (pinConfirmInput) pinConfirmInput.value = '';
    const apiKeyInput = document.getElementById('firstEntryApiKey');
    if (apiKeyInput) {
        apiKeyInput.type = 'text';
        apiKeyInput.disabled = false;
    }
    restorePinButton();
}

function restorePinButton() {
    if (pinSubmitBtn && pinSubmitBtn.dataset.originalText) {
        pinSubmitBtn.innerHTML = pinSubmitBtn.dataset.originalText;
        pinSubmitBtn.disabled = false;
        delete pinSubmitBtn.dataset.originalText;
    }
}

function showPinLoading() {
    if (pinSubmitBtn) {
        pinSubmitBtn.disabled = true;
        const originalText = pinSubmitBtn.innerHTML;
        pinSubmitBtn.innerHTML = `
            <svg class="spinner" viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width: 1.25rem; height: 1.25rem; animation: spin 1s linear infinite;">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            טוען...
        `;
        pinSubmitBtn.dataset.originalText = originalText;
    }
}

async function handlePinSubmit() {
    const pinInputValue = pinInput ? pinInput.value.trim() : '';
    
    // Check if this is setup or login
    const pinConfirmGroup = document.getElementById('pinConfirmGroup');
    const pinStoreNameInput = document.getElementById('pinStoreNameInput');
    const isSetup = pinConfirmGroup && pinConfirmGroup.style.display !== 'none';
    
    // Validate inputs before showing loading
    if (isSetup) {
        // Setup mode - validate PIN format
        if (!pinInputValue || pinInputValue.length !== 4 || !/^\d{4}$/.test(pinInputValue)) {
            showNotification('אנא הזן קוד PIN בן 4 ספרות בלבד', 'error');
            if (pinInput) pinInput.focus();
            return;
        }
        
        const pinConfirm = pinConfirmInput ? pinConfirmInput.value.trim() : '';
        if (!pinConfirm) {
            showNotification('אנא אשר את קוד ה-PIN', 'error');
            if (pinConfirmInput) pinConfirmInput.focus();
            return;
        }
        
        if (pinInputValue !== pinConfirm) {
            showNotification('קוד ה-PIN לא תואם. אנא הזן אותו שוב', 'error');
            if (pinConfirmInput) {
                pinConfirmInput.value = '';
                pinConfirmInput.focus();
            }
            return;
        }
    } else {
        // Login mode - validate inputs
        if (!pinInputValue) {
            showNotification('אנא הזן את קוד ה-PIN', 'error');
            if (pinInput) pinInput.focus();
            return;
        }
    }
    
    showPinLoading();
    await new Promise(r => setTimeout(r, 50)); // Let browser paint loading state
    
    const pin = pinInputValue;
    
    if (isSetup) {
        try {
            const encryptedApiKey = await cryptoWorkerEncrypt(apiKey, pin, '');
            const encryptedPin = await cryptoWorkerEncrypt(pin, pin, apiKey);
            
            localStorage.setItem('gemini-encrypted', JSON.stringify({
                apiKey: encryptedApiKey,
                pinHash: encryptedPin
            }));
            
            // Save config
            const config = {
                allowedExtensions: '.pdf, .md'
            };
            localStorage.setItem('gemini-config', JSON.stringify(config));
            
            hidePinModal();
            showNotification('ההגדרה הושלמה בהצלחה!', 'success');
            isAuthenticated = true;
            authState = 'authenticated';
            // After authentication, fetch stores and show selection
            await fetchStoresAndShowSelection();
        } catch (error) {
            showNotification('שגיאה בשמירת הנתונים: ' + error.message, 'error');
            restorePinButton();
        }
    } else {
        // Login mode
        try {
            const encryptedData = localStorage.getItem('gemini-encrypted');
            if (!encryptedData) {
                // No encrypted data - this should not happen if user has set up PIN
                // But allow direct API key entry for first-time setup
                const enteredApiKey = pinInputValue.trim();
                
                if (!enteredApiKey) {
                    showNotification('אנא הזן את מפתח ה-API', 'error');
                    if (pinInput) {
                        pinInput.value = '';
                        pinInput.focus();
                    }
                    restorePinButton();
                    return;
                }
                
                // Validate API key
                const isValid = await validateApiKey(enteredApiKey);
                if (!isValid) {
                    showNotification('מפתח API לא תקין. אנא ודא שמפתח ה-API שהוזן נכון', 'error');
                    if (pinInput) {
                        pinInput.value = '';
                        pinInput.focus();
                    }
                    restorePinButton();
                    return;
                }
                
                apiKey = enteredApiKey;
                
                // Save config
                const config = {
                    allowedExtensions: '.pdf, .md'
                };
                localStorage.setItem('gemini-config', JSON.stringify(config));
                
                hidePinModal();
                showNotification('התחברות הצליחה!', 'success');
                isAuthenticated = true;
                authState = 'authenticated';
                // After authentication, fetch stores and show selection
                await fetchStoresAndShowSelection();
                return;
            }
            
            // Has encrypted data - try to decrypt with PIN
            const data = JSON.parse(encryptedData);
            
            // Check if input is 4 digits (PIN)
            if (pinInputValue.length === 4 && /^\d{4}$/.test(pinInputValue)) {
                try {
                    const decryptedApiKey = await cryptoWorkerDecrypt(data.apiKey, pin, '');
                    
                    // Set the decrypted API key
                    apiKey = decryptedApiKey;
                    
                    // Save to config
                    const config = {
                        allowedExtensions: '.pdf, .md'
                    };
                    localStorage.setItem('gemini-config', JSON.stringify(config));
                    
                    hidePinModal();
                    showNotification('התחברות הצליחה!', 'success');
                    isAuthenticated = true;
                    authState = 'authenticated';
                    // After authentication, fetch stores and show selection
                    await fetchStoresAndShowSelection();
                    return;
                } catch (error) {
                    showNotification('קוד PIN שגוי. אנא נסה שוב', 'error');
                    if (pinInput) {
                        pinInput.value = '';
                        pinInput.focus();
                    }
                    restorePinButton();
                    return;
                }
            } else {
                // Not a 4-digit PIN
                showNotification('קוד PIN חייב להיות 4 ספרות', 'error');
                if (pinInput) {
                    pinInput.value = '';
                    pinInput.focus();
                }
                restorePinButton();
                return;
            }
        } catch (error) {
            showNotification('שגיאה בהתחברות: ' + error.message, 'error');
            if (pinInput) {
                pinInput.value = '';
                pinInput.focus();
            }
            restorePinButton();
        }
    }
}

// Store Management
async function fetchStoresAndShowSelection() {
    showLoadingOverlay('טוען רשימת מאגרים...');
    try {
        const url = `${API_BASE_URL}/fileSearchStores?key=${apiKey}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            const error = await response.text();
            throw new Error(`שגיאה בטעינת מאגרים: ${error}`);
        }
        
        const data = await response.json();
        stores = data.fileSearchStores || [];
        
        if (stores.length === 0) {
            hideLoadingOverlay();
            showNotification('לא נמצאו מאגרים', 'warning');
            return;
        }
        hideLoadingOverlay();
        const firstEntryMsg = document.getElementById('firstEntryMessage');
        if (firstEntryMsg) firstEntryMsg.remove();
        showStoreSelectionUI();
    } catch (error) {
        hideLoadingOverlay();
        console.error('Error fetching stores:', error);
        showNotification('שגיאה בטעינת מאגרים: ' + error.message, 'error');
    }
}

function showStoreSelectionUI() {
    const container = document.querySelector('.container');
    
    // Remove existing store selection if any
    let storeSelectionDiv = document.getElementById('storeSelection');
    if (storeSelectionDiv) {
        storeSelectionDiv.remove();
    }
    
    // Create store selection UI
    storeSelectionDiv = document.createElement('div');
    storeSelectionDiv.id = 'storeSelection';
    storeSelectionDiv.className = 'store-selection-section';
    storeSelectionDiv.innerHTML = `
        <div class="store-selection-card">
            <h2>בחר מאגר</h2>
            <p style="margin-bottom: 1.5rem; color: var(--text-secondary);">בחר מאגר מהרשימה להמשך עבודה</p>
            <div id="storesList" class="stores-list"></div>
        </div>
    `;
    
    // Insert after header
    const header = document.querySelector('.header');
    if (header && header.nextSibling) {
        container.insertBefore(storeSelectionDiv, header.nextSibling);
    } else {
        container.appendChild(storeSelectionDiv);
    }
    
    // Render stores list
    renderStoresList();
}

function renderStoresList() {
    const storesList = document.getElementById('storesList');
    if (!storesList) return;
    
    if (stores.length === 0) {
        storesList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>לא נמצאו מאגרים</p>
            </div>
        `;
        return;
    }
    
    storesList.innerHTML = stores.map(store => {
        const displayName = store.displayName || store.name.replace('fileSearchStores/', '');
        const docCount = store.activeDocumentsCount || '0';
        const sizeBytes = store.sizeBytes ? formatFileSize(parseInt(store.sizeBytes)) : 'לא זמין';
        const createDate = store.createTime ? new Date(store.createTime).toLocaleDateString('he-IL') : '';
        
        return `
            <div class="store-item" data-store-name="${escapeHtml(store.name)}">
                <div class="store-info">
                    <div class="store-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                    </div>
                    <div class="store-details">
                        <div class="store-name">${escapeHtml(displayName)}</div>
                        <div class="store-meta">
                            <span>${docCount} מסמכים</span>
                            <span class="store-separator">•</span>
                            <span>${sizeBytes}</span>
                            ${createDate ? `<span class="store-separator">•</span><span>${createDate}</span>` : ''}
                        </div>
                    </div>
                </div>
                <button class="btn btn-primary" onclick="selectStore('${escapeHtml(store.name)}')">
                    בחר
                </button>
            </div>
        `;
    }).join('');
}

function selectStore(storeNameParam) {
    // Find the store object
    const store = stores.find(s => s.name === storeNameParam);
    if (!store) {
        showNotification('מאגר לא נמצא', 'error');
        return;
    }
    
    selectedStore = store;
    storeName = storeNameParam;
    
    // Hide store selection
    const storeSelectionDiv = document.getElementById('storeSelection');
    if (storeSelectionDiv) {
        storeSelectionDiv.remove();
    }
    
    // Show main sections
    const configSection = document.querySelector('.config-section');
    const documentsSection = document.querySelector('.documents-section');
    const fileSection = document.querySelector('.file-section');
    
    if (configSection) configSection.style.display = 'none'; // Hide config section completely
    if (documentsSection) documentsSection.style.display = 'block';
    if (fileSection) fileSection.style.display = 'block';
    
    // Update header to show selected store
    updateHeaderWithSelectedStore();
    
    showNotification(`נבחר מאגר: ${store.displayName || store.name}`, 'success');
    
    // Load documents for selected store
    loadDocuments(true);
}

function updateHeaderWithSelectedStore() {
    const headerContent = document.querySelector('.header-content');
    if (!headerContent || !selectedStore) return;
    
    // Remove existing store indicator if any
    let storeIndicator = document.getElementById('selectedStoreIndicator');
    if (storeIndicator) {
        storeIndicator.remove();
    }
    
    // Add store indicator
    storeIndicator = document.createElement('div');
    storeIndicator.id = 'selectedStoreIndicator';
    storeIndicator.className = 'selected-store-indicator';
    storeIndicator.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" style="width: 1rem; height: 1rem;">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span>${escapeHtml(selectedStore.displayName || selectedStore.name)}</span>
        <button class="btn-link" onclick="showStoreSelectionUI()" style="margin-right: 0.5rem; font-size: 0.875rem;">
            שנה מאגר
        </button>
    `;
    
    const subtitle = headerContent.querySelector('.subtitle');
    if (subtitle) {
        headerContent.insertBefore(storeIndicator, subtitle.nextSibling);
    } else {
        headerContent.appendChild(storeIndicator);
    }
}

// Make selectStore globally accessible
window.selectStore = selectStore;
window.showStoreSelectionUI = showStoreSelectionUI;

// Configuration management
function loadConfig() {
    const saved = localStorage.getItem('gemini-config');
    if (saved) {
        try {
            const config = JSON.parse(saved);
            // File types are always .pdf and .md - no need to load
            allowedExtensions = new Set(['.pdf', '.md']);
        } catch (error) {
            console.error('Failed to load config:', error);
        }
    }
}

function saveConfig() {
    const config = {
        // Don't save API key in plain config - it's encrypted separately
        allowedExtensions: '.pdf, .md' // Always fixed
    };
    localStorage.setItem('gemini-config', JSON.stringify(config));
}

// File types are always .pdf and .md - no need for change handler
// This function is kept for compatibility but does nothing
function handleExtensionsChange() {
    allowedExtensions = new Set(['.pdf', '.md']);
    saveConfig();
}

// File selection
function handleFileSelect(event) {
    const files = Array.from(event.target.files);
    
    for (const file of files) {
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        
        // Check if extension is allowed
        if (allowedExtensions.size > 0 && !allowedExtensions.has(ext)) {
            console.log(`Skipping ${file.name} - extension ${ext} not allowed`);
            continue;
        }

        // Check if already added
        if (selectedFiles.some(f => f.file.name === file.name && f.file.size === file.size)) {
            continue;
        }

        const fileInfo = {
            file: file,
            name: file.name,
            size: file.size,
            ext: ext,
            id: generateId()
        };

        selectedFiles.push(fileInfo);
    }

    // Reset file input so same file can be selected again
    fileInput.value = '';

    renderFileList();
    updateButtons();
}

function renderFileList() {
    if (selectedFiles.length === 0) {
        fileList.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p>לא נבחרו קבצים</p>
                <p class="small">לחץ על "בחר קבצים" כדי לבחור קבצים להעלאה</p>
            </div>
        `;
        return;
    }

    fileList.innerHTML = selectedFiles.map(file => `
        <div class="file-item" data-id="${file.id}">
            <div class="file-info">
                <div class="file-icon">${file.ext.replace('.', '').toUpperCase()}</div>
                <div class="file-details">
                    <div class="file-name">${escapeHtml(file.name)}</div>
                    <div class="file-size">${formatFileSize(file.size)}</div>
                </div>
            </div>
            <button class="file-remove" onclick="removeFile('${file.id}')">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    `).join('');
}

function removeFile(id) {
    selectedFiles = selectedFiles.filter(f => f.id !== id);
    renderFileList();
    updateButtons();
}

// Make removeFile globally accessible
window.removeFile = removeFile;

function handleClear() {
    selectedFiles = [];
    renderFileList();
    updateButtons();
}

function updateButtons() {
    const hasFiles = selectedFiles.length > 0;
    uploadBtn.disabled = !hasFiles;
    clearBtn.disabled = !hasFiles;
}

// Upload functionality
async function handleUpload() {
    // API key is already loaded from encrypted storage
    if (!apiKey) {
        showNotification('אנא התחבר תחילה', 'error');
        return;
    }

    if (!storeName || !selectedStore) {
        showNotification('אנא בחר מאגר תחילה', 'error');
        showStoreSelectionUI();
        return;
    }

    if (selectedFiles.length === 0) {
        showNotification('אנא בחר קבצים להעלאה', 'error');
        return;
    }

    uploadBtn.disabled = true;
    selectFilesBtn.disabled = true;
    clearBtn.disabled = true;

    statusSection.style.display = 'block';
    statusList.innerHTML = '';
    showLoadingOverlay('מעלה קבצים...');

    let successCount = 0;
    let errorCount = 0;

    for (const file of selectedFiles) {
        const success = await uploadFile(file);
        if (success) successCount++;
        else errorCount++;
    }

    hideLoadingOverlay();
    resetUploadButtons();
    
    if (successCount > 0) {
        setTimeout(() => loadDocuments(true), 1000);
    }
    
    showNotification('סטטוס ההעלאה מוצג למטה', 'info');
}

function resetUploadButtons() {
    uploadBtn.disabled = false;
    selectFilesBtn.disabled = false;
    clearBtn.disabled = false;
}

async function uploadFile(fileInfo) {
    const statusId = `status-${fileInfo.id}`;
    
    // Add status item
    const statusItem = document.createElement('div');
    statusItem.className = 'status-item uploading';
    statusItem.id = statusId;
    statusItem.innerHTML = `
        <div class="status-header">
            <span class="status-filename">${escapeHtml(fileInfo.name)}</span>
            <span class="status-badge uploading">מעלה</span>
        </div>
        <div class="status-message">מכין קובץ...</div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: 0%"></div>
        </div>
    `;
    statusList.appendChild(statusItem);

    try {
        // Generate ASCII-safe filename
        const safeName = sanitizeFilename(fileInfo.name);
        updateStatus(statusId, 'uploading', `מעלה בשם ${safeName}...`, 10);

        // Upload file directly to the store
        const uploadResponse = await uploadFileToGemini(fileInfo.file, safeName);
        
        if (!uploadResponse.success) {
            throw new Error(uploadResponse.error);
        }

        const documentName = uploadResponse.document.name;
        updateStatus(statusId, 'uploading', 'המסמך הועלה, ממתין לעיבוד...', 50);

        // Wait for document to be processed
        const processedDoc = await waitForFileProcessing(documentName);
        
        if (!processedDoc) {
            throw new Error('זמן העיבוד תם או שהעיבוד נכשל');
        }

        updateStatus(statusId, 'success', `הועלה בהצלחה! מסמך: ${processedDoc.displayName}`, 100);
        
        // Don't add to local array here - will refresh from server after all uploads complete
        return true;
        
    } catch (error) {
        console.error(`Error uploading ${fileInfo.name}:`, error);
        let errorMessage = error.message;
        
        // Provide helpful message for CORS errors
        if (errorMessage.includes('CORS') || errorMessage.includes('Failed to fetch') || errorMessage.includes('blocked by CORS')) {
            errorMessage = 'שגיאת CORS: ייתכן שהשירות לא תומך בהעלאה ישירה מהדפדפן. נסה להשתמש בשרת proxy או בדוק את הגדרות ה-API key.';
        }
        
        updateStatus(statusId, 'error', `נכשל: ${errorMessage}`, 0);
        return false;
    }
}

async function uploadFileToGemini(file, displayName) {
    try {
        // Use proxy server to avoid CORS issues
        // The proxy server runs on the same origin, so no CORS problems
        const proxyUrl = '/api/upload-document';
        
        // Create FormData for the proxy
        const formData = new FormData();
        formData.append('file', file, displayName);
        formData.append('storeName', storeName);
        formData.append('apiKey', apiKey);
        formData.append('displayName', displayName);

        const response = await fetch(proxyUrl, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Upload failed (${response.status})`);
        }

        const result = await response.json();
        return { success: true, document: result };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function waitForFileProcessing(documentName, maxAttempts = 30) {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const response = await fetch(
                `${API_BASE_URL}/${documentName}?key=${apiKey}`
            );

            if (!response.ok) {
                throw new Error('Failed to check document status');
            }

            const doc = await response.json();

            if (doc.state === 'STATE_ACTIVE') {
                return doc;
            }

            if (doc.state === 'STATE_FAILED') {
                throw new Error('Document processing failed');
            }

            // Still processing, wait 2 seconds
            await sleep(2000);
        } catch (error) {
            console.error('Error checking document status:', error);
            await sleep(2000);
        }
    }

    return null; // Timeout
}

function updateStatus(statusId, state, message, progress = null) {
    const statusItem = document.getElementById(statusId);
    if (!statusItem) return;

    statusItem.className = `status-item ${state}`;
    
    const badge = statusItem.querySelector('.status-badge');
    badge.className = `status-badge ${state}`;
    badge.textContent = state === 'uploading' ? 'מעלה' : 
                       state === 'success' ? 'הצליח' : 'שגיאה';
    
    const messageEl = statusItem.querySelector('.status-message');
    messageEl.textContent = message;

    if (progress !== null) {
        const progressFill = statusItem.querySelector('.progress-fill');
        if (progressFill) {
            progressFill.style.width = `${progress}%`;
        }
    }
}

// Utility functions
function sanitizeFilename(filename) {
    const parts = filename.split('.');
    const ext = parts.length > 1 ? '.' + parts.pop() : '';
    let name = parts.join('.');

    // Remove path separators and null bytes
    name = name.replace(/[/\\\0]/g, '').trim();
    // Remove dangerous chars: < > : " | ? *
    name = name.replace(/[<>:"|?*]/g, '');

    if (!name) name = 'file';

    return name + ext;
}

function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}

function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function generateId() {
    return 'xxxx-xxxx-xxxx-xxxx'.replace(/x/g, () => 
        Math.floor(Math.random() * 16).toString(16)
    );
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <div class="notification-content">
            <span>${escapeHtml(message)}</span>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        </div>
    `;

    document.body.appendChild(notification);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Document Management Functions
async function loadDocuments(isRefresh = true) {
    console.log('=== loadDocuments called ===');
    console.log('isRefresh:', isRefresh);
    console.log('Current nextPageToken before loading:', nextPageToken);
    
    // API key is already loaded from encrypted storage
    if (!apiKey) {
        showNotification('אנא התחבר תחילה', 'error');
        return;
    }

    if (!storeName || !selectedStore) {
        showNotification('אנא בחר מאגר תחילה', 'error');
        showStoreSelectionUI();
        return;
    }

    // If refresh, reset everything
    if (isRefresh) {
        nextPageToken = null;
        documents = [];
        documentsContainer.innerHTML = '<div class="loading">טוען מסמכים...</div>';
    }

    // Disable buttons while loading
    refreshBtn.disabled = true;
    if (loadMoreBtn) {
        loadMoreBtn.disabled = true;
    }

    try {
        // Build URL with page token if loading more
        let url = `${API_BASE_URL}/${storeName}/documents?key=${apiKey}`;
        if (!isRefresh && nextPageToken) {
            url += `&pageToken=${encodeURIComponent(nextPageToken)}`;
            console.log('Adding pageToken to URL:', nextPageToken);
        }
        
        console.log('Fetching URL (without API key shown):', url.replace(/key=[^&]+/, 'key=***'));

        const response = await fetch(url);

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`שגיאה בטעינת מסמכים: ${error}`);
        }

        const data = await response.json();
        
        console.log('=== API Response Debug ===');
        console.log('Full response data:', data);
        console.log('Has nextPageToken?', 'nextPageToken' in data);
        console.log('nextPageToken value:', data.nextPageToken);

        // Append new documents to existing ones
        const newDocuments = data.documents || [];
        documents = [...documents, ...newDocuments];

        // Store next page token
        nextPageToken = data.nextPageToken || null;
        
        console.log('=== After Processing ===');
        console.log('Stored nextPageToken:', nextPageToken);
        console.log('nextPageToken type:', typeof nextPageToken);
        console.log('Is null?', nextPageToken === null);
        console.log('Is undefined?', nextPageToken === undefined);

        // Render documents
        renderDocuments();

        // Update pagination controls - show load more button if we have more pages
        updatePaginationControls();

        if (isRefresh && documents.length === 0) {
            showNotification('לא נמצאו מסמכים במאגר זה', 'info');
        }
        // Don't show notification when loading more (isRefresh = false)

    } catch (error) {
        console.error('Error loading documents:', error);
        showNotification('שגיאה בטעינת מסמכים: ' + error.message, 'error');
        if (isRefresh) {
            documentsContainer.innerHTML = `
                <div class="empty-state">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p>שגיאה בטעינת מסמכים</p>
                    <p class="small">${escapeHtml(error.message)}</p>
                </div>
            `;
        }
        updatePaginationControls();
    } finally {
        refreshBtn.disabled = false;
    }
}

function updatePaginationControls() {
    // Show load more button only if we have a next page token
    const hasNext = nextPageToken !== null && nextPageToken !== undefined;
    
    console.log('=== updatePaginationControls Debug ===');
    console.log('nextPageToken:', nextPageToken);
    console.log('hasNext:', hasNext);
    console.log('documentsCount:', documents.length);
    console.log('paginationControls element:', paginationControls);
    console.log('loadMoreBtn element:', loadMoreBtn);
    console.log('Current paginationControls display:', paginationControls?.style.display);
    console.log('Current loadMoreBtn disabled:', loadMoreBtn?.disabled);
    
    if (hasNext) {
        console.log('>>> Setting button to VISIBLE and ENABLED');
        if (paginationControls) {
            paginationControls.style.display = 'flex';
        }
        if (loadMoreBtn) {
            loadMoreBtn.disabled = false;
        }
    } else {
        console.log('>>> Setting button to HIDDEN and DISABLED');
        if (paginationControls) {
            paginationControls.style.display = 'none';
        }
        if (loadMoreBtn) {
            loadMoreBtn.disabled = true;
        }
    }
    
    console.log('After update - display:', paginationControls?.style.display);
    console.log('After update - disabled:', loadMoreBtn?.disabled);
    console.log('=== End Debug ===');
}

function renderDocuments() {
    // Update document count with pagination info
    if (documents.length > 0) {
        const hasMore = nextPageToken !== null && nextPageToken !== undefined;
        let countText;
        if (documents.length === 1) {
            countText = hasMore ? 'מסמך אחד (ניתן להציג עוד)' : 'מסמך אחד (סך הכל)';
        } else {
            countText = hasMore ? `${documents.length} מסמכים (ניתן להציג עוד)` : `${documents.length} מסמכים (סך הכל)`;
        }
        documentCount.textContent = countText;
        documentCount.style.display = 'inline';
    } else {
        documentCount.style.display = 'none';
    }

    if (documents.length === 0) {
        documentsContainer.innerHTML = `
            <div class="empty-state">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>אין מסמכים במאגר</p>
                <p class="small">העלה קבצים כדי להתחיל</p>
            </div>
        `;
        return;
    }

    documentsContainer.innerHTML = documents.map(doc => {
        const ext = doc.mimeType.split('/').pop().toUpperCase();
        const size = formatFileSize(parseInt(doc.sizeBytes));
        const date = new Date(doc.createTime).toLocaleDateString();
        
        return `
            <div class="document-item" data-name="${escapeHtml(doc.name)}">
                <div class="document-info">
                    <div class="document-icon">${ext.substring(0, 4)}</div>
                    <div class="document-details">
                        <div class="document-name">${escapeHtml(doc.displayName)}</div>
                        <div class="document-meta">
                            <span class="document-size">${size}</span>
                            <span class="document-separator">•</span>
                            <span class="document-date">${date}</span>
                            <span class="document-separator">•</span>
                            <span class="document-type">${escapeHtml(doc.mimeType)}</span>
                        </div>
                    </div>
                </div>
                <div class="document-actions">
                    <span class="document-state ${doc.state === 'STATE_ACTIVE' ? 'state-active' : 'state-inactive'}">
                        ${doc.state === 'STATE_ACTIVE' ? 'פעיל' : doc.state}
                    </span>
                    <button class="btn-icon btn-icon-danger" onclick="confirmDeleteDocument('${escapeHtml(doc.name)}', '${escapeHtml(doc.displayName)}')" title="Delete document">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function confirmDeleteDocument(documentName, displayName) {
    currentDeleteDocument = documentName;
    confirmMessage.textContent = `האם אתה בטוח שברצונך למחוק את "${displayName}"?`;
    showConfirmModal();
}

function showConfirmModal() {
    confirmModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function hideConfirmModal() {
    confirmModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    currentDeleteDocument = null;
}

async function handleConfirmDelete() {
    if (!currentDeleteDocument) return;

    const documentName = currentDeleteDocument;
    hideConfirmModal();

    // Show deleting notification
    showNotification('מוחק מסמך...', 'info');

    try {
        const url = `${API_BASE_URL}/${documentName}?key=${apiKey}&force=true`;
        
        const response = await fetch(url, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`שגיאה במחיקת מסמך: ${error}`);
        }

        // Refresh documents list from server to ensure accuracy
        showNotification('המסמך נמחק בהצלחה. מרענן רשימה...', 'success');
        
        // Small delay to ensure server has processed the deletion
        setTimeout(() => {
            loadDocuments(true);
        }, 500);

    } catch (error) {
        console.error('Error deleting document:', error);
        showNotification('שגיאה במחיקת מסמך: ' + error.message, 'error');
    }
}

// Make functions globally accessible
window.confirmDeleteDocument = confirmDeleteDocument;
window.handleFirstEntry = handleFirstEntry;

// Initialize the app when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    // DOM is already loaded
    init();
}
