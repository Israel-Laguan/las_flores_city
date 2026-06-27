/**
 * Dialogue UI HTML template builders
 * Extracted from DialogueUI.ts to reduce file length
 */

import type { DialogueNode } from '../components/DialogueUI';

export interface ChoiceData {
  id: string;
  text: string;
  next_node_id: string;
  time_block_cost?: { amount: number; description: string };
  relationship_change?: { stat: string; amount: number };
}

// --- Helper functions ---

function buildSpeakerInfo(speakerName: string, speakerTitle: string): string {
  return `
    <div class="speaker-info">
      <span class="speaker-name">${speakerName}</span>
      ${speakerTitle ? `<span class="speaker-title">${speakerTitle}</span>` : ''}
    </div>`;
}

function buildDialogueText(): string {
  return `<div class="dialogue-text"></div>`;
}

function buildChoiceButton(choice: ChoiceData, index: number, currentTimeBlocks: number): string {
  const tbCost = choice.time_block_cost?.amount ?? 0;
  const canAfford = tbCost === 0 || currentTimeBlocks >= tbCost;

  const costPrefix = tbCost > 0
    ? `<span class="tb-cost-label ${canAfford ? 'tb-affordable' : 'tb-unaffordable'}">[-${tbCost} TB] </span>`
    : '';

  const relationshipLabel = choice.relationship_change
    ? `<span style="color:var(--neon-magenta);font-size:10px;margin-left:8px;">[+${choice.relationship_change.amount} ${choice.relationship_change.stat}]</span>`
    : '';

  const disabledAttr = !canAfford ? 'disabled' : '';
  const disabledClass = !canAfford ? 'choice-btn btn-disabled-red' : 'choice-btn';

  return `
    <button class="${disabledClass}" data-choice-index="${index}" ${disabledAttr}>
      ${costPrefix}${choice.text}${relationshipLabel}
    </button>`;
}

export function buildChoiceButtons(choices: ChoiceData[], currentTimeBlocks: number = 999): string {
  return choices.map((choice, i) => buildChoiceButton(choice, i, currentTimeBlocks)).join('');
}

export function buildChoicesContainer(choices: ChoiceData[], currentTimeBlocks: number = 999): string {
  if (choices.length === 0) return '';

  return `<div class="dialogue-choices">${buildChoiceButtons(choices, currentTimeBlocks)}</div>`;
}

function buildEndIndicator(): string {
  return `<div class="end-indicator">[Dialogue Complete]</div>`;
}

// --- Main export ---

export function buildDialogueHTML(
  currentNode: DialogueNode,
  availableChoices: ChoiceData[],
  currentTimeBlocks: number = 999
): string {
  const speakerName = currentNode.speaker?.name || 'Narrator';
  const speakerTitle = currentNode.speaker?.title || '';

  const speakerHtml = buildSpeakerInfo(speakerName, speakerTitle);
  const textHtml = buildDialogueText();
  const choicesHtml = buildChoicesContainer(availableChoices, currentTimeBlocks);
  const endHtml = currentNode.is_end || availableChoices.length === 0
    ? buildEndIndicator()
    : '';

  return `
    <div class="dialogue-box">
      ${speakerHtml}
      ${textHtml}
      ${choicesHtml}
      ${endHtml}
    </div>`;
}