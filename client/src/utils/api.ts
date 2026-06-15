import type { ApiResponse, PlayerState, Location, DialogueTree, DialogueNode, DialogueChoice } from '@las-flores/shared';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
  
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  
  return response.json();
}

// Health API
export async function getHealth(): Promise<ApiResponse> {
  return fetchAPI('/health');
}

export async function getPlayerStateHealth(): Promise<ApiResponse> {
  return fetchAPI('/health/player-state');
}

// Player API
export async function getPlayerState(): Promise<ApiResponse> {
  return fetchAPI('/player/state');
}

export async function spendTimeBlocks(amount: number, description: string): Promise<ApiResponse> {
  return fetchAPI('/player/spend-time-blocks', {
    method: 'POST',
    body: JSON.stringify({ amount, description }),
  });
}

export async function setPlayerFlag(key: string, value: boolean): Promise<ApiResponse> {
  return fetchAPI('/player/set-flag', {
    method: 'POST',
    body: JSON.stringify({ key, value }),
  });
}

// Location API
export async function getLocation(id: string): Promise<ApiResponse> {
  return fetchAPI(`/location/${id}`);
}

export async function getLocationDialogues(id: string): Promise<ApiResponse> {
  return fetchAPI(`/location/${id}/dialogues`);
}

// Dialogue API
export async function getDialogue(id: string): Promise<ApiResponse> {
  return fetchAPI(`/dialogue/${id}`);
}

export async function makeDialogueChoice(
  dialogueId: string,
  choiceId: string,
  nodeId: string
): Promise<ApiResponse> {
  return fetchAPI(`/dialogue/${dialogueId}/choose`, {
    method: 'POST',
    body: JSON.stringify({ choice_id: choiceId, node_id: nodeId }),
  });
}
