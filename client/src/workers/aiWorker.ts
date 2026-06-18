/// <reference lib="webworker" />
import { preserveImportantTags } from '../../../shared/src/importantTags.js';

interface RewriteRequest {
  id: string;
  type: 'rewrite_choices';
  choices: Array<{ id: string; text: string; next_node_id: string; [key: string]: any }>;
  relationshipContext: string;
  localKey: string;
  jwt: string;
}

interface WorkerResponse {
  id: string;
  status: 'success' | 'error';
  choices?: Array<{ id: string; text: string; next_node_id: string; [key: string]: any }>;
  error?: string;
}

self.onmessage = async (event: MessageEvent<RewriteRequest>) => {
  const { id, type, choices, relationshipContext, localKey, jwt } = event.data;

  if (type !== 'rewrite_choices') return;

  try {
    const API_BASE = self.location.origin || 'http://localhost:3000';

    const res = await fetch(`${API_BASE}/settings/ai-key-share`, {
      headers: { Authorization: `Bearer ${jwt}` },
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || `Failed to fetch AI key share: ${res.status}`);
    }

    const { ciphertext, iv } = await res.json();

    const keyBytes = Uint8Array.from(atob(localKey), (c) => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );
    const cipherBytes = Uint8Array.from(atob(ciphertext), (c) => c.charCodeAt(0));
    const ivBytes = Uint8Array.from(atob(iv), (c) => c.charCodeAt(0));

    const plainBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: ivBytes },
      cryptoKey,
      cipherBytes
    );
    const fullApiKey = new TextDecoder().decode(plainBuffer);

    const originalTexts = choices.map((c) => c.text);

    const systemPrompt = `You are the inner voice of an AI. Based on the following relationship context: "${relationshipContext}", rewrite the following dialogue choices to sound like natural responses that match the player's relationship with the NPC.
CRITICAL RULE: You MUST NOT alter any words wrapped inside <important> tags. Keep the tags and their content exactly as they are.
Return a strict JSON array of exactly ${originalTexts.length} strings, one for each choice. Do not add any extra keys.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${fullApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify(originalTexts) },
        ],
        temperature: 0.7,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      throw new Error(errBody.error?.message || `LLM API error: ${response.status}`);
    }

    const json = await response.json();
    const content = json.choices[0].message.content;
    const parsed = JSON.parse(content);
    const rewrittenTexts: string[] = Array.isArray(parsed) ? parsed : parsed.rewritten_options || parsed.choices || [];

    if (rewrittenTexts.length !== originalTexts.length) {
      throw new Error('LLM returned wrong number of choices');
    }

    const safeChoices = choices.map((choice, index) => {
      const rewritten = rewrittenTexts[index] || choice.text;
      return {
        ...choice,
        text: preserveImportantTags(choice.text, rewritten),
      };
    });

    const response_msg: WorkerResponse = { id, status: 'success', choices: safeChoices };
    self.postMessage(response_msg);
  } catch (err: any) {
    const response_msg: WorkerResponse = { id, status: 'error', error: err.message };
    self.postMessage(response_msg);
  }
};
