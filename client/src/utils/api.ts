/// <reference types="vite/client" />

const API_BASE = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3000';

let authToken: string | null = localStorage.getItem('auth_token');

export function setAuthToken(token: string | null) {
  authToken = token;
  if (token) {
    localStorage.setItem('auth_token', token);
  } else {
    localStorage.removeItem('auth_token');
  }
}

export function getAuthToken(): string | null {
  return authToken;
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
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
export async function devLogin(userId?: string): Promise<any> {
  const result: any = await fetchAPI('/auth/dev-login', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  if (result.success && result.data?.token) {
    setAuthToken(result.data.token);
  }
  return result;
}

export async function login(email: string, password: string): Promise<any> {
  const result: any = await fetchAPI('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (result.success && result.data?.token) {
    setAuthToken(result.data.token);
  }
  return result;
}

export async function register(email: string, username: string, password: string, displayName?: string): Promise<any> {
  const result: any = await fetchAPI('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, username, password, display_name: displayName }),
  });
  if (result.success && result.data?.token) {
    setAuthToken(result.data.token);
  }
  return result;
}

// Health API
export async function getHealth(): Promise<any> {
  return fetchAPI('/health');
}

// Player API
export async function getPlayerState(): Promise<any> {
  return fetchAPI('/player/state');
}

export async function updatePlayerState(data: {
  time_blocks?: number;
  credits?: number;
  gold_credits?: number;
  current_location_id?: string;
  current_node_id?: string | null;
}): Promise<any> {
  return fetchAPI('/player/update', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function movePlayer(locationId: string): Promise<any> {
  return fetchAPI('/player/move', {
    method: 'POST',
    body: JSON.stringify({ target_location_id: locationId }),
  });
}

export async function sleepPlayer(): Promise<any> {
  return fetchAPI('/player/sleep', {
    method: 'POST',
  });
}

export async function spendTimeBlocks(amount: number, description: string): Promise<any> {
  return fetchAPI('/player/spend-time-blocks', {
    method: 'POST',
    body: JSON.stringify({ amount, description }),
  });
}

export async function setPlayerFlag(key: string, value: boolean): Promise<any> {
  return fetchAPI('/player/set-flag', {
    method: 'POST',
    body: JSON.stringify({ key, value }),
  });
}

// Location API
export async function getLocation(id: string): Promise<any> {
  return fetchAPI(`/location/${id}`);
}

export async function getAllLocations(): Promise<any> {
  return fetchAPI('/location');
}

export async function getLocationDialogues(id: string): Promise<any> {
  return fetchAPI(`/location/${id}/dialogues`);
}

// Dialogue API
export async function getDialogue(id: string): Promise<any> {
  return fetchAPI(`/dialogue/${id}`);
}

export async function startDialogue(dialogueId: string): Promise<any> {
  return fetchAPI(`/dialogue/${dialogueId}/start`, {
    method: 'POST',
  });
}

export async function startDialogueWithCharacter(
  characterId: string,
  sceneId: string
): Promise<any> {
  return fetchAPI('/dialogue/start', {
    method: 'POST',
    body: JSON.stringify({ characterId, sceneId }),
  });
}

export async function makeDialogueChoice(
  dialogueId: string,
  choiceIndex: number
): Promise<any> {
  return fetchAPI(`/dialogue/${dialogueId}/choose`, {
    method: 'POST',
    body: JSON.stringify({ choiceIndex }),
  });
}

export async function getActiveDialogue(): Promise<any> {
  return fetchAPI('/dialogue/active');
}

export async function endDialogue(): Promise<any> {
  return fetchAPI('/dialogue/end', {
    method: 'POST',
  });
}
