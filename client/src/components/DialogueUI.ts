import { eventBus } from '../utils/EventBus';
import * as api from '../utils/api';

interface DialogueNode {
  id: string;
  type: string;
  text: string;
  thought?: string;
  speaker_id?: string;
  speaker?: {
    id: string;
    name: string;
    title: string;
    avatar_url: string | null;
  };
  choices?: Array<{
    id: string;
    text: string;
    next_node_id: string;
    time_block_cost?: { amount: number; description: string };
    relationship_change?: { stat: string; amount: number };
  }>;
  effects?: any;
  is_end?: boolean;
}

interface DialogueState {
  tree: any;
  currentNode: DialogueNode;
  availableChoices: any[];
}

export class DialogueUI {
  private container: HTMLDivElement;
  private isActive: boolean = false;
  private currentDialogue: DialogueState | null = null;
  private typewriterInterval: number | null = null;
  private isTyping: boolean = false;
  private fullText: string = '';
  private currentCharIndex: number = 0;

  constructor() {
    this.container = document.getElementById('dialogue-overlay') as HTMLDivElement;
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'dialogue-overlay';
      document.body.appendChild(this.container);
    }
    this.setupStyles();
    this.setupEventListeners();
  }

  private setupStyles() {
    this.container.style.position = 'fixed';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.85)';
    this.container.style.zIndex = '2000';
    this.container.style.display = 'none';
    this.container.style.justifyContent = 'center';
    this.container.style.alignItems = 'center';
    this.container.style.fontFamily = 'monospace';
  }

  private setupEventListeners() {
    eventBus.on('dialogue:start', async (data: { dialogueId?: string; characterId?: string; sceneId?: string }) => {
      if (data.characterId && data.sceneId) {
        await this.startDialogueWithCharacter(data.characterId, data.sceneId);
      } else if (data.dialogueId) {
        await this.startDialogue(data.dialogueId);
      }
    });

    eventBus.on('dialogue:choose', async (choiceIndex: number) => {
      await this.makeChoice(choiceIndex);
    });

    eventBus.on('dialogue:end', () => {
      this.close();
    });

    eventBus.on('dialogue:resume', async () => {
      await this.resumeDialogue();
    });

    this.container.addEventListener('click', (e) => {
      if (this.isTyping && (e.target as HTMLElement).classList.contains('dialogue-text')) {
        this.skipTyping();
      }
    });
  }

  async startDialogue(dialogueId: string) {
    try {
      const result = await api.startDialogue(dialogueId);
      if (result.success && result.data) {
        this.currentDialogue = {
          tree: result.data.tree,
          currentNode: result.data.current_node,
          availableChoices: result.data.available_choices,
        };
        this.open();
        this.renderDialogue();
      }
    } catch (error) {
      console.error('Failed to start dialogue:', error);
    }
  }

  async startDialogueWithCharacter(characterId: string, sceneId: string) {
    try {
      const result = await api.startDialogueWithCharacter(characterId, sceneId);
      if (result.success && result.data) {
        this.currentDialogue = {
          tree: result.data.tree,
          currentNode: result.data.current_node,
          availableChoices: result.data.available_choices,
        };
        this.open();
        this.renderDialogue();
      }
    } catch (error) {
      console.error('Failed to start dialogue:', error);
    }
  }

  async resumeDialogue() {
    try {
      const result = await api.getActiveDialogue();
      if (result.success && result.data) {
        this.currentDialogue = {
          tree: result.data.tree,
          currentNode: result.data.current_node,
          availableChoices: result.data.available_choices,
        };
        this.open();
        this.renderDialogue();
      }
    } catch (error) {
      console.error('Failed to resume dialogue:', error);
    }
  }

  private async makeChoice(choiceIndex: number) {
    if (!this.currentDialogue) return;

    try {
      const result = await api.makeDialogueChoice(
        this.currentDialogue.tree.id,
        choiceIndex
      );

      if (result.success && result.data) {
        // Emit thought as monologue entry
        if (result.data.next_node?.thought) {
          eventBus.emit('monologue:thought', result.data.next_node.thought);
        }

        // Update TB display
        if (result.data.time_blocks_remaining !== undefined) {
          eventBus.emit('tb:updated', result.data.time_blocks_remaining);
        }

        // Check if dialogue ended
        if (result.data.is_end) {
          this.currentDialogue.currentNode = result.data.next_node;
          this.currentDialogue.availableChoices = [];
          this.renderDialogue();
          setTimeout(() => this.close(), 3000);
          return;
        }

        // Update to next node
        this.currentDialogue.currentNode = result.data.next_node;
        this.currentDialogue.availableChoices = result.data.available_choices;
        this.renderDialogue();
      }
    } catch (error) {
      console.error('Failed to make choice:', error);
    }
  }

  private open() {
    this.isActive = true;
    this.container.style.display = 'flex';
    eventBus.emit('dialogue:opened');
  }

  private close() {
    this.isActive = false;
    this.container.style.display = 'none';
    this.currentDialogue = null;
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }
    eventBus.emit('dialogue:closed');
  }

  private buildDialogueHTML(currentNode: DialogueNode, availableChoices: any[]): string {
    const speakerName = currentNode.speaker?.name || 'Narrator';
    const speakerTitle = currentNode.speaker?.title || '';

    return `
      <div class="dialogue-box" style="
        width: 80%;
        max-width: 700px;
        background: linear-gradient(180deg, #0a0a1a 0%, #0d0d2a 100%);
        border: 2px solid #00ff00;
        border-radius: 10px;
        padding: 30px;
        box-shadow: 0 0 30px rgba(0, 255, 0, 0.2);
      ">
        <div class="speaker-info" style="
          margin-bottom: 15px;
          padding-bottom: 10px;
          border-bottom: 1px solid #00ff00;
        ">
          <span class="speaker-name" style="
            font-size: 18px;
            font-weight: bold;
            color: #00ff00;
          ">${speakerName}</span>
          ${speakerTitle ? `<span class="speaker-title" style="
            font-size: 12px;
            color: #888;
            margin-left: 10px;
          ">${speakerTitle}</span>` : ''}
        </div>

        <div class="dialogue-text" style="
          font-size: 16px;
          line-height: 1.6;
          color: #ffffff;
          min-height: 80px;
          margin-bottom: 20px;
          cursor: pointer;
        "></div>

        <div class="dialogue-choices" style="
          display: flex;
          flex-direction: column;
          gap: 10px;
        ">
          ${availableChoices.map((choice, index) => `
            <button class="choice-btn" data-choice-index="${index}" style="
              padding: 12px 20px;
              background: transparent;
              border: 1px solid #00ff00;
              color: #00ff00;
              font-family: monospace;
              font-size: 14px;
              text-align: left;
              cursor: pointer;
              border-radius: 5px;
              transition: all 0.2s;
            ">
              ${choice.text}
              ${choice.time_block_cost ? `<span style="color: #888; font-size: 11px; margin-left: 10px;">[${choice.time_block_cost.amount} TB]</span>` : ''}
              ${choice.relationship_change ? `<span style="color: #ff00ff; font-size: 11px; margin-left: 10px;">[+${choice.relationship_change.amount} ${choice.relationship_change.stat}]</span>` : ''}
            </button>
          `).join('')}
        </div>

        ${currentNode.is_end || availableChoices.length === 0 ? `
          <div class="end-indicator" style="
            text-align: center;
            color: #888;
            font-size: 12px;
            margin-top: 20px;
          ">[Dialogue Complete]</div>
        ` : ''}
      </div>
    `;
  }

  private attachChoiceButtonListeners() {
    const choiceButtons = this.container.querySelectorAll('.choice-btn');
    choiceButtons.forEach(button => {
      button.addEventListener('click', () => {
        const choiceIndex = parseInt(button.getAttribute('data-choice-index') || '0', 10);
        this.makeChoice(choiceIndex);
      });

      button.addEventListener('mouseenter', () => {
        (button as HTMLElement).style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
      });

      button.addEventListener('mouseleave', () => {
        (button as HTMLElement).style.backgroundColor = 'transparent';
      });
    });
  }

  private renderDialogue() {
    if (!this.currentDialogue) return;

    const { currentNode, availableChoices } = this.currentDialogue;

    this.container.innerHTML = this.buildDialogueHTML(currentNode, availableChoices);

    this.typewriterEffect(currentNode.text);

    eventBus.emit('dialogue:node-rendered', {
      type: currentNode.type,
      speaker: currentNode.speaker,
      thought: currentNode.thought,
    });

    this.attachChoiceButtonListeners();
  }

  private typewriterEffect(text: string) {
    const textElement = this.container.querySelector('.dialogue-text');
    if (!textElement) return;

    this.fullText = text;
    this.currentCharIndex = 0;
    this.isTyping = true;
    textElement.textContent = '';

    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
    }

    this.typewriterInterval = window.setInterval(() => {
      if (this.currentCharIndex < this.fullText.length) {
        textElement.textContent += this.fullText[this.currentCharIndex];
        this.currentCharIndex++;
      } else {
        this.isTyping = false;
        if (this.typewriterInterval) {
          clearInterval(this.typewriterInterval);
          this.typewriterInterval = null;
        }
      }
    }, 30);
  }

  private skipTyping() {
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }

    const textElement = this.container.querySelector('.dialogue-text');
    if (textElement) {
      textElement.textContent = this.fullText;
    }
    this.isTyping = false;
  }
}
