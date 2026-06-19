import { eventBus } from '../utils/EventBus';
import { phoneStore } from '../store/PhoneStore';
import { buildDialogueHTML, buildChoicesContainer, buildChoiceButtons } from '../utils/dialogue-templates';
import * as api from '../utils/api';
import { getLocalKey } from '../utils/crypto';

enum DialogueUIState {
  HIDDEN = 'HIDDEN',
  SLIDING_IN = 'SLIDING_IN',
  TYPING = 'TYPING',
  AWAITING_CHOICE = 'AWAITING_CHOICE',
  SUBMITTING = 'SUBMITTING',
  SLIDING_OUT = 'SLIDING_OUT',
}

export interface DialogueNode {
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
  private aiWorker: Worker | null = null;
  private pendingRequests: Map<string, { resolve: (choices: any[]) => void; reject: (err: Error) => void }> = new Map();

  constructor() {
    this.container = document.getElementById('dialogue-overlay') as HTMLDivElement;
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'dialogue-overlay';
      document.body.appendChild(this.container);
    }
    this.setupStyles();
    this.setupEventListeners();
    this.initAiWorker();
  }

  private initAiWorker() {
    try {
      this.aiWorker = new Worker(new URL('../workers/aiWorker.ts', import.meta.url), { type: 'module' });
      this.aiWorker.onmessage = (event) => {
        const { id, status, choices, error } = event.data;
        const pending = this.pendingRequests.get(id);
        if (!pending) return;
        this.pendingRequests.delete(id);
        if (status === 'success') {
          pending.resolve(choices);
        } else {
          pending.reject(new Error(error || 'AI rewrite failed'));
        }
      };
      this.aiWorker.onerror = (err) => {
        console.warn('[AI Worker] Error:', err);
        for (const [id, pending] of this.pendingRequests) {
          pending.reject(new Error('AI worker crashed'));
          this.pendingRequests.delete(id);
        }
      };
    } catch (err) {
      console.warn('[AI Worker] Failed to initialize:', err);
    }
  }

  private setupStyles() {
    Object.assign(this.container.style, {
      position: 'fixed', bottom: '0', left: '0', width: '100%', height: '30vh',
      backgroundColor: 'rgba(10, 10, 30, 0.85)', backdropFilter: 'blur(10px)',
      borderTop: '1px solid rgba(0, 255, 0, 0.4)', boxShadow: '0 -4px 30px rgba(0, 255, 0, 0.1)',
      zIndex: '2000', display: 'flex', justifyContent: 'center', alignItems: 'center',
      fontFamily: 'monospace', transform: 'translateY(100%)', transition: 'transform 0.3s ease-out',
      pointerEvents: 'none'
    });
    (this.container.style as any).webkitBackdropFilter = 'blur(10px)';
  }

  private setupEventListeners() {
    eventBus.on('dialogue:start', async (data: { dialogueId?: string; characterId?: string; sceneId?: string }) => {
      if (data.characterId && data.sceneId) await this.startDialogueWithCharacter(data.characterId, data.sceneId);
      else if (data.dialogueId) await this.startDialogue(data.dialogueId);
    });
    eventBus.on('dialogue:choose', async (choiceIndex: number) => await this.makeChoice(choiceIndex));
    eventBus.on('dialogue:end', () => this.slideOut());
    eventBus.on('dialogue:resume', async () => await this.resumeDialogue());
    this.container.addEventListener('click', () => { if (this.state === DialogueUIState.TYPING) this.skipTyping(); });
  }

  private async loadDialogue(result: any, errorMsg: string) {
    try {
      if (result.success && result.data) {
        this.currentDialogue = { tree: result.data.tree, currentNode: result.data.current_node, availableChoices: result.data.available_choices };
        this.slideIn();
      }
    } catch (error) { console.error(errorMsg, error); }
  }

  private async startDialogue(dialogueId: string) { await this.loadDialogue(await api.startDialogue(dialogueId), 'Failed to start dialogue'); }

  private async startDialogueWithCharacter(characterId: string, sceneId: string) {
    await this.loadDialogue(await api.startDialogueWithCharacter(characterId, sceneId), 'Failed to start dialogue');
  }

  private async resumeDialogue() { await this.loadDialogue(await api.getActiveDialogue(), 'Failed to resume dialogue'); }

  private slideIn() {
    this.state = DialogueUIState.SLIDING_IN;
    this.container.style.pointerEvents = 'auto';
    this.container.style.transform = 'translateY(0)';
    eventBus.emit('dialogue:opened');
    eventBus.emit('phaser:pause-input');
    this.renderDialogue();
  }

  private async dispatchToAiWorker(choices: DialogueNode['choices'], relationshipContext: string): Promise<NonNullable<DialogueNode['choices']>> {
    if (!this.aiWorker || !choices?.length || !phoneStore.getState().aiEnabled || !getLocalKey() || !localStorage.getItem('auth_token'))
      return choices || [];
    return new Promise((resolve) => {
      const requestId = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.pendingRequests.set(requestId, { resolve: (r) => resolve(r || choices), reject: () => resolve(choices) });
      this.aiWorker!.postMessage({ id: requestId, type: 'rewrite_choices', choices: choices.map(c => ({ ...c })), relationshipContext, localKey: getLocalKey(), jwt: localStorage.getItem('auth_token') });
      setTimeout(() => { if (this.pendingRequests.has(requestId)) { this.pendingRequests.delete(requestId); resolve(choices); } }, 5000);
    });
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
        this.handleDialogueResult(result.data);

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

  // --- Event emission helpers ---

  private handleDialogueResult(result: any) {
    if (result.next_node?.thought) eventBus.emit('monologue:thought', result.next_node.thought);
    if (result.time_blocks_remaining !== undefined) eventBus.emit('tb:updated', result.time_blocks_remaining);
    if (result.unlocked_vault_item) { eventBus.emit('vault:new_item_unlocked', result.unlocked_vault_item); phoneStore.updateState({ hasNewVaultItem: true }); }
    this.handleMysterySolveStatus(result.mystery_solve_status);

    // Meta-plot finale alignment flip. The server puts
    // `alignment_change` in `data` (not top-level). On fugitive
    // we play a glitch SFX, apply the visual theme swap, and
    // push a system warning. On loyalist we just push a warning.
    if (result.alignment_change) {
      phoneStore.updateState({ alignment: result.alignment_change });

      if (result.alignment_change === 'fugitive') {
        eventBus.emit('audio:play_sfx', { key: 'sfx_system_crash' });
        const phoneContainer = document.querySelector('.phone-os-container');
        if (phoneContainer) {
          phoneContainer.classList.add('trigger-glitch');
          setTimeout(() => {
            phoneContainer.classList.remove('trigger-glitch');
            phoneContainer.classList.add('theme-fugitive');
          }, 800);
        }
        eventBus.emit('monologue:push', {
          text: '[SYSTEM INTEGRITY BREACH] Faction protocols overridden. Network identity scrambled. You are a ghost now.',
          type: 'warning',
        });
      } else {
        eventBus.emit('monologue:push', {
          text: '[ALIGNMENT LOCKED] Faction allegiance registered: LOYALIST. Network protocols updated.',
          type: 'warning',
        });
      }
    }
  }

  private handleMysterySolveStatus(mysterySolveStatus: any) {
    if (!mysterySolveStatus) return;
    const ms = mysterySolveStatus;
    if (ms.isBreakthrough) {
      eventBus.emit('breakthrough:winner', { mysteryId: ms.mysteryId });
    }
    const messages: Record<string, string> = {
      solver: '[SYSTEM] Case data submitted. Investigation window now open for other players.',
      late: '[SYSTEM] Case closed. Data submission rejected: Deadline exceeded.',
    };
    if (ms.kind && messages[ms.kind]) {
      eventBus.emit('monologue:push', { text: ms.isBreakthrough ? '[BREAKTHROUGH] Case closed. You are the first detective on the scene.' : messages[ms.kind], type: 'warning' });
    }
  }

  private renderDialogue() {
    if (!this.currentDialogue) return;
    const { currentNode, availableChoices } = this.currentDialogue;
    this.container.innerHTML = buildDialogueHTML(currentNode, availableChoices);
    this.dialogueTextEl = this.container.querySelector('.dialogue-text') as HTMLDivElement;
    this.choicesContainer = this.container.querySelector('.dialogue-choices') as HTMLDivElement;
    this.attachChoiceButtonListeners();
    if (this.choicesContainer) {
      this.choicesContainer.style.opacity = '0';
      this.choicesContainer.style.transition = 'opacity 0.3s ease';
      if (this.state === DialogueUIState.SUBMITTING) (this.choicesContainer as HTMLElement).style.pointerEvents = 'none';
    }
    this.startTypewriter(currentNode.text);
    eventBus.emit('dialogue:node_loaded', { type: currentNode.type, speaker: currentNode.speaker, thought: currentNode.thought });
    eventBus.emit('dialogue:node-rendered', { type: currentNode.type, speaker: currentNode.speaker, thought: currentNode.thought });
    if (availableChoices?.length) this.applyAiRewrites(availableChoices);
  }

  private async applyAiRewrites(choices: DialogueNode['choices']) {
    if (!choices?.length || !this.choicesContainer || !this.currentDialogue) return;
    try {
      const rewrittenChoices = await this.dispatchToAiWorker(
        choices, 'You are a conversational AI helping a player in a dialogue. Rewrite choices to match their relationship.'
      );
      this.currentDialogue.availableChoices = rewrittenChoices;
      this.choicesContainer.innerHTML = buildChoiceButtons(rewrittenChoices);
      this.attachChoiceButtonListeners();
      if (this.state === DialogueUIState.AWAITING_CHOICE) {
        this.choicesContainer.style.opacity = '1';
      }
    } catch (err) {
      console.warn('[AI] Rewrite failed, keeping original choices:', err);
    }
  }

  private startTypewriter(text: string) {
    if (!this.dialogueTextEl) return;
    this.fullText = text; this.currentCharIndex = 0;
    this.state = DialogueUIState.TYPING; this.skipRequested = false;
    this.dialogueTextEl.innerHTML = '';
    if (this.typewriterInterval) clearInterval(this.typewriterInterval);
    this.typewriterInterval = window.setInterval(() => {
      if (this.skipRequested || this.currentCharIndex >= this.fullText.length) {
        this.finishTyping(); return;
      }
      if (this.fullText[this.currentCharIndex] === '<') {
        const closingIndex = this.fullText.indexOf('>', this.currentCharIndex);
        if (closingIndex !== -1) { this.currentCharIndex = closingIndex + 1; }
      } else { this.currentCharIndex++; }
      this.dialogueTextEl!.innerHTML = this.fullText.substring(0, this.currentCharIndex);
    }, 30);
  }

  private finishTyping() {
    if (this.typewriterInterval) { clearInterval(this.typewriterInterval); this.typewriterInterval = null; }
    if (this.dialogueTextEl) this.dialogueTextEl.innerHTML = this.fullText;
    this.state = DialogueUIState.AWAITING_CHOICE;
    eventBus.emit('dialogue:typing_finished');
    if (this.choicesContainer && this.currentDialogue?.availableChoices.length) this.choicesContainer.style.opacity = '1';
  }

  private clearTypewriter() {
    if (this.typewriterInterval) { clearInterval(this.typewriterInterval); this.typewriterInterval = null; }
    this.skipRequested = false;
  }

  private skipTyping() { if (this.state === DialogueUIState.TYPING) this.skipRequested = true; }

  private disableButtons() {
    if (!this.choicesContainer) return;
    (this.choicesContainer as HTMLElement).style.pointerEvents = 'none';
    this.choicesContainer.querySelectorAll('.choice-btn').forEach(btn => {
      (btn as HTMLButtonElement).disabled = true;
      Object.assign(btn as HTMLElement, { style: { pointerEvents: 'none', opacity: '0.5' } });
    });
  }

  private enableButtons() {
    if (!this.choicesContainer) return;
    (this.choicesContainer as HTMLElement).style.pointerEvents = 'auto';
    this.choicesContainer.querySelectorAll('.choice-btn').forEach(btn => {
      (btn as HTMLButtonElement).disabled = false;
      Object.assign(btn as HTMLElement, { style: { pointerEvents: 'auto', opacity: '1' } });
    });
  }

  private attachChoiceButtonListeners() {
    if (!this.choicesContainer) return;
    const choiceButtons = this.choicesContainer.querySelectorAll('.choice-btn');
    choiceButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        this.makeChoice(parseInt(button.getAttribute('data-choice-index') || '0', 10));
      });
      button.addEventListener('mouseenter', () => {
        if (!(button as HTMLButtonElement).disabled) {
          Object.assign(button as HTMLElement, { style: { backgroundColor: 'rgba(0, 255, 0, 0.15)', borderColor: 'rgba(0, 255, 0, 0.6)' } });
        }
      });
      button.addEventListener('mouseleave', () => {
        Object.assign(button as HTMLElement, { style: { backgroundColor: 'rgba(0, 255, 0, 0.05)', borderColor: 'rgba(0, 255, 0, 0.3)' } });
      });
    });
  }
}
