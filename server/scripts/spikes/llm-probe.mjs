// Shared helper for SC-S8 / SC-S10 cheap-model probes. Never fabricates: if no
// authenticated LiteLLM endpoint answers, callers print "not run — endpoint unavailable".
//   env: LITELLM_BASE_URL (default http://localhost:4000), LITELLM_API_KEY, LLM_MODEL
const BASE = (process.env.LITELLM_BASE_URL || 'http://localhost:4000').replace(/\/$/, '');
const KEY = process.env.LITELLM_API_KEY || '';
export const MODEL = process.env.LLM_MODEL || 'poolside/laguna-m.1';

/** Returns {ok:true, text, usage} or {ok:false, reason}. Never throws. */
export async function callCheapModel(system, user) {
  try {
    const res = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(KEY ? { authorization: `Bearer ${KEY}` } : {}) },
      body: JSON.stringify({ model: MODEL, temperature: 0, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status} from ${BASE} (api key ${KEY ? 'set' : 'NOT set'})` };
    const j = await res.json();
    return { ok: true, text: j.choices?.[0]?.message?.content ?? '', usage: j.usage };
  } catch (e) {
    return { ok: false, reason: `${e.name}: ${e.message} (${BASE})` };
  }
}

/** One cheap availability probe so the script can say so before looping. */
export async function endpointAvailable() {
  const r = await callCheapModel('Reply with the single word: ok', 'ping');
  return r.ok ? { ok: true } : r;
}
