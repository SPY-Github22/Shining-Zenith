// ===== AI Honeypot - Options Page =====
const apiKeyInput = document.getElementById('apiKey');
const saveBtn = document.getElementById('saveBtn');
const clearBtn = document.getElementById('clearBtn');
const toggleVis = document.getElementById('toggleVis');
const toast = document.getElementById('toast');

// Load saved key
chrome.storage.sync.get(['groqApiKey'], (result) => {
    if (result.groqApiKey) {
        apiKeyInput.value = result.groqApiKey;
    }
});

// Save
saveBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
        showToast('Please enter an API key.', 'error');
        return;
    }
    if (!key.startsWith('gsk_')) {
        showToast('Groq API keys usually start with "gsk_". Are you sure this is correct?', 'error');
        return;
    }
    chrome.storage.sync.set({ groqApiKey: key }, () => {
        showToast('✅ API key saved successfully!', 'success');
    });
});

// Clear
clearBtn.addEventListener('click', () => {
    apiKeyInput.value = '';
    chrome.storage.sync.remove('groqApiKey', () => {
        showToast('API key cleared.', 'success');
    });
});

// Toggle visibility
toggleVis.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
        apiKeyInput.type = 'text';
        toggleVis.textContent = '🔒 Hide key';
    } else {
        apiKeyInput.type = 'password';
        toggleVis.textContent = '👁 Show key';
    }
});

function showToast(message, type) {
    toast.textContent = message;
    toast.className = 'toast ' + type;
    toast.style.display = 'block';
    setTimeout(() => { toast.style.display = 'none'; }, 3000);
}
