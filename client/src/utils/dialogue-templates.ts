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
    <div class="speaker-info" style="
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(0, 255, 0, 0.3);
    ">
      <span class="speaker-name" style="
        font-size: 16px;
        font-weight: bold;
        color: #00ff00;
        text-shadow: 0 0 5px rgba(0, 255, 0, 0.3);
      ">${speakerName}</span>
      ${speakerTitle ? `<span class="speaker-title" style="
        font-size: 11px;
        color: #666;
        margin-left: 10px;
        text-transform: uppercase;
        letter-spacing: 1px;
      ">${speakerTitle}</span>` : ''}
    </div>`;
}

function buildDialogueText(): string {
  return `
    <div class="dialogue-text" style="
      font-size: 15px;
      line-height: 1.6;
      color: #ccc;
      min-height: 60px;
      margin-bottom: 15px;
      cursor: pointer;
    "></div>`;
}

function buildChoiceButton(choice: ChoiceData, index: number, currentTimeBlocks: number): string {
  const tbCost = choice.time_block_cost?.amount ?? 0;
  const canAfford = tbCost === 0 || currentTimeBlocks >= tbCost;

  // 7.5.3: Leading cost prefix (empty string when free)
  const costPrefix = tbCost > 0
    ? `<span class="tb-cost-label ${canAfford ? 'tb-affordable' : 'tb-unaffordable'}">[-${tbCost} TB] </span>`
    : '';

  const relationshipLabel = choice.relationship_change
    ? `<span style="color: #ff00ff; font-size: 10px; margin-left: 8px;">[+${choice.relationship_change.amount} ${choice.relationship_change.stat}]</span>`
    : '';

  const disabledAttr = !canAfford ? 'disabled' : '';
  const disabledClass = !canAfford ? 'choice-btn btn-disabled-red' : 'choice-btn';

  return `
    <button class="${disabledClass}" data-choice-index="${index}" ${disabledAttr} style="
      padding: 10px 16px;
      background: rgba(0, 255, 0, 0.05);
      border: 1px solid rgba(0, 255, 0, 0.3);
      color: #00ff00;
      font-family: monospace;
      font-size: 13px;
      text-align: left;
      cursor: pointer;
      border-radius: 4px;
      transition: all 0.2s ease;
    ">
      ${costPrefix}${choice.text}${relationshipLabel}
    </button>`;
}

export function buildChoiceButtons(choices: ChoiceData[], currentTimeBlocks: number = 999): string {
  return choices.map((choice, i) => buildChoiceButton(choice, i, currentTimeBlocks)).join('');
}

export function buildChoicesContainer(choices: ChoiceData[], currentTimeBlocks: number = 999): string {
  if (choices.length === 0) return '';

  return `
    <div class="dialogue-choices" style="
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 120px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: #00ff00 #0a0a1a;
    ">${buildChoiceButtons(choices, currentTimeBlocks)}</div>`;
}

function buildEndIndicator(): string {
  return `
    <div class="end-indicator" style="
      text-align: center;
      color: #555;
      font-size: 11px;
      margin-top: 15px;
      text-transform: uppercase;
      letter-spacing: 1px;
    ">[Dialogue Complete]</div>`;
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
    <div class="dialogue-box" style="
      width: 90%;
      max-width: 800px;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: center;
    ">
      ${speakerHtml}
      ${textHtml}
      ${choicesHtml}
      ${endHtml}
    </div>`;
}