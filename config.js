// config.js

// --- Базовые URL для прокси ---
const VERCEL_PROXY_BASE_URL = "https://ver-olive-delta.vercel.app";
const MAPRUAPP_PROXY_BASE_URL = "https://mapruapp.ru";

// --- Список доступных моделей ---
export const MODELS = [
    { id: "gemini-2.5-flash-lite-preview-06-17", uiName: "Gemini 2.5 Flash Lite (быстрая)", apiType: "gemini", tier: 'lite' },
    { id: "gemini-2.5-flash", uiName: "Gemini 2.5 Flash", apiType: "gemini", tier: 'standard' },
    { id: "mistral-medium-2505", uiName: "Mistral Medium (быстрая)", apiType: "mistral", tier: 'standard' },
    { id: "magistral-medium-2506", uiName: "Mistral Magistral ", apiType: "mistral", tier: 'standard' },
    { id: "glm-4.5-flash", uiName: "GLM-4.5 Flash", apiType: "zhipu", tier: 'standard' },
    { id: "gpt-oss-20b-free", uiName: "OpenAI GPT-OSS 20B", apiType: "openrouter", tier: 'standard' },
];

// --- Режимы подключения к API ---
export const API_MODES = {
    'mapruapp': {
        uiName: 'Прокси (mapruapp)',
        geminiUrl: () => `${MAPRUAPP_PROXY_BASE_URL}/ai/api/v1/chat/completions`,
        claudeUrl: () => `${MAPRUAPP_PROXY_BASE_URL}/ai/api/v1/chat/completions`,
        icon: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17.6,15.2c-1-1.4-2.5-2.5-4.2-2.9c-0.3-0.1-0.6-0.1-0.8-0.1s-0.5,0-0.8,0.1c-1.7,0.5-3.2,1.5-4.2,2.9 c-1.2,1.6-1.8,3.5-1.8,5.5c0,0.4,0.3,0.8,0.8,0.8h11.2c0.4,0,0.8-0.3,0.8-0.8C19.5,18.7,18.8,16.8,17.6,15.2z M6.9,4.4 C8.1,3.2,9.9,2.5,12,2.5s3.9,0.7,5.1,1.9c1.2,1.2,1.9,2.9,1.9,4.7c0,1.8-0.7,3.6-1.9,4.7c-0.2,0.2-0.5,0.3-0.8,0.3s-0.6-0.1-0.8-0.3 c-0.4-0.4-0.4-1.1,0-1.5c0.8-0.8,1.2-1.8,1.2-2.9c0-1.1-0.4-2.2-1.2-2.9C15.8,5,15,5,14.1,5.4c-0.4,0.2-1,0.1-1.3-0.3 c-0.3-0.4-0.1-1,0.3-1.3C13.5,3.5,12.8,3.3,12,3.3s-1.5,0.2-2.1,0.5c0.4,0.3,0.5,0.9,0.3,1.3C10,5.4,9.4,5.6,9,5.4 C8,5,7.2,5,6.3,5.4C5.5,6.2,5.1,7.2,5.1,8.3c0,1.1,0.4,2.2,1.2,2.9c0.4,0.4,0.4,1.1,0,1.5c-0.4,0.4-1.1,0.4-1.5,0 c-1.2-1.2-1.9-2.9-1.9-4.7C3.1,7.3,3.8,5.6,4.9,4.4H6.9z" fill="var(--accent-color)"/></svg>'
    },
    'vercel': {
        uiName: 'Прокси (vercel)',
        geminiUrl: (modelId) => `${VERCEL_PROXY_BASE_URL}/v1beta/models/${modelId}:generateContent`,
        claudeUrl: () => `${VERCEL_PROXY_BASE_URL}/proxy/langdock/anthropic/eu/v1/messages`,
        icon: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17.6,15.2c-1-1.4-2.5-2.5-4.2-2.9c-0.3-0.1-0.6-0.1-0.8-0.1s-0.5,0-0.8,0.1c-1.7,0.5-3.2,1.5-4.2,2.9 c-1.2,1.6-1.8,3.5-1.8,5.5c0,0.4,0.3,0.8,0.8,0.8h11.2c0.4,0,0.8-0.3,0.8-0.8C19.5,18.7,18.8,16.8,17.6,15.2z M6.9,4.4 C8.1,3.2,9.9,2.5,12,2.5s3.9,0.7,5.1,1.9c1.2,1.2,1.9,2.9,1.9,4.7c0,1.8-0.7,3.6-1.9,4.7c-0.2,0.2-0.5,0.3-0.8,0.3s-0.6-0.1-0.8-0.3 c-0.4-0.4-0.4-1.1,0-1.5c0.8-0.8,1.2-1.8,1.2-2.9c0-1.1-0.4-2.2-1.2-2.9C15.8,5,15,5,14.1,5.4c-0.4,0.2-1,0.1-1.3-0.3 c-0.3-0.4-0.1-1,0.3-1.3C13.5,3.5,12.8,3.3,12,3.3s-1.5,0.2-2.1,0.5c0.4,0.3,0.5,0.9,0.3,1.3C10,5.4,9.4,5.6,9,5.4 C8,5,7.2,5,6.3,5.4C5.5,6.2,5.1,7.2,5.1,8.3c0,1.1,0.4,2.2,1.2,2.9c0.4,0.4,0.4,1.1,0,1.5c-0.4,0.4-1.1,0.4-1.5,0 c-1.2-1.2-1.9-2.9-1.9-4.7C3.1,7.3,3.8,5.6,4.9,4.4H6.9z" fill="var(--accent-color)"/></svg>'
    },
    'direct': {
        uiName: 'Прямой (gemini)',
        geminiUrl: (modelId, key) => `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${key}`,
        claudeUrl: () => null,
        icon: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" fill="var(--accent-color)"/></svg>'
    },
       'direct_mistral': {
        uiName: 'Прямой (mistral)',
        icon: '<svg class="icon" xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 24 24" width="20"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z" fill="var(--accent-color)"/></svg>'
    }
};