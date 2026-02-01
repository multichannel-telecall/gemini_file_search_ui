/**
 * Web Worker for PIN encryption/decryption.
 * Runs heavy crypto off the main thread to prevent UI freezing.
 */
function deriveKeyFromPIN(pin) {
    let key = pin;
    for (let i = 0; i < 1000; i++) {
        key = btoa(key).replace(/[^A-Za-z0-9]/g, '');
    }
    return key.substring(0, 32).padEnd(32, '0');
}

function simpleEncrypt(text, pin, apiKey) {
    const combinedKey = pin + (apiKey || '');
    const keyStr = deriveKeyFromPIN(combinedKey);
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        const keyChar = keyStr.charCodeAt(i % keyStr.length);
        const encrypted = charCode ^ keyChar;
        result += String.fromCharCode(encrypted);
    }
    return Array.from(result).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('');
}

function simpleDecrypt(encryptedHex, pin, apiKey) {
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
        const decrypted = charCode ^ keyChar;
        result += String.fromCharCode(decrypted);
    }
    return result;
}

self.onmessage = function (e) {
    const { id, action, params } = e.data;
    try {
        let result;
        if (action === 'encrypt') {
            result = simpleEncrypt(params.text, params.pin, params.apiKey);
        } else if (action === 'decrypt') {
            result = simpleDecrypt(params.encryptedHex, params.pin, params.apiKey);
        } else {
            throw new Error('Unknown action: ' + action);
        }
        self.postMessage({ id, result });
    } catch (err) {
        self.postMessage({ id, error: err.message });
    }
};
