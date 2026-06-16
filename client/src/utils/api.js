/// <reference types="vite/client" />
const API_BASE = import.meta.env?.VITE_API_URL || 'http://localhost:3000';
let authToken = localStorage.getItem('auth_token');
export function setAuthToken(token) {
    authToken = token;
    if (token) {
        localStorage.setItem('auth_token', token);
    }
    else {
        localStorage.removeItem('auth_token');
    }
}
export function getAuthToken() {
    return authToken;
}
async function fetchAPI(endpoint, options) {
    const headers = {
        'Content-Type': 'application/json',
    };
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
            ...headers,
            ...options?.headers,
        },
    });
    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `API error: ${response.status} ${response.statusText}`);
    }
    return response.json();
}
// Auth API
export async function devLogin(userId) {
    const result = await fetchAPI('/auth/dev-login', {
        method: 'POST',
        body: JSON.stringify({ userId }),
    });
    if (result.success && result.data?.token) {
        setAuthToken(result.data.token);
    }
    return result;
}
export async function login(email, password) {
    const result = await fetchAPI('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
    });
    if (result.success && result.data?.token) {
        setAuthToken(result.data.token);
    }
    return result;
}
export async function register(email, username, password, displayName) {
    const result = await fetchAPI('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ email, username, password, display_name: displayName }),
    });
    if (result.success && result.data?.token) {
        setAuthToken(result.data.token);
    }
    return result;
}
// Health API
export async function getHealth() {
    return fetchAPI('/health');
}
// Player API
export async function getPlayerState() {
    return fetchAPI('/player/state');
}
export async function updatePlayerState(data) {
    return fetchAPI('/player/update', {
        method: 'POST',
        body: JSON.stringify(data),
    });
}
export async function movePlayer(locationId) {
    return fetchAPI('/player/move', {
        method: 'POST',
        body: JSON.stringify({ target_location_id: locationId }),
    });
}
export async function sleepPlayer() {
    return fetchAPI('/player/sleep', {
        method: 'POST',
    });
}
export async function spendTimeBlocks(amount, description) {
    return fetchAPI('/player/spend-time-blocks', {
        method: 'POST',
        body: JSON.stringify({ amount, description }),
    });
}
export async function setPlayerFlag(key, value) {
    return fetchAPI('/player/set-flag', {
        method: 'POST',
        body: JSON.stringify({ key, value }),
    });
}
// Location API
export async function getLocation(id) {
    return fetchAPI(`/location/${id}`);
}
export async function getAllLocations() {
    return fetchAPI('/location');
}
export async function getLocationDialogues(id) {
    return fetchAPI(`/location/${id}/dialogues`);
}
// Dialogue API
export async function getDialogue(id) {
    return fetchAPI(`/dialogue/${id}`);
}
export async function startDialogue(dialogueId) {
    return fetchAPI(`/dialogue/${dialogueId}/start`, {
        method: 'POST',
    });
}
export async function startDialogueWithCharacter(characterId, sceneId) {
    return fetchAPI('/dialogue/start', {
        method: 'POST',
        body: JSON.stringify({ characterId, sceneId }),
    });
}
export async function makeDialogueChoice(dialogueId, choiceIndex) {
    return fetchAPI(`/dialogue/${dialogueId}/choose`, {
        method: 'POST',
        body: JSON.stringify({ choiceIndex }),
    });
}
export async function getActiveDialogue() {
    return fetchAPI('/dialogue/active');
}
export async function endDialogue() {
    return fetchAPI('/dialogue/end', {
        method: 'POST',
    });
}
