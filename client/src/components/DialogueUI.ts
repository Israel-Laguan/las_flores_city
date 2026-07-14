import { eventBus } from '../utils/EventBus';
import { phoneStore } from '../store/PhoneStore';
import '../styles/dialogue.css';
import { buildDialogueHTML, buildChoiceButtons } from '../utils/dialogue-templates';
import { Typewriter } from '../utils/Typewriter';
import { disableChoiceButtons, enableChoiceButtons, attachChoiceButtonListeners } from '../utils/dialogueButtons';
import * as api from '../utils/api';
import { getLocalKey } from '../utils/crypto';

export type { DialogueNode } from '../types/dialogue';
import type { DialogueNode } from '../types/dialogue';

enum DialogueUIState {
  HIDDEN = 'HIDDEN',
  SLIDING_IN = 'SLIDING_IN',
  TYPING = 'TYPING',
  AWAITING_CHOICE = 'AWAITING_CHOICE',
  SUBMITTING = 'SUBMITTING',
  SLIDING_OUT = 'SLIDING_OUT',
}

interface DialogueState {
  chunk?: any;
  tree?: any;
  currentNode: DialogueNode;
  availableChoices: any[];
}

export class DialogueUI {
  private container: HTMLDivElement;
  private state: DialogueUIState = DialogueUIState.HIDDEN;
  private currentDialogue: DialogueState | null = null;
  private typewriter: Typewriter | null = null;
  private dialogueTextEl: HTMLDivElement | null = null;
  private choicesContainer: HTMLDivElement | null = null;
  private aiWorker: Worker | null = null;
  private pendingRequests: Map<string, { resolve: (choices: any[]) => void; reject: (err: Error) => void }> = new Map();

  constructor() {
    this.container = document.getElementById('dialogue-overlay') as HTMLDivElement;
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'dialogue-overlay';
      document.body.appendChild(this.container);
    }
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
        status === 'success' ? pending.resolve(choices) : pending.reject(new Error(error || 'AI rewrite failed'));
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

  private setupEventListeners() {
    eventBus.on('dialogue:start', async (data: { dialogueId?: string; characterId?: string; sceneId?: string }) => {
      if (this.state !== DialogueUIState.HIDDEN) return;
      if (data.characterId && data.sceneId) await this.startDialogueWithCharacter(data.characterId, data.sceneId);
      else if (data.dialogueId) await this.startDialogue(data.dialogueId);
    });
    eventBus.on('dialogue:choose', async (choiceIndex: number) => this.makeChoice(choiceIndex));
    eventBus.on('dialogue:end', () => this.slideOut());
    eventBus.on('dialogue:resume', () => this.resumeDialogue());
    this.container.addEventListener('click', () => {
      if (this.state === DialogueUIState.TYPING && this.typewriter) this.typewriter.skip();
    });
  }

  private async loadDialogue(result: any, errorMsg: string) {
    try {
      if (result.success && result.data) {
        const currentNode = result.data.chunk
          ? result.data.chunk.nodes[result.data.current_node_id]
          : result.data.current_node;
        this.currentDialogue = {
          chunk: result.data.chunk,
          tree: result.data.tree,
          currentNode,
          availableChoices: result.data.available_choices
        };
        if (this.currentDialogue.chunk) this.prefetchFreeLeaves(this.currentDialogue.chunk);
        this.slideIn();
      }
    } catch (error) { console.error(errorMsg, error); }
  }

  private async startDialogue(dialogueId: string) {
    await this.loadDialogue(await api.startDialogue(dialogueId), 'Failed to start dialogue');
  }

  private async startDialogueWithCharacter(characterId: string, sceneId: string) {
    await this.loadDialogue(await api.startDialogueWithCharacter(characterId, sceneId), 'Failed to start dialogue');
  }

  private async resumeDialogue() {
    await this.loadDialogue(await api.getActiveDialogue(), 'Failed to resume dialogue');
  }

  private slideIn() {
    this.state = DialogueUIState.SLIDING_IN;
    this.container.style.pointerEvents = '';
    this.container.classList.add('open');
    eventBus.emit('dialogue:opened');
    eventBus.emit('phaser:pause-input');
    this.renderDialogue();
  }

  private async dispatchToAiWorker(choices: DialogueNode['choices'], relationshipContext: string): Promise<NonNullable<DialogueNode['choices']>> {
    if (!this.aiWorker || !choices?.length || !phoneStore.getState().aiEnabled || !getLocalKey())
      return choices || [];
    return new Promise((resolve) => {
      const requestId = `ai_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      this.pendingRequests.set(requestId, { resolve: (r) => resolve(r || choices), reject: () => resolve(choices) });
      this.aiWorker!.postMessage({ id: requestId, type: 'rewrite_choices', choices: choices.map(c => ({ ...c })), relationshipContext, localKey: getLocalKey() });
      setTimeout(() => { if (this.pendingRequests.has(requestId)) { this.pendingRequests.delete(requestId); resolve(choices); } }, 5000);
    });
  }

  private slideOut() {
    this.state = DialogueUIState.SLIDING_OUT;
    this.container.classList.remove('open');
    if (this.typewriter) this.typewriter.clear();
    setTimeout(() => {
      this.currentDialogue = null;
      this.state = DialogueUIState.HIDDEN;
      eventBus.emit('dialogue:closed');
      eventBus.emit('phaser:resume-input');
    }, 300);
  }

  private prefetchFreeLeaves(chunk: any): void {
    for (const leaf of Object.values(chunk?.leaves ?? {}) as any[]) {
      if ((leaf.tb_cost ?? 0) === 0 && (!leaf.conditions || leaf.conditions.length === 0) && leaf.target_chunk) {
        // @ts-ignore
        import('../utils/ChunkCache').then(m => m.chunkCache.prefetch(leaf.target_chunk));
      }
    }
  }

  private renderChunk(chunk: any, currentNodeId: string, availableChoices: any[]) {
    this.currentDialogue = { chunk, currentNode: chunk.nodes[currentNodeId], availableChoices };
    this.prefetchFreeLeaves(chunk);
    this.renderDialogue();
  }

  private async makeChoice(choiceIndex: number) {
    if (!this.currentDialogue || this.state === DialogueUIState.SUBMITTING) return;

    const choice = this.currentDialogue.availableChoices[choiceIndex];
    if (!choice) return;

    this.state = DialogueUIState.SUBMITTING;
    disableChoiceButtons(this.choicesContainer);

    try {
      const currentChunk = this.currentDialogue.chunk;

      if (currentChunk) {
        const leaf = currentChunk.leaves[choice.id];
        if (leaf?.target_chunk) {
          // @ts-ignore
          const m = await import('../utils/ChunkCache');
          if (m.chunkCache.has(leaf.target_chunk)) {
            const cached = m.chunkCache.get(leaf.target_chunk)!;
            const nextNodeId = cached.chunk_key;
            const nextNode = cached.nodes[nextNodeId];
            const isEnd = !nextNode || nextNode.is_end === true || !nextNode.choices?.length;

            this.handleDialogueResult({ time_blocks_remaining: undefined });

            if (isEnd) {
              this.handleDialogueEnd(nextNode);
              api.makeDialogueChoiceBackground(currentChunk.id, choice.id);
              return;
            }

            this.renderChunk(cached, nextNodeId, nextNode.choices || []);
            api.makeDialogueChoiceBackground(currentChunk.id, choice.id);
            return;
          }
        }

        const result = await api.makeDialogueChoice(currentChunk.id, choice.id);

        if (result.success && result.data) {
          this.handleDialogueResult(result.data);

          if (result.data.is_end) {
            this.handleDialogueEnd(result.data.next_chunk.nodes[result.data.current_node_id]);
            return;
          }

          this.renderChunk(result.data.next_chunk, result.data.current_node_id, result.data.available_choices);
        } else {
          this.state = DialogueUIState.AWAITING_CHOICE;
          enableChoiceButtons(this.choicesContainer);
        }
      } else {
        const result = await api.makeDialogueChoice(this.currentDialogue.tree.id, choiceIndex as any);

        if (result.success && result.data) {
          this.handleDialogueResult(result.data);

          if (result.data.is_end) {
            this.handleDialogueEnd(result.data.next_node);
            return;
          }

          this.currentDialogue.currentNode = result.data.next_node;
          this.currentDialogue.availableChoices = result.data.available_choices;
          this.renderDialogue();
        } else {
          this.state = DialogueUIState.AWAITING_CHOICE;
          enableChoiceButtons(this.choicesContainer);
        }
      }
    } catch (error) {
      console.error('Failed to make choice:', error);
      this.state = DialogueUIState.AWAITING_CHOICE;
      enableChoiceButtons(this.choicesContainer);
    }
  }

  private handleDialogueResult(result: any) {
    if (result.next_node?.thought) eventBus.emit('monologue:thought', result.next_node.thought);
    if (result.time_blocks_remaining !== undefined) eventBus.emit('tb:updated', result.time_blocks_remaining);
    if (result.unlocked_vault_item) {
      eventBus.emit('vault:new_item_unlocked', result.unlocked_vault_item);
      phoneStore.updateState({ hasNewVaultItem: true });
    }
    this.handleMysterySolveStatus(result.mystery_solve_status);
    if (result.alignment_change) this.handleAlignmentChange(result.alignment_change);
  }

  private handleMysterySolveStatus(ms: any) {
    if (!ms) return;
    if (ms.isBreakthrough) eventBus.emit('breakthrough:winner', { mysteryId: ms.mysteryId });
    const messages: Record<string, string> = {
      solver: '[SYSTEM] Case data submitted. Investigation window now open for other players.',
      late: '[SYSTEM] Case closed. Data submission rejected: Deadline exceeded.',
    };
    if (ms.kind && messages[ms.kind]) {
      eventBus.emit('monologue:push', {
        text: ms.isBreakthrough ? '[BREAKTHROUGH] Case closed. You are the first detective on the scene.' : messages[ms.kind],
        type: 'warning'
      });
    }
  }

  private handleDialogueEnd(nextNode: DialogueNode) {
    this.currentDialogue!.currentNode = nextNode;
    this.currentDialogue!.availableChoices = [];
    this.renderDialogue();
    this.container.style.pointerEvents = 'none';
    setTimeout(() => this.slideOut(), 3000);
  }

  private handleAlignmentChange(alignment: string) {
    phoneStore.updateState({ alignment: alignment as any });
    if (alignment === 'fugitive') {
      eventBus.emit('audio:play_sfx', { key: 'sfx_system_crash' });
      const el = document.querySelector('.phone-os-container');
      if (el) {
        el.classList.add('trigger-glitch');
        setTimeout(() => { el.classList.remove('trigger-glitch'); el.classList.add('theme-fugitive'); }, 800);
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

  private renderDialogue() {
    if (!this.currentDialogue) return;
    const { currentNode, availableChoices } = this.currentDialogue;
    const { timeBlocks } = phoneStore.getState();
    this.container.innerHTML = buildDialogueHTML(currentNode, availableChoices, timeBlocks);
    this.dialogueTextEl = this.container.querySelector('.dialogue-text') as HTMLDivElement;
    this.choicesContainer = this.container.querySelector('.dialogue-choices') as HTMLDivElement;
    attachChoiceButtonListeners(this.choicesContainer, (idx) => this.makeChoice(idx));
    if (this.choicesContainer) {
      this.choicesContainer.style.opacity = '0';
      this.choicesContainer.style.transition = 'opacity 0.3s ease';
      this.choicesContainer.style.pointerEvents = 'none';
    }
    this.startTypewriter(currentNode.text);
    eventBus.emit('dialogue:node_loaded', { type: currentNode.type, speaker: currentNode.speaker, thought: currentNode.thought });
    eventBus.emit('dialogue:node_rendered', { type: currentNode.type, speaker: currentNode.speaker, thought: currentNode.thought });
    if (availableChoices?.length) this.applyAiRewrites(availableChoices);
  }

  private async applyAiRewrites(choices: DialogueNode['choices']) {
    if (!choices?.length || !this.choicesContainer || !this.currentDialogue) return;
    try {
      const rewrittenChoices = await this.dispatchToAiWorker(choices, 'You are a conversational AI helping a player in a dialogue. Rewrite choices to match their relationship.');
      this.currentDialogue.availableChoices = rewrittenChoices;
      const { timeBlocks } = phoneStore.getState();
      this.choicesContainer.innerHTML = buildChoiceButtons(rewrittenChoices, timeBlocks);
      attachChoiceButtonListeners(this.choicesContainer, (idx) => this.makeChoice(idx));
      if (this.state === DialogueUIState.AWAITING_CHOICE) this.choicesContainer.style.opacity = '1';
    } catch (err) {
      console.warn('[AI] Rewrite failed, keeping original choices:', err);
    }
  }

  private startTypewriter(text: string) {
    if (!this.dialogueTextEl) return;
    this.state = DialogueUIState.TYPING;
    this.typewriter = new Typewriter(
      this.dialogueTextEl,
      () => {
        this.state = DialogueUIState.AWAITING_CHOICE;
        eventBus.emit('dialogue:typing_finished');
        if (this.choicesContainer && this.currentDialogue?.availableChoices.length) {
          this.choicesContainer.style.opacity = '1';
          this.choicesContainer.style.pointerEvents = 'auto';
        }
      },
      (charIndex) => {
        if (charIndex % 2 === 0) eventBus.emit('audio:play_sfx', { key: 'sfx_mech_click', url: 'https://cdn.lasflores2077.com/audio/sfx_mech_click.mp3' });
      }
    );
    this.typewriter.start(text);
  }
}
