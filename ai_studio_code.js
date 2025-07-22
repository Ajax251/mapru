<script>
window.addEventListener('load', () => {
    // --- CONFIGURATION ---
    const VERCEL_LINK_EXTRACTOR_API = "https://linkextractor.vercel.app/extract-from-url/";
    const MAPRUAPP_SCRAPER_API = `https://mapruapp.ru/page-scraper/get-source`;
    const VERCEL_TEXT_EXTRACTOR_API = "https://text-extractor-pdf.vercel.app/api/extract";

    const VERCEL_PROXY_BASE_URL = "https://ver-olive-delta.vercel.app";
    const MAPRUAPP_PROXY_BASE_URL = "https://mapruapp.ru";
    
    const MODELS = [
        { id: "gemini-2.5-flash-lite-preview-06-17", uiName: "Gemini 2.5 Flash Lite (быстрая)", apiType: "gemini" },
        { id: "gemini-2.5-flash", uiName: "Gemini 2.5 Flash", apiType: "gemini" },
        { id: "mistral-medium-2505", uiName: "Mistral Medium (быстрая)", apiType: "mistral" },
        { id: "magistral-medium-2506", uiName: "Mistral Magistral", apiType: "mistral" },
    ];
    const DEFAULT_MODEL_ID = "gemini-2.5-flash-lite-preview-06-17";

    const urlPattern = new RegExp('^(https?:\\/\\/)?((([a-z\\d]([a-z\\d-]*[a-z\\d])*)\\.)+[a-z]{2,}|((\\d{1,3}\\.){3}\\d{1,3}))(\\:\\d+)?(\\/[-a-zа-яё\\d%_.~+]*)*(\\?[;&a-z\\d%_.~+=-]*)?(\\#.*)?$','i');
    
    const AI_SYSTEM_PROMPT_F1_ADVANCED = `Ты — «F1 Helper», элитный ИИ-аналитик и технический писатель. Твоя миссия — превратить сырой HTML-код любого сайта в профессиональную, исчерпывающую и понятную пользовательскую документацию. Ты должен действовать как разработчик, объясняющий своё творение пользователю.

### **АЛГОРИТМ АНАЛИЗА:**
1.  **ГЛУБОКОЕ СКАНИРОВАНИЕ:** Внимательно проанализируй ВЕСЬ HTML и встроенный JavaScript.
2.  **ОПРЕДЕЛЕНИЕ СУТИ:** Пойми, это сайт-визитка, блог, новостной портал или **веб-приложение/инструмент**?
3.  **СОЗДАНИЕ ДОКУМЕНТАЦИИ:** Сгенерируй ответ строго в формате Markdown по приведённой ниже структуре.

**ВАЖНОЕ ТРЕБОВАНИЕ: Весь твой ответ должен быть сгенерирован исключительно на русском языке, независимо от языка анализируемого контента. Всегда.**

---

### **СТРУКТРУРА ОТВЕТА (ОБЯЗАТЕЛЬНА):**
# 📜 Справка по сайту: [Извлеки заголовок из <title> или <h1>]
### 🎯 Назначение сайта
[В 2-3 предложениях опиши главную цель сайта. Какую задачу он решает для пользователя?]
### 🚀 Как пользоваться: Пошаговое руководство
[Опиши основной и самый частый сценарий использования сайта в виде нумерованного списка.]
### 🕵️‍♀️ Продвинутые функции и режимы
[Найди и опиши альтернативные режимы, скрытые меню, сложные элементы управления, контекстный интерфейс.]
### ⌨️ Горячие клавиши
[Тщательно проанализируй JavaScript и HTML на предмет горячих клавиш.]
### 💡 Советы и рекомендации
[Дай 1-2 полезных совета, которые помогут пользователю работать с сайтом эффективнее.]`;
    
    const AI_SYSTEM_PROMPT_CONTENT_ANALYST = `Ты — «Контент-Аналитик», эксперт по анализу и структурированию информации. Твоя задача — изучить предоставленный текст (извлеченный со страницы или из документа, например, PDF) и дать по нему исчерпывающую, но понятную справку.

### **АЛГОРИТМ РАБОТЫ:**
1.  **ОПРЕДЕЛИ СУТЬ:** Прочитай весь текст и пойми его главную тему, цель и ключевые идеи.
2.  **СТРУКТУРИРУЙ ОТВЕТ:** Создай ответ в формате Markdown по шаблону ниже. Будь краток, но точен.

**ВАЖНОЕ ТРЕБОВАНИЕ: Весь твой ответ должен быть сгенерирован исключительно на русском языке, независимо от языка анализируемого контента. Всегда.**

---

### **СТРУКТУРА ОТВЕТА (ОБЯЗАТЕЛЬНА):**
# 📄 Анализ содержимого
### 🎯 Основная идея документа
[В 2-3 предложениях изложи главную мысль или цель текста. О чем этот документ?]
### 🔑 Ключевые тезисы
[Представь основные положения, выводы или факты из текста в виде маркированного списка. Каждый пункт должен быть самостоятельной мыслью.]
*   Тезис 1
*   Тезис 2
*   Тезис 3
...
### 💡 Что важно запомнить
[Выдели 1-2 самых важных аспекта, вывода или совета из документа, которые пользователь должен усвоить в первую очередь.]
[После этого анализа, будь готов отвечать на уточняющие вопросы по тексту.]`;

    // --- DOM ELEMENTS ---
    const startScreen = document.getElementById('start-screen');
    const loadingScreen = document.getElementById('loading-screen');
    const resultsScreen = document.getElementById('results-screen');
    const urlForm = document.getElementById('url-form');
    const urlInput = document.getElementById('url-input');
    const submitBtnText = document.getElementById('submit-btn-text');
    const contentAnalysisCheckbox = document.getElementById('content-analysis-checkbox');
    const loadingText = document.getElementById('loading-text');
    const chatHistoryContainer = document.getElementById('chat-history');
    const newSiteBtn = document.getElementById('new-site-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModalOverlay = document.getElementById('settings-modal-overlay');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const modelSelector = document.getElementById('model-selector');
    const pageScraperSelector = document.getElementById('page-scraper-selector');
    const currentSettingsDisplay = document.getElementById('current-settings-display');
    const chatForm = document.getElementById('chat-form');
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');

    // --- STATE VARIABLES ---
    let controller = null;
    let currentModelId = DEFAULT_MODEL_ID;
    let currentPageScraperService = 'vercel';
    let chatHistory = []; 

    // --- CORE FUNCTIONS ---
    const initializeApp = () => {
        marked.setOptions({ renderer: new marked.Renderer(), sanitize: false, gfm: true });
        
        loadSettings();
        populateModelSelector();

        urlForm.addEventListener('submit', handleSubmit);
        chatForm.addEventListener('submit', handleChatSubmit);
        newSiteBtn.addEventListener('click', resetApp);
        settingsBtn.addEventListener('click', () => settingsModalOverlay.classList.add('show'));
        saveSettingsBtn.addEventListener('click', saveAndCloseSettings);
        settingsModalOverlay.addEventListener('click', (e) => { if (e.target === settingsModalOverlay) settingsModalOverlay.classList.remove('show'); });
        contentAnalysisCheckbox.addEventListener('change', (e) => {
            submitBtnText.textContent = e.target.checked ? 'Анализировать' : 'Создать инструкцию';
        });

        showScreen('start');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        chatHistory = []; 
        let url = urlInput.value.trim();
        if (!url) {
            alert('Пожалуйста, введите адрес.');
            return;
        }
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        if (!urlPattern.test(url)) {
            alert('Введенный адрес выглядит некорректно.');
            return;
        }

        controller = new AbortController();
        const isContentAnalysis = contentAnalysisCheckbox.checked;

        try {
            let systemPrompt, userPrompt, initialData;
            
            if (isContentAnalysis) {
                showScreen('loading', 'Извлекаю текст из документа...');
                initialData = await fetchContentText(url);
                systemPrompt = AI_SYSTEM_PROMPT_CONTENT_ANALYST;
                userPrompt = `Проанализируй следующий текст:\n\n---\n${initialData}\n---`;
            } else {
                showScreen('loading', 'Извлекаю код страницы...');
                initialData = await fetchPageSource(url);
                systemPrompt = AI_SYSTEM_PROMPT_F1_ADVANCED;
                userPrompt = `${AI_SYSTEM_PROMPT_F1_ADVANCED}\n\n--- НАЧАЛО HTML-КОДА ---\n${initialData}\n--- КОНЕЦ HTML-КОДА ---`;
            }

            showScreen('loading', 'Анализирую и создаю ответ...');
            
            chatHistory.push({ role: 'system', content: systemPrompt });
            chatHistory.push({ role: 'user', content: userPrompt });

            const aiResponseText = await getAIResponse(chatHistory);
            chatHistory.push({ role: 'model', content: aiResponseText });
            
            renderChatHistory();
            showScreen('results');
            chatForm.classList.remove('hidden'); 

        } catch (error) {
            if (error.name !== 'AbortError') {
                const errorMessage = `<h2><i class="fa-solid fa-triangle-exclamation"></i> Ошибка</h2><p>Не удалось обработать запрос. Пожалуйста, попробуйте другую ссылку или проверьте настройки.</p><p><small>Детали: ${error.message}</small></p>`;
                chatHistoryContainer.innerHTML = `<div class="error-message">${errorMessage}</div>`;
                showScreen('results');
            }
        } finally {
            controller = null;
        }
    };

    const handleChatSubmit = async (e) => {
        e.preventDefault();
        const userText = chatInput.value.trim();
        if (!userText || chatSendBtn.disabled) return;

        chatInput.value = '';
        chatSendBtn.disabled = true;

        chatHistory.push({ role: 'user', content: userText });
        renderChatHistory();
        
        try {
            const aiResponseText = await getAIResponse(chatHistory);
            chatHistory.push({ role: 'model', content: aiResponseText });
        } catch (error) {
             if (error.name !== 'AbortError') {
                const errorMessage = `**Ошибка:** Не удалось получить ответ. ${error.message}`;
                chatHistory.push({ role: 'model', content: errorMessage });
             }
        } finally {
            renderChatHistory();
            chatSendBtn.disabled = false;
            chatInput.focus();
        }
    };
    
    async function fetchPageSource(url) {
        let fullUrl = url.startsWith('http://') || url.startsWith('https://') ? url : `https://${url}`;
        let response;
        try {
            if (currentPageScraperService === 'mapruapp') {
                response = await fetch(MAPRUAPP_SCRAPER_API, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url: fullUrl }), signal: controller?.signal
                });
            } else {
                const formData = new FormData();
                formData.append('url_input', fullUrl);
                response = await fetch(VERCEL_LINK_EXTRACTOR_API, {
                    method: 'POST', body: formData, signal: controller?.signal
                });
            }
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.detail || errorData.error || `Не удалось загрузить страницу. Статус: ${response.status}`);
            }
            const data = await response.json();
            const sourceHtml = data.source_html || data.content;
            if (!sourceHtml) {
                 throw new Error(`Сервис ${currentPageScraperService} не смог извлечь исходный код.`);
            }
            return sourceHtml;
        } catch (error) {
            throw new Error(`Ошибка при извлечении кода (${currentPageScraperService}): ${error.message}`);
        }
    }

    async function fetchContentText(url) {
        const apiUrl = `${VERCEL_TEXT_EXTRACTOR_API}?url=${encodeURIComponent(url)}`;
        try {
            const response = await fetch(apiUrl, { signal: controller?.signal });
             if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Сервис извлечения текста ответил с ошибкой: ${response.status}`);
            }
            const data = await response.json();
            if (!data.text || data.text.trim() === '') {
                throw new Error('Не удалось извлечь значимый текст из источника.');
            }
            return data.text;
        } catch (error) {
            throw new Error(`Ошибка при извлечении текста: ${error.message}`);
        }
    }
    
    async function getAIResponse(messages) {
        const selectedModel = MODELS.find(m => m.id === currentModelId) || MODELS[0];
        const apiType = selectedModel.apiType;

        let apiUrl, requestBody;
        const fetchOptions = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller?.signal
        };

        const systemInstruction = messages.find(m => m.role === 'system')?.content || "";
        const userMessages = messages.filter(m => m.role !== 'system').map(m => {
            if (apiType === 'gemini') {
                return { role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.content }] };
            }
            return m; 
        });

        if (apiType === 'gemini') {
            apiUrl = `${VERCEL_PROXY_BASE_URL}/v1beta/models/${currentModelId}:generateContent`;
            requestBody = {
                contents: userMessages,
                systemInstruction: { parts: [{ text: systemInstruction }] }
            };
        } else if (apiType === 'mistral') {
             apiUrl = `${MAPRUAPP_PROXY_BASE_URL}/ai/api/v1/chat/completions`;
             requestBody = {
                model: currentModelId,
                messages: [{ role: 'system', content: systemInstruction }, ...userMessages],
                max_tokens: 4096
            };
        } else {
            throw new Error(`Неизвестный или неподдерживаемый тип API: ${apiType}`);
        }

        fetchOptions.body = JSON.stringify(requestBody);
        const response = await fetch(apiUrl, fetchOptions);

        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(errorBody.error?.message || `API-сервер ответил с ошибкой: ${response.status}`);
        }

        const data = await response.json();
        let aiResponseText = "";
        if (apiType === 'gemini') aiResponseText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        else if (apiType === 'mistral') aiResponseText = data.choices?.[0]?.message?.content;

        if (!aiResponseText) {
            throw new Error(`Не удалось получить ответ от ИИ.`);
        }
        return aiResponseText;
    }

    function renderChatHistory() {
        chatHistoryContainer.innerHTML = '';
        const relevantHistory = chatHistory.filter(m => m.role !== 'system');

        relevantHistory.forEach(msg => {
            const msgDiv = document.createElement('div');
            msgDiv.classList.add('chat-message');
            if (msg.role === 'user') {
                msgDiv.classList.add('user-message');
                msgDiv.textContent = msg.content;
            } else { 
                msgDiv.classList.add('ai-message');
                msgDiv.innerHTML = marked.parse(msg.content);
            }
            chatHistoryContainer.appendChild(msgDiv);
        });

        if (chatHistory.length > 0 && chatHistory[chatHistory.length - 1].role === 'user') {
            const typingIndicator = document.createElement('div');
            typingIndicator.className = 'typing-indicator';
            typingIndicator.innerHTML = `<span></span><span></span><span></span>`;
            chatHistoryContainer.appendChild(typingIndicator);
        }

        chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
    }
    
    function showScreen(screenName, text = '') {
        startScreen.classList.add('hidden');
        loadingScreen.classList.add('hidden');
        resultsScreen.classList.add('hidden');

        if (screenName === 'start') startScreen.classList.remove('hidden');
        else if (screenName === 'loading') {
            loadingText.textContent = text;
            loadingScreen.classList.remove('hidden');
        } else if (screenName === 'results') resultsScreen.classList.remove('hidden');
    };

    function resetApp() {
        if (controller) {
            controller.abort();
            controller = null;
        }
        urlInput.value = '';
        chatInput.value = '';
        chatHistoryContainer.innerHTML = '';
        chatHistory = []; 
        chatForm.classList.add('hidden'); 
        chatSendBtn.disabled = false;
        showScreen('start');
    };

    function populateModelSelector() {
        modelSelector.innerHTML = '';
        MODELS.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.uiName;
            if (model.id === currentModelId) option.selected = true;
            modelSelector.appendChild(option);
        });
    }
    function saveAndCloseSettings() {
        currentModelId = modelSelector.value;
        currentPageScraperService = pageScraperSelector.value;
        localStorage.setItem('f1_modelId', currentModelId);
        localStorage.setItem('f1_scraperService', currentPageScraperService);
        settingsModalOverlay.classList.remove('show');
        updateSettingsDisplay();
    }
    function loadSettings() {
        currentModelId = localStorage.getItem('f1_modelId') || DEFAULT_MODEL_ID;
        currentPageScraperService = localStorage.getItem('f1_scraperService') || 'vercel';
        modelSelector.value = currentModelId;
        pageScraperSelector.value = currentPageScraperService;
        updateSettingsDisplay();
    }
    function updateSettingsDisplay() {
        const selectedModel = MODELS.find(m => m.id === currentModelId) || {uiName: "Неизвестная модель"};
        const scraperName = pageScraperSelector.options[pageScraperSelector.selectedIndex].text;
        currentSettingsDisplay.textContent = `Модель: ${selectedModel.uiName.split('(')[0].trim()} | Извлечение: ${scraperName.split('(')[0].trim()}`;
    }

    initializeApp();
});
</script>