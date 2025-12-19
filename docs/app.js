// State Management
const state = {
    lang: 'fr', // 'fr' or 'en'
    token: sessionStorage.getItem('github_token') || '',
    repoOwner: '',
    repoName: '',
    feeds: {},
    feedsSha: '' // Needed for GitHub API updates
};

// UI Translations
const translations = {
    fr: {
        title: "RSS-Discord Bridge - Configuration",
        tabDoc: "📚 Documentation",
        tabConfig: "⚙️ Configuration",
        authTitle: "Authentification requise",
        authDesc: "Pour modifier les flux, vous devez fournir un Token d'accès personnel GitHub (PAT). Ce token est stocké uniquement dans votre navigateur pour cette session.",
        tokenPlaceholder: "github_pat_...",
        btnConnect: "Connexion",
        btnDisconnect: "Déconnexion",
        addFeedTitle: "Ajouter un flux RSS",
        feedName: "Nom du flux",
        feedUrl: "URL du flux RSS",
        webhookKey: "Clé Webhook (ex: actualites)",
        btnAdd: "Ajouter",
        currentFeeds: "Flux actuels",
        btnRemove: "Supprimer",
        loading: "Chargement...",
        msgSuccess: "Modifications sauvegardées avec succès !",
        msgError: "Erreur : ",
        msgAuthError: "Token invalide ou permissions insuffisantes.",
        msgMissingFields: "Veuillez remplir tous les champs.",
        msgFeedExists: "Un flux avec ce nom existe déjà."
    },
    en: {
        title: "RSS-Discord Bridge - Configurator",
        tabDoc: "📚 Documentation",
        tabConfig: "⚙️ Configurator",
        authTitle: "Authentication Required",
        authDesc: "To modify feeds, you must provide a GitHub Personal Access Token (PAT). This token is stored only in your browser for this session.",
        tokenPlaceholder: "github_pat_...",
        btnConnect: "Connect",
        btnDisconnect: "Disconnect",
        addFeedTitle: "Add RSS Feed",
        feedName: "Feed Name",
        feedUrl: "RSS Feed URL",
        webhookKey: "Webhook Key (e.g., news)",
        btnAdd: "Add Feed",
        currentFeeds: "Current Feeds",
        btnRemove: "Remove",
        loading: "Loading...",
        msgSuccess: "Changes saved successfully!",
        msgError: "Error: ",
        msgAuthError: "Invalid token or insufficient permissions.",
        msgMissingFields: "Please fill in all fields.",
        msgFeedExists: "A feed with this name already exists."
    }
};

// Detect Repository from URL
function detectRepository() {
    const hostname = window.location.hostname;
    const pathname = window.location.pathname;

    // Expected format: username.github.io/repo-name/
    if (hostname.includes('github.io')) {
        state.repoOwner = hostname.split('.')[0];
        // Pathname usually starts with /repo-name/
        const pathParts = pathname.split('/').filter(p => p);
        if (pathParts.length > 0) {
            state.repoName = pathParts[0];
        }
    } else {
        // Localhost fallback for development
        console.warn("Running on localhost or unknown host. Defaulting to placeholder.");
        state.repoOwner = 'Gabryel666'; // Default fallback
        state.repoName = 'RSS-Discord-Bridge';
    }
    console.log(`Detected Repo: ${state.repoOwner}/${state.repoName}`);
}

// Initialization
document.addEventListener('DOMContentLoaded', () => {
    detectRepository();
    setupEventListeners();
    updateLanguage(state.lang);

    if (state.token) {
        showConfigInterface();
        loadFeeds();
    }
});

function setupEventListeners() {
    // Language Switch
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const lang = e.target.dataset.lang;
            state.lang = lang;
            updateLanguage(lang);
            document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    // Tabs
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tab = e.target.dataset.tab;
            document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
            document.getElementById(tab).classList.add('active');
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            e.target.classList.add('active');
        });
    });

    // Auth
    document.getElementById('btn-connect').addEventListener('click', () => {
        const token = document.getElementById('token-input').value.trim();
        if (token) {
            state.token = token;
            sessionStorage.setItem('github_token', token);
            showConfigInterface();
            loadFeeds();
        }
    });

    document.getElementById('btn-disconnect').addEventListener('click', () => {
        state.token = '';
        sessionStorage.removeItem('github_token');
        location.reload();
    });

    // Add Feed
    document.getElementById('add-feed-form').addEventListener('submit', (e) => {
        e.preventDefault();
        addFeed();
    });
}

function updateLanguage(lang) {
    const t = translations[lang];
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.dataset.i18n;
        if (t[key]) el.textContent = t[key];
    });

    // Updates placeholders
    document.getElementById('token-input').placeholder = t.tokenPlaceholder;
    document.getElementById('feed-name').placeholder = t.feedName;
    document.getElementById('feed-url').placeholder = t.feedUrl;
    document.getElementById('webhook-key').placeholder = t.webhookKey;

    // Update Doc Visibility
    document.querySelectorAll('.doc-content').forEach(el => el.classList.add('hidden'));
    document.getElementById(`doc-${lang}`).classList.remove('hidden');
}

function showConfigInterface() {
    document.getElementById('auth-section').classList.add('hidden');
    document.getElementById('config-interface').classList.remove('hidden');
}

// GitHub API Interactions
async function loadFeeds() {
    showMessage(translations[state.lang].loading, 'info');

    try {
        const url = `https://api.github.com/repos/${state.repoOwner}/${state.repoName}/contents/feeds.json`;
        const response = await fetch(url, {
            headers: {
                'Authorization': `token ${state.token}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });

        if (!response.ok) throw new Error(response.statusText);

        const data = await response.json();
        state.feedsSha = data.sha;

        // Decode Base64 content (handles UTF-8 properly)
        const content = new TextDecoder().decode(Uint8Array.from(atob(data.content), c => c.charCodeAt(0)));
        state.feeds = JSON.parse(content);

        renderFeeds();
        showMessage('', 'none'); // Clear message
    } catch (error) {
        console.error(error);
        showMessage(translations[state.lang].msgAuthError, 'error');
        // If auth fails, reset
        if (error.message === 'Unauthorized' || error.message === 'Not Found') {
            document.getElementById('auth-section').classList.remove('hidden');
            document.getElementById('config-interface').classList.add('hidden');
        }
    }
}

async function saveFeeds() {
    showMessage(translations[state.lang].loading, 'info');

    try {
        // Encode content to Base64 (UTF-8 safe)
        const contentStr = JSON.stringify(state.feeds, null, 2);
        const contentEncoded = btoa(unescape(encodeURIComponent(contentStr)));

        const url = `https://api.github.com/repos/${state.repoOwner}/${state.repoName}/contents/feeds.json`;
        const body = {
            message: `Update feeds.json via Web Configurator`,
            content: contentEncoded,
            sha: state.feedsSha
        };

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `token ${state.token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) throw new Error(await response.text());

        const data = await response.json();
        state.feedsSha = data.content.sha; // Update SHA for next commit

        showMessage(translations[state.lang].msgSuccess, 'success');
        renderFeeds();
    } catch (error) {
        console.error(error);
        showMessage(translations[state.lang].msgError + error.message, 'error');
    }
}

function renderFeeds() {
    const container = document.getElementById('feed-list');
    container.innerHTML = '';

    Object.keys(state.feeds).forEach(feedName => {
        const feed = state.feeds[feedName];

        const item = document.createElement('div');
        item.className = 'feed-item';
        item.innerHTML = `
            <div class="feed-info">
                <h4>${feedName} <span class="tag">${feed.webhookKey}</span></h4>
                <p>${feed.url}</p>
            </div>
            <div class="feed-actions">
                <button class="btn btn-danger btn-sm" onclick="removeFeed('${feedName.replace(/'/g, "\\'")}')">
                    ${translations[state.lang].btnRemove}
                </button>
            </div>
        `;
        container.appendChild(item);
    });
}

function addFeed() {
    const name = document.getElementById('feed-name').value.trim();
    const url = document.getElementById('feed-url').value.trim();
    const webhook = document.getElementById('webhook-key').value.trim();
    const t = translations[state.lang];

    if (!name || !url || !webhook) {
        showMessage(t.msgMissingFields, 'error');
        return;
    }

    if (state.feeds[name]) {
        showMessage(t.msgFeedExists, 'error');
        return;
    }

    state.feeds[name] = {
        url: url,
        webhookKey: webhook
    };

    // Reset form
    document.getElementById('feed-name').value = '';
    document.getElementById('feed-url').value = '';

    saveFeeds();
}

// Global scope for onclick
window.removeFeed = function(name) {
    if (confirm(`Delete ${name}?`)) {
        delete state.feeds[name];
        saveFeeds();
    }
};

function showMessage(msg, type) {
    const el = document.getElementById('status-msg');
    el.textContent = msg;
    el.className = type === 'none' ? 'hidden' : type;
}
