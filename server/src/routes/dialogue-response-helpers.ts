import type { DialogueTree, DialogueNode, DialogueChoice } from '@las-flores/shared';

export function buildDialogueResponse(
  tree: DialogueTree,
  node: DialogueNode,
  speaker: any,
  choices: DialogueChoice[],
  isEnd: boolean,
  timeBlocksSpent: number,
  timeBlocksRemaining: number
) {
  return {
    success: true,
    data: {
      tree,
      current_node: node,
      available_choices: choices,
      is_end: isEnd,
    },
    timestamp: new Date().toISOString(),
  };
}

export function buildChooseResponse(
  dialogueId: string,
  choiceIndex: number,
  node: DialogueNode,
  speaker: any,
  choices: DialogueChoice[],
  isEnd: boolean,
  timeBlocksSpent: number,
  timeBlocksRemaining: number,
  unlockedVaultItem?: { id: string; title: string } | null,
  mysterySolveStatus?: { mysteryId: string; isBreakthrough: boolean; kind: 'winner' | 'solver' | 'late' } | null,
  alignmentChange?: 'loyalist' | 'fugitive' | null
) {
  return {
    success: true,
    data: {
      dialogue_id: dialogueId,
      choice_index: choiceIndex,
      next_node: node,
      available_choices: choices,
      is_end: isEnd,
      time_blocks_spent: timeBlocksSpent,
      time_blocks_remaining: timeBlocksRemaining,
      unlocked_vault_item: unlockedVaultItem,
      mystery_solve_status: mysterySolveStatus,
      alignment_change: alignmentChange,
    },
    timestamp: new Date().toISOString(),
  };
}