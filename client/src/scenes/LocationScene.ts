import Phaser from 'phaser';
import { eventBus } from '../utils/EventBus';
import * as api from '../utils/api';
import { renderNPCs, NPCData } from './location/npc-renderer';
import { applyRainEffect, applyTenseEffect, applyNeonEffect } from './location/mood-effects';
import { createLoadingOverlay, LoadingOverlay } from './location/loading-overlay';
import { AudioManager } from '../utils/AudioManager';

interface SceneData {
  id: string;
  title: string;
  backgroundUrl: string;
  ambientSoundUrl: string | null;
  mood: string;
}

interface ScenePayload {
  scene: SceneData;
  npcs: NPCData[];
}

export class LocationScene extends Phaser.Scene {
  private currentPayload: ScenePayload | null = null;
  private npcSprites: Map<string, Phaser.GameObjects.Container> = new Map();

  private backgroundImage: Phaser.GameObjects.Image | null = null;
  private moodOverlay: Phaser.GameObjects.Graphics | null = null;
  private rainEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  private locationNameText!: Phaser.GameObjects.Text;
  private moodText!: Phaser.GameObjects.Text;
  private phoneButton!: Phaser.GameObjects.Container;
  private loadingOverlay!: LoadingOverlay;
  private audioManager!: AudioManager;

  private phoneOpen: boolean = false;
  /** Set to true while the WorldScene onboarding lock is active (Req 12.1). */
  private navigationLocked: boolean = false;

  constructor() {
    super({ key: 'LocationScene' });
  }

  create() {
    const { width, height } = this.cameras.main;
    this.cameras.main.setBackgroundColor('#0a0a1a');

    // Initialize the Ambient Audio Manager
    this.audioManager = new AudioManager(this);

    // Check if the browser's Web Audio context is currently suspended
    if (this.sound.locked) {
      this.displayAudioUnlockPrompt();
    }

    this.locationNameText = this.add.text(width / 2, 30, '', {
      font: 'bold 24px monospace',
      color: '#00ff00',
      align: 'center',
    }).setOrigin(0.5).setDepth(50);

    this.moodText = this.add.text(width / 2, 58, '', {
      font: '12px monospace',
      color: '#666666',
      align: 'center',
    }).setOrigin(0.5).setDepth(50);

    this.createLoadingOverlay();
    this.createPhoneButton();

    this.registerEventHandlers();
    this.setupContextRecovery();
    this.loadCurrentLocation();
  }

  /**
   * Displays a subtle indicator when browser autoplay policy blocks audio.
   * Once the user interacts with the page, Phaser automatically unlocks Web Audio.
   */
  private displayAudioUnlockPrompt(): void {
    // Emit an event to the Phone OS UI to display a sound-muted indicator
    eventBus.emit('phone:audio_status', { locked: true });

    // Once the user clicks anywhere, Phaser automatically unlocks Web Audio
    this.sound.once('unlocked', () => {
      eventBus.emit('phone:audio_status', { locked: false });
      eventBus.emit('monologue:push', {
        text: 'SECURE NEURAL AUDIO LINK SYNCED SUCCESSFULLY.',
        type: 'system'
      });
    });
  }

  private registerEventHandlers() {
    eventBus.on('location:loaded', (data: ScenePayload) => {
      this.loadScene(data);
    });

    eventBus.on('location:npcs-updated', (npcs: NPCData[]) => {
      this.renderNPCs(npcs);
    });

    eventBus.on('phone:open', () => {
      this.phoneOpen = true;
      this.input.enabled = false;
    });

    eventBus.on('phone:close', () => {
      this.phoneOpen = false;
      this.input.enabled = true;
    });

    eventBus.on('phaser:disable_inputs', () => {
      this.phoneOpen = true;
      this.input.enabled = false;
      this.children.each((child) => {
        if (child instanceof Phaser.GameObjects.Sprite && child.input) {
          child.clearTint();
          child.setScale(1.0);
        }
        return true;
      });
    });

    eventBus.on('phaser:enable_inputs', () => {
      this.phoneOpen = false;
      this.input.enabled = true;
    });

    eventBus.on('dialogue:opened', () => {
      this.input.enabled = false;
    });

    eventBus.on('dialogue:closed', () => {
      if (!this.phoneOpen) {
        this.input.enabled = true;
      }
    });

    // Track navigation lock state from WorldScene (Req 12.1).
    eventBus.on('navigation:locked', () => {
      this.navigationLocked = true;
    });

    eventBus.on('navigation:unlocked', () => {
      this.navigationLocked = false;
    });
  }

  // ==================== WebGL Context Recovery ====================

  /**
   * Handles browser tab minimization / standby.
   * When the tab becomes hidden, we suspend the audio context to save
   * resources. On visibility restore, we resume audio and let Phaser
   * re-acquire the WebGL context automatically (Phaser 3 handles
   * context loss internally via its renderer's contextlost/contextrestored
   * events).
   */
  private setupContextRecovery(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        // Tab hidden: suspend audio to prevent glitches on resume
        if (this.sound.locked === false) {
          (this.sound as any).context?.suspend?.();
        }
      } else {
        // Tab restored: resume audio context and ensure it's running
        const ctx = (this.sound as any).context as AudioContext | undefined;
        if (ctx && ctx.state === 'suspended') {
          ctx.resume().catch(() => { /* user gesture may be required */ });
        }
      }
    });
  }

  // ==================== Dynamic Asset Loading Pipeline ====================

  private loadDynamicAsset(key: string, url: string, type: 'image' | 'audio'): Promise<void> {
    return new Promise((resolve) => {
      if (this.textures.exists(key)) return resolve();

      if (type === 'image') {
        this.load.image(key, url);
        this.load.once(`filecomplete-${key}`, () => resolve());
      } else {
        this.load.audio(key, url);
        this.load.once(`filecomplete-${key}`, () => resolve());
      }
      this.load.start();
    });
  }

  private async bootstrapScene(payload: ScenePayload): Promise<void> {
    this.loadingOverlay.show();

    const assetPromises: Promise<void>[] = [];

    if (payload.scene.backgroundUrl) {
      const bgKey = `bg-${payload.scene.id}`;
      assetPromises.push(this.loadDynamicAsset(bgKey, payload.scene.backgroundUrl, 'image'));
    }

    for (const npc of payload.npcs) {
      const npcKey = `npc-${npc.characterId}`;
      assetPromises.push(this.loadDynamicAsset(npcKey, npc.portraitUrl, 'image'));
    }

    await Promise.all(assetPromises);

    this.loadingOverlay.hide();
  }

  private createLoadingOverlay() {
    this.loadingOverlay = createLoadingOverlay(this);
  }

  private showLoading() {
    this.loadingOverlay.show();
  }

  private hideLoading() {
    this.loadingOverlay.hide();
  }

  // ==================== Environment & Mood Rendering ====================

  private renderBackground(backgroundUrl: string, sceneId: string) {
    const { width, height } = this.cameras.main;

    if (this.backgroundImage) {
      this.backgroundImage.destroy();
      this.backgroundImage = null;
    }

    const key = `bg-${sceneId}`;
    this.backgroundImage = this.add.image(width / 2, height / 2, key);

    const tex = this.textures.get(key);
    const source = tex.getSourceImage();
    const imgW = source.width;
    const imgH = source.height;

    const scaleX = width / imgW;
    const scaleY = height / imgH;
    const scale = Math.max(scaleX, scaleY);

    this.backgroundImage.setScale(scale);
    this.backgroundImage.setDepth(-10);
  }

  private applyMoodEffects(mood: string) {
    this.clearMoodEffects();

    const normalizedMood = mood.toLowerCase();
    const { width, height } = this.cameras.main;

    if (normalizedMood === 'rainy' || normalizedMood === 'rain') {
      this.rainEmitter = applyRainEffect(this, width, height);
    }

    if (normalizedMood === 'tense' || normalizedMood === 'dangerous' || normalizedMood === 'threat') {
      this.moodOverlay = applyTenseEffect(this, width, height);
    }

    if (normalizedMood === 'neon' || normalizedMood === 'night' || normalizedMood === 'dark') {
      this.moodOverlay = applyNeonEffect(this, width, height);
    }
  }

  private clearMoodEffects() {
    if (this.rainEmitter) {
      this.rainEmitter.destroy();
      this.rainEmitter = null;
    }

    if (this.moodOverlay) {
      this.moodOverlay.destroy();
      this.moodOverlay = null;
    }
  }

  // ==================== Interactive NPC Sprite Generation ====================

  private renderNPCs(npcs: NPCData[]) {
    renderNPCs(this, npcs, this.npcSprites, (npc) => this.onNPCClick(npc));
  }

  private onNPCClick(npc: NPCData) {
    if (!this.currentPayload) return;
    eventBus.emit('dialogue:start', {
      characterId: npc.characterId,
      sceneId: this.currentPayload.scene.id,
    });
  }

  // ==================== Camera Transitions & Travel Bridge ====================

  private async travelTo(locationId: string) {
    // Gate travel behind the onboarding lock (Req 12.1, 12.4).
    // Emit a request event first; WorldScene will emit `navigation:blocked`
    // if the lock is active, which we detect via the flag synced above.
    eventBus.emit('navigation:request');
    if (this.navigationLocked) {
      // WorldScene will have shown the diegetic HUD notice in response to
      // `navigation:request`. Nothing further to do here.
      return;
    }

    await this.cameras.main.fadeOut(500, 0, 0, 0);
    eventBus.emit('travel:start');

    this.input.enabled = false;

    try {
      const result = await api.movePlayer(locationId);

      if (result.success) {
        eventBus.emit('tb:updated', result.data.time_blocks_remaining);

        const newPayload: ScenePayload = {
          scene: result.data.scene,
          npcs: result.data.npcs,
        };

        this.clearMoodEffects();
        this.npcSprites.forEach(s => s.destroy());
        this.npcSprites.clear();

        // Trigger audio cross-fade alongside the visual transition
        if (result.data.scene.ambientSoundUrl) {
          const trackKey = `ambient_${result.data.scene.id}`;
          this.audioManager.transitionAmbient(trackKey, result.data.scene.ambientSoundUrl);
        }

        await this.bootstrapScene(newPayload);
        this.applyScenePayload(newPayload);

        eventBus.emit('travel:complete', {
          locationId: result.data.to_location_id,
          fromLocationId: result.data.from_location_id,
          timeBlocksRemaining: result.data.time_blocks_remaining,
          tbCost: result.data.tb_cost,
        });
        // Emits location:changed for camera fade, transition drone, phone clock
        eventBus.emit('location:changed', {
          locationId: result.data.to_location_id,
          scene: result.data.scene,
        });

        await this.cameras.main.fadeIn(500, 0, 0, 0);
      } else {
        const error = result.error || 'Unknown error';
        const reason = result.reason || '';

        if (error === 'exhausted') {
          eventBus.emit('monologue:thought', 'I can barely keep my eyes open. I need to find somewhere to rest.');
        } else if (error === 'location_locked') {
          eventBus.emit('monologue:thought', reason || 'That path is blocked.');
        } else if (error === 'already_here') {
          eventBus.emit('monologue:observation', "I'm already here.");
        } else {
          eventBus.emit('monologue:thought', 'Something went wrong. The city won\'t let me move.');
        }

        eventBus.emit('travel:failed', error);
        await this.cameras.main.fadeIn(500, 0, 0, 0);
      }
    } catch (error: any) {
      console.error('Travel failed:', error);
      eventBus.emit('monologue:thought', 'The network flickered. I couldn\'t get where I was going.');
      eventBus.emit('travel:failed', error.message);
      await this.cameras.main.fadeIn(500, 0, 0, 0);
    }

    if (!this.phoneOpen) {
      this.input.enabled = true;
    }
  }

  // ==================== Phone Button (Phaser side) ====================

  private createPhoneButton() {
    const { width } = this.cameras.main;

    this.phoneButton = this.add.container(width - 40, 40);
    this.phoneButton.setDepth(60);

    const bg = this.add.graphics();
    bg.fillStyle(0x001a00, 0.9);
    bg.fillCircle(0, 0, 18);
    bg.lineStyle(1, 0x00ff00, 0.8);
    bg.strokeCircle(0, 0, 18);
    this.phoneButton.add(bg);

    const icon = this.add.text(0, 0, '\u{1F4F1}', {
      font: '16px sans-serif',
    }).setOrigin(0.5);
    this.phoneButton.add(icon);

    const hitArea = this.add.circle(0, 0, 20, 0x000000, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', () => {
      eventBus.emit('phone:toggle');
    });
    this.phoneButton.add(hitArea);
  }

  // ==================== Scene Loading & Orchestration ====================

  private async loadCurrentLocation() {
    try {
      const stateResult = await api.getPlayerState();
      if (stateResult.success && stateResult.data) {
        const locationId = stateResult.data.locationId || stateResult.data.current_location_id;
        if (locationId) {
          await this.loadLocationById(locationId);
        } else {
          await this.loadLocationById('c3d4e5f6-a7b8-9012-cdef-123456789012');
        }
      }
    } catch (error) {
      console.error('Failed to load current location:', error);
      await this.loadLocationById('c3d4e5f6-a7b8-9012-cdef-123456789012');
    }
  }

  private async loadLocationById(locationId: string) {
    try {
      const result = await api.getLocation(locationId);
      if (result.success && result.data) {
        this.loadScene(result.data);
      }
    } catch (error) {
      console.error('Failed to load location:', error);
    }
  }

  private async loadScene(payload: ScenePayload) {
    this.currentPayload = payload;

    await this.bootstrapScene(payload);
    this.applyScenePayload(payload);

    this.cameras.main.fadeIn(500, 0, 0, 0);
  }

  private applyScenePayload(payload: ScenePayload) {
    this.currentPayload = payload;

    this.locationNameText.setText(payload.scene.title);
    this.moodText.setText(`[ ${payload.scene.mood.toUpperCase()} ]`);

    if (payload.scene.backgroundUrl) {
      this.renderBackground(payload.scene.backgroundUrl, payload.scene.id);
    }

    this.clearMoodEffects();
    if (payload.scene.mood) {
      this.applyMoodEffects(payload.scene.mood);
    }

    // Trigger ambient audio cross-fade if the scene has an ambient sound
    if (payload.scene.ambientSoundUrl) {
      const trackKey = `ambient_${payload.scene.id}`;
      this.audioManager.transitionAmbient(trackKey, payload.scene.ambientSoundUrl);
    }

    this.renderNPCs(payload.npcs);

    eventBus.emit('location:rendered', payload);
  }
}
