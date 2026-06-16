import { eventBus } from '../utils/EventBus';
import * as api from '../utils/api';

enum DialogueUIState {
  HIDDEN = 'HIDDEN',
  SLIDING_IN = 'SLIDING_IN',
  TYPING = 'TYPING',
  AWAITING_CHOICE = 'AWAITING_CHOICE',
  SUBMITTING = 'SUBMITTING',
  SLIDING_OUT = 'SLIDING_OUT',
}

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
  private state: DialogueUIState = DialogueUIState.HIDDEN;
  private currentDialogue: DialogueState | null = null;
  private typewriterInterval: number | null = null;
  private fullText: string = '';
  private currentCharIndex: number = 0;
  private dialogueTextEl: HTMLDivElement | null = null;
  private choicesContainer: HTMLDivElement | null = null;
  private skipRequested: boolean = false;

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
    this.container.style.bottom = '0';
    this.container.style.left = '0';
    this.container.style.width = '100%';
    this.container.style.height = '30vh';
    this.container.style.backgroundColor = 'rgba(10, 10, 30, 0.85)';
    this.container.style.backdropFilter = 'blur(10px)';
    (this.container.style as any).webkitBackdropFilter = 'blur(10px)';
    this.container.style.borderTop = '1px solid rgba(0, 255, 0, 0.4)';
    this.container.style.boxShadow = '0 -4px 30px rgba(0, 255, 0, 0.1)';
    this.container.style.zIndex = '2000';
    this.container.style.display = 'flex';
    this.container.style.justifyContent = 'center';
    this.container.style.alignItems = 'center';
    this.container.style.fontFamily = 'monospace';
    this.container.style.transform = 'translateY(100%)';
    this.container.style.transition = 'transform 0.3s ease-out';
    this.container.style.pointerEvents = 'none';
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
      this.slideOut();
    });

    eventBus.on('dialogue:resume', async () => {
      await this.resumeDialogue();
    });

    this.container.addEventListener('click', (e) => {
      if (this.state === DialogueUIState.TYPING) {
        this.skipTyping();
      }
    });
  }

  private async startDialogue(dialogueId: string) {
    try {
      const result = await api.startDialogue(dialogueId);
      if (result.success && result.data) {
        this.currentDialogue = {
          tree: result.data.tree,
          currentNode: result.data.current_node,
          availableChoices: result.data.available_choices,
        };
        this.slideIn();
      }
    } catch (error) {
      console.error('Failed to start dialogue:', error);
    }
  }

  private async startDialogueWithCharacter(characterId: string, sceneId: string) {
    try {
      const result = await api.startDialogueWithCharacter(characterId, sceneId);
      if (result.success && result.data) {
        this.currentDialogue = {
          tree: result.data.tree,
          currentNode: result.data.current_node,
          availableChoices: result.data.available_choices,
        };
        this.slideIn();
      }
    } catch (error) {
      console.error('Failed to start dialogue:', error);
    }
  }

  private async resumeDialogue() {
    try {
      const result = await api.getActiveDialogue();
      if (result.success && result.data) {
        this.currentDialogue = {
          tree: result.data.tree,
          currentNode: result.data.current_node,
          availableChoices: result.data.available_choices,
        };
        this.slideIn();
      }
    } catch (error) {
      console.error('Failed to resume dialogue:', error);
    }
  }

  private slideIn() {
    this.state = DialogueUIState.SLIDING_IN;
    this.container.style.pointerEvents = 'auto';
    this.container.style.transform = 'translateY(0)';

    eventBus.emit('dialogue:opened');
    eventBus.emit('phaser:pause-input');

    setTimeout(() => {
      if (this.state === DialogueUIState.SLIDING_IN) {
        this.renderDialogue();
      }
    }, 300);
  }

  private slideOut() {
    this.state = DialogueUIState.SLIDING_OUT;
    this.container.style.transform = 'translateY(100%)';

    this.clearTypewriter();

    setTimeout(() => {
      this.container.style.pointerEvents = 'none';
      this.currentDialogue = null;
      this.state = DialogueUIState.HIDDEN;
      eventBus.emit('dialogue:closed');
      eventBus.emit('phaser:resume-input');
    }, 300);
  }

  private async makeChoice(choiceIndex: number) {
    if (!this.currentDialogue || this.state === DialogueUIState.SUBMITTING) return;

    this.state = DialogueUIState.SUBMITTING;
    this.disableButtons();

    try {
      const result = await api.makeDialogueChoice(
        this.currentDialogue.tree.id,
        choiceIndex
      );

      if (result.success && result.data) {
        if (result.data.next_node?.thought) {
          eventBus.emit('monologue:thought', result.data.next_node.thought);
        }

        if (result.data.time_blocks_remaining !== undefined) {
          eventBus.emit('tb:updated', result.data.time_blocks_remaining);
        }

        if (result.data.is_end) {
          this.currentDialogue.currentNode = result.data.next_node;
          this.currentDialogue.availableChoices = [];
          this.renderDialogue();
          setTimeout(() => this.slideOut(), 3000);
          return;
        }

        this.currentDialogue.currentNode = result.data.next_node;
        this.currentDialogue.availableChoices = result.data.available_choices;
        this.renderDialogue();
      } else {
        this.state = DialogueUIState.AWAITING_CHOICE;
        this.enableButtons();
      }
    } catch (error) {
      console.error('Failed to make choice:', error);
      this.state = DialogueUIState.AWAITING_CHOICE;
      this.enableButtons();
    }
  }

  private renderDialogue() {
    if (!this.currentDialogue) return;

    const { currentNode, availableChoices } = this.currentDialogue;

    this.container.innerHTML = this.buildDialogueHTML(currentNode, availableChoices);

    this.dialogueTextEl = this.container.querySelector('.dialogue-text') as HTMLDivElement;
    this.choicesContainer = this.container.querySelector('.dialogue-choices') as HTMLDivElement;

    this.attachChoiceButtonListeners();

    if (this.choicesContainer) {
      this.choicesContainer.style.opacity = '0';
      this.choicesContainer.style.transition = 'opacity 0.3s ease';
    }

    this.startTypewriter(currentNode.text);

    eventBus.emit('dialogue:node-rendered', {
      type: currentNode.type,
      speaker: currentNode.speaker,
      thought: currentNode.thought,
    });
  }

  private startTypewriter(text: string) {
    if (!this.dialogueTextEl) return;

    this.fullText = text;
    this.currentCharIndex = 0;
    this.state = DialogueUIState.TYPING;
    this.skipRequested = false;
    this.dialogueTextEl.innerHTML = '';

    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
    }

    this.typewriterInterval = window.setInterval(() => {
      if (this.skipRequested) {
        this.finishTyping();
        return;
      }

      if (this.currentCharIndex >= this.fullText.length) {
        this.finishTyping();
        return;
      }

      if (this.fullText[this.currentCharIndex] === '<') {
        const closingIndex = this.fullText.indexOf('>', this.currentCharIndex);
        if (closingIndex !== -1) {
          this.currentCharIndex = closingIndex + 1;
          this.dialogueTextEl!.innerHTML = this.fullText.substring(0, this.currentCharIndex);
          return;
        }
      }

      this.currentCharIndex++;
      this.dialogueTextEl!.innerHTML = this.fullText.substring(0, this.currentCharIndex);
    }, 30);
  }

  private finishTyping() {
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }

    if (this.dialogueTextEl) {
      this.dialogueTextEl.innerHTML = this.fullText;
    }

    this.state = DialogueUIState.AWAITING_CHOICE;

    if (this.choicesContainer && this.currentDialogue && this.currentDialogue.availableChoices.length > 0) {
      this.choicesContainer.style.opacity = '1';
    }
  }

  private clearTypewriter() {
    if (this.typewriterInterval) {
      clearInterval(this.typewriterInterval);
      this.typewriterInterval = null;
    }
    this.skipRequested = false;
  }

  private skipTyping() {
    if (this.state !== DialogueUIState.TYPING) return;
    this.skipRequested = true;
  }

  private disableButtons() {
    if (this.choicesContainer) {
      const buttons = this.choicesContainer.querySelectorAll('.choice-btn');
      buttons.forEach(btn => {
        (btn as HTMLButtonElement).disabled = true;
        (btn as HTMLElement).style.pointerEvents = 'none';
        (btn as HTMLElement).style.opacity = '0.5';
      });
    }
  }

  private enableButtons() {
    if (this.choicesContainer) {
      const buttons = this.choicesContainer.querySelectorAll('.choice-btn');
      buttons.forEach(btn => {
        (btn as HTMLButtonElement).disabled = false;
        (btn as HTMLElement).style.pointerEvents = 'auto';
        (btn as HTMLElement).style.opacity = '1';
      });
    }
  }

  private buildDialogueHTML(currentNode: DialogueNode, availableChoices: any[]): string {
    const speakerName = currentNode.speaker?.name || 'Narrator';
    const speakerTitle = currentNode.speaker?.title || '';

    return `
      <div class="dialogue-box" style="
        width: 90%;
        max-width: 800px;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
      ">
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
        </div>

        <div class="dialogue-text" style="
          font-size: 15px;
          line-height: 1.6;
          color: #ccc;
          min-height: 60px;
          margin-bottom: 15px;
          cursor: pointer;
        "></div>

        <div class="dialogue-choices" style="
          display: flex;
          flex-direction: column;
          gap: 8px;
          max-height: 120px;
          overflow-y: auto;
          scrollbar-width: thin;
          scrollbar-color: #00ff00 #0a0a1a;
        ">
          ${availableChoices.map((choice, index) => `
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
              ${choice.text}
              ${choice.time_block_cost ? `<span style="color: #666; font-size: 10px; margin-left: 8px;">[${choice.time_block_cost.amount} TB]</span>` : ''}
              ${choice.relationship_change ? `<span style="color: #ff00ff; font-size: 10px; margin-left: 8px;">[+${choice.relationship_change.amount} ${choice.relationship_change.stat}]</span>` : ''}
            </button>
          `).join('')}
        </div>

        ${currentNode.is_end || availableChoices.length === 0 ? `
          <div class="end-indicator" style="
            text-align: center;
            color: #555;
            font-size: 11px;
            margin-top: 15px;
            text-transform: uppercase;
            letter-spacing: 1px;
          ">[Dialogue Complete]</div>
        ` : ''}
      </div>
    `;
  }

  private attachChoiceButtonListeners() {
    if (!this.choicesContainer) return;

    const choiceButtons = this.choicesContainer.querySelectorAll('.choice-btn');
    choiceButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const choiceIndex = parseInt(button.getAttribute('data-choice-index') || '0', 10);
        this.makeChoice(choiceIndex);
      });

      button.addEventListener('mouseenter', () => {
        if (!(button as HTMLButtonElement).disabled) {
          (button as HTMLElement).style.backgroundColor = 'rgba(0, 255, 0, 0.15)';
          (button as HTMLElement).style.borderColor = 'rgba(0, 255, 0, 0.6)';
        }
      });

      button.addEventListener('mouseleave', () => {
        (button as HTMLElement).style.backgroundColor = 'rgba(0, 255, 0, 0.05)';
        (button as HTMLElement).style.borderColor = 'rgba(0, 255, 0, 0.3)';
      });
    });
  }
}
