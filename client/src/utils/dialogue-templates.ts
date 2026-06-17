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

function buildChoiceButton(choice: ChoiceData, index: number): string {
  const timeBlockLabel = choice.time_block_cost
    ? `<span style="color: #666; font-size: 10px; margin-left: 8px;">[${choice.time_block_cost.amount} TB]</span>`
    : '';
  const relationshipLabel = choice.relationship_change
    ? `<span style="color: #ff00ff; font-size: 10px; margin-left: 8px;">[+${choice.relationship_change.amount} ${choice.relationship_change.stat}]</span>`
    : '';

  return `
    <button class="choice-btn" data-choice-index="${index}" style="
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
      ${choice.text}${timeBlockLabel}${relationshipLabel}
    </button>`;
}

function buildChoicesContainer(choices: ChoiceData[]): string {
  if (choices.length === 0) return '';

  const buttonsHtml = choices.map((choice, i) => buildChoiceButton(choice, i)).join('');

  return `
    <div class="dialogue-choices" style="
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 120px;
      overflow-y: auto;
      scrollbar-width: thin;
      scrollbar-color: #00ff00 #0a0a1a;
    ">${buttonsHtml}</div>`;
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
  availableChoices: ChoiceData[]
): string {
  const speakerName = currentNode.speaker?.name || 'Narrator';
  const speakerTitle = currentNode.speaker?.title || '';

  const speakerHtml = buildSpeakerInfo(speakerName, speakerTitle);
  const textHtml = buildDialogueText();
  const choicesHtml = buildChoicesContainer(availableChoices);
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