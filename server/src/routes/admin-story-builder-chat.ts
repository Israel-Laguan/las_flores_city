import express from 'express';
import type { AuthRequest } from '../middleware/auth.js';
import { ChatMessageSchema, ChatModeSchema, type ChatMessage } from '@las-flores/shared';
import { emitAdminEvent } from '../services/AdminEventEmitter.js';
import { chatService, ChatDeltaValidationError, ChatGraphDisabledError, ChatAnnotationNotFoundError } from '../services/ChatService.js';

// ============================================================
// M29 — Conversational chat assistant routes (Moment 4)
//
// The chat is EPHEMERAL: the client sends the full multi-turn history on every
// request and the server stages it into the provider — no chat persistence. The
// only durable side-effects are: proposed deltas written to the graph (apply),
// a declined delta removed (discard), and a resolved conflict marked 'addressed'
// (durable Postgres + graph mirror). Response/error envelope mirrors
// `admin-story-builder-critique.ts`.
// ============================================================

export const adminStoryBuilderChatRouter = express.Router();

/** Cost control — keep only the last ~40 messages of a long-running session. */
const CHAT_HISTORY_CAP = 40;

// POST /admin/story-builder/plans/:id/chat
// Body: { messages: ChatMessage[]; mode?: 'explain'|'propose' (default explain); annotationId?: string }
//  → explain : prose reply           { reply, usage }
//  → propose : structured deltas     { reply, deltas, deltaEdges, usage }
adminStoryBuilderChatRouter.post('/plans/:id/chat', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const messagesIn = Array.isArray(req.body?.messages) ? req.body.messages : [];
    if (messagesIn.length === 0) {
      res.status(400).json({ success: false, error: '"messages" is required (non-empty array of ChatMessage)', timestamp: new Date().toISOString() });
      return;
    }
    // Validate every message against ChatMessageSchema (role ∈ user|assistant,
    // content min 1) and forward the parsed data — never the raw request objects.
    const parsedMessages: ChatMessage[] = [];
    for (let i = 0; i < messagesIn.length; i++) {
      const parsed = ChatMessageSchema.safeParse(messagesIn[i]);
      if (!parsed.success) {
        res.status(400).json({ success: false, error: `messages[${i}]: ${parsed.error.issues.map((x) => x.message).join('; ')}`, timestamp: new Date().toISOString() });
        return;
      }
      parsedMessages.push(parsed.data);
    }

    const mode = (req.body?.mode as string) || 'explain';
    if (!(ChatModeSchema.options as readonly string[]).includes(mode)) {
      res.status(400).json({ success: false, error: "mode must be 'explain' or 'propose'", timestamp: new Date().toISOString() });
      return;
    }

    const annotationId = typeof req.body?.annotationId === 'string' ? req.body.annotationId : undefined;
    const capped = parsedMessages.slice(-CHAT_HISTORY_CAP);
    // A truncated window must still start on a user turn (several chat APIs
    // reject a history that opens with an assistant message).
    const firstUser = capped.findIndex((m) => m.role === 'user');
    const history = firstUser >= 0 ? capped.slice(firstUser) : [];
    if (history.length === 0) {
      res.status(400).json({ success: false, error: '"messages" must contain at least one user message', timestamp: new Date().toISOString() });
      return;
    }

    if (mode === 'propose') {
      const { reply, deltas, deltaEdges, usage } = await chatService.propose(id, history, annotationId);
      emitAdminEvent('plan_chat_reply', { mode: 'propose', turns: history.length, deltas: deltas.length, annotationId: annotationId ?? null }, id, req.userId);
      res.json({ success: true, data: { mode: 'propose', reply, deltas, deltaEdges, usage }, timestamp: new Date().toISOString() });
      return;
    }

    const { reply, usage } = await chatService.explain(id, history, annotationId);
    emitAdminEvent('plan_chat_reply', { mode: 'explain', turns: history.length, annotationId: annotationId ?? null }, id, req.userId);
    res.json({ success: true, data: { mode: 'explain', reply, usage }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/chat error:', error);
    const status = error instanceof ChatAnnotationNotFoundError ? 404 : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to run chat', timestamp: new Date().toISOString() });
  }
});

// POST /admin/story-builder/plans/:id/chat/apply-delta
// Body: { deltas: GraphDelta[]; deltaEdges?: GraphDeltaEdge[]; annotationId?: string }
//  → validate → write shadow deltas → mark conflict 'addressed' → merged-view refresh
adminStoryBuilderChatRouter.post('/plans/:id/chat/apply-delta', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    if (!Array.isArray(req.body?.deltas) || req.body.deltas.length === 0) {
      res.status(400).json({ success: false, error: '"deltas" is required (non-empty array of GraphDelta)', timestamp: new Date().toISOString() });
      return;
    }
    const deltas = req.body.deltas as Array<Record<string, unknown>>;
    const deltaEdges = Array.isArray(req.body?.deltaEdges) ? req.body.deltaEdges as Array<Record<string, unknown>> : [];
    const annotationId = typeof req.body?.annotationId === 'string' ? req.body.annotationId : undefined;

    // Raw records are passed in; ChatService's GraphDeltaSchema.safeParse gate
    // runs the validate-before-write check (and throws ChatDeltaValidationError).
    const result = await chatService.applyDeltas(id, deltas as never, deltaEdges as never, annotationId);

    // Ops audit trail — carry the originating annotation so reviewers can link
    // the application back to the conflict it resolved (§13).
    emitAdminEvent('plan_delta_applied', { appliedCount: result.appliedCount, annotationId: annotationId ?? null }, id, req.userId);

    res.json({ success: true, data: { appliedCount: result.appliedCount, mergedView: result.mergedView }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/chat/apply-delta error:', error);
    const status = error instanceof ChatDeltaValidationError ? 400
      : error instanceof ChatAnnotationNotFoundError ? 404
      : error instanceof ChatGraphDisabledError ? 409
      : 500;
    res.status(status).json({ success: false, error: error.message || 'Failed to apply delta', timestamp: new Date().toISOString() });
  }
});

// POST /admin/story-builder/plans/:id/chat/discard-delta
// Body: { nodeType, nodeId }  → "[Keep existing]" — decline a proposed delta
adminStoryBuilderChatRouter.post('/plans/:id/chat/discard-delta', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params as Record<string, string>;
    const nodeType = typeof req.body?.nodeType === 'string' ? req.body.nodeType : '';
    const nodeId = typeof req.body?.nodeId === 'string' ? req.body.nodeId : '';
    if (!nodeType || !nodeId) {
      res.status(400).json({ success: false, error: '"nodeType" and "nodeId" are required', timestamp: new Date().toISOString() });
      return;
    }
    await chatService.discardDelta(id, nodeType, nodeId);
    emitAdminEvent('plan_delta_discarded', { nodeType, nodeId }, id, req.userId);
    res.json({ success: true, data: { discarded: { nodeType, nodeId } }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[story-builder] POST /plans/:id/chat/discard-delta error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to discard delta', timestamp: new Date().toISOString() });
  }
});

// GET /admin/story-builder/review-queue — global needs_review triage queue
adminStoryBuilderChatRouter.get('/review-queue', async (req: AuthRequest, res) => {
  try {
    const items = await chatService.getReviewQueue();
    res.json({ success: true, data: { items }, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[story-builder] GET /review-queue error:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to load review queue', timestamp: new Date().toISOString() });
  }
});