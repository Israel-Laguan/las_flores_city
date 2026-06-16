import { Response, NextFunction } from 'express';
import { AuthRequest, authMiddleware } from '../middleware/auth.js';
import {
  commsRouter,
  err,
  ok,
  applyChoiceFilters,
  toDetail,
  loadThread,
  findDialogueTreeForCharacter,
  invalidateCaches,
} from './comms.js';
import { performReplyTransaction, emitReplyAnalytics } from './comms-reply-helpers.js';

commsRouter.post(
  '/reply',
  authMiddleware,
  async (req: AuthRequest, res: Response, _next: NextFunction) => {
    const userId = req.userId!;
    const { characterId, choiceId } = req.body ?? {};

    if (!characterId || typeof characterId !== 'string') {
      return res.status(400).json(err('characterId is required'));
    }
    if (!choiceId || typeof choiceId !== 'string') {
      return res.status(400).json(err('choiceId is required'));
    }

    try {
      const tree = await findDialogueTreeForCharacter(characterId);
      if (!tree) {
        return res.status(404).json(err('no_dialogue_for_character'));
      }

      const result = await performReplyTransaction(userId, characterId, choiceId, tree);

      if (result.status !== 200 || !('detail' in result)) {
        return res.status(result.status).json(result.payload);
      }

      const d = result.detail!;

      await emitReplyAnalytics(userId, characterId, d);

      await invalidateCaches(userId);

      const reloaded = await loadThread(userId, characterId);
      if (!reloaded) {
        return res.status(500).json(err('thread_disappeared'));
      }

      const nextChoicesRaw: any[] =
        d.isEnd || !d.nextNode || !d.nextNode.choices ? [] : d.nextNode.choices;
      const nextChoices = await applyChoiceFilters(nextChoicesRaw, userId);

      return res.json(ok(toDetail(reloaded, nextChoices, d.isEnd)));
    } catch (e: any) {
      console.error('comms.reply error:', e);
      return res.status(500).json(err(e?.message ?? 'internal_error'));
    }
  }
);
