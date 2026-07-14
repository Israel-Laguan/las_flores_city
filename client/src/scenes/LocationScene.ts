import Phaser from 'phaser';
import { eventBus } from '../utils/EventBus';
import * as api from '../utils/api';
import { renderNPCs, NPCData } from './location/npc-renderer';
import { applyRainEffect, applyTenseEffect, applyNeonEffect } from './location/mood-effects';
import { createLoadingOverlay } from './location/loading-overlay';
import { AudioManager } from '../utils/AudioManager';
import { travelTo } from './location/location-scene-travel';
import {
  createAtmosphereEffects,
  createHUDBlocks,
  createPhoneButton,
  bootstrapScene,
} from './location/location-scene-assets';

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

  private scanlines!: Phaser.GameObjects.TileSprite;
  private vignette!: Phaser.GameObjects.Graphics;
  private neonFlare!: Phaser.GameObjects.Graphics;

  private locationNameContainer!: Phaser.GameObjects.Container;
  private locationValueText!: Phaser.GameObjects.Text;
  private moodContainer!: Phaser.GameObjects.Container;
  private moodValueText!: Phaser.GameObjects.Text;

  private phoneButton!: Phaser.GameObjects.Container;
  private loadingOverlay!: ReturnType<typeof createLoadingOverlay>;
  private audioManager!: AudioManager;

  private phoneOpen = false;
  private navigationLocked = false;
  private urlTextureCache: Map<string, string> = new Map();

  constructor() {
    super({ key: 'LocationScene' });
  }

  create() {
    const { width, height } = this.cameras.main;
    this.cameras.main.setBackgroundColor('#0a0a1a');

    this.audioManager = new AudioManager(this);

    if (this.sound.locked) {
      this.displayAudioUnlockPrompt();
    }

    const atmosphere = createAtmosphereEffects(this, width, height);
    this.scanlines = atmosphere.scanlines;
    this.vignette = atmosphere.vignette;
    this.neonFlare = atmosphere.neonFlare;

    const hud = createHUDBlocks(this, width);
    this.locationNameContainer = hud.locationNameContainer;
    this.locationValueText = hud.locationValueText;
    this.moodContainer = hud.moodContainer;
    this.moodValueText = hud.moodValueText;

    this.loadingOverlay = createLoadingOverlay(this);
    this.phoneButton = createPhoneButton(this);

    this.registerEventHandlers();
    this.setupContextRecovery();
    this.events.once('shutdown', () => this.shutdown());
    this.loadCurrentLocation();
  }

  private displayAudioUnlockPrompt(): void {
    eventBus.emit('phone:audio_status', { locked: true });
    this.sound.once('unlocked', () => {
      eventBus.emit('phone:audio_status', { locked: false });
      eventBus.emit('monologue:push', {
        text: 'SECURE NEURAL AUDIO LINK SYNCED SUCCESSFULLY.',
        type: 'system'
      });
    });
  }

  private registerEventHandlers() {
    const handlers = {
      locationLoaded: (data: ScenePayload) => this.loadScene(data),
      npcsUpdated: (npcs: NPCData[]) => renderNPCs(this, npcs, this.npcSprites, (npc) => this.onNPCClick(npc)),
      phoneOpen: () => { this.phoneOpen = true; this.syncInputEnabled(); },
      phoneClose: () => { this.phoneOpen = false; this.syncInputEnabled(); },
      disableInputs: () => {
        this.phoneOpen = true;
        this.input.enabled = false;
        this.children.each((child) => {
          if (child instanceof Phaser.GameObjects.Sprite && child.input) {
            child.clearTint();
            child.setScale(1.0);
          }
          return true;
        });
      },
      enableInputs: () => { this.phoneOpen = false; this.syncInputEnabled(); },
      dialogueOpened: () => { this.input.enabled = false; },
      dialogueClosed: () => { this.syncInputEnabled(); },
      navigationLocked: () => { this.navigationLocked = true; this.syncInputEnabled(); },
      navigationUnlocked: () => { this.navigationLocked = false; this.syncInputEnabled(); },
    };

    eventBus.on('location:loaded', handlers.locationLoaded);
    eventBus.on('location:npcs-updated', handlers.npcsUpdated);
    eventBus.on('phone:open', handlers.phoneOpen);
    eventBus.on('phone:close', handlers.phoneClose);
    eventBus.on('phaser:disable_inputs', handlers.disableInputs);
    eventBus.on('phaser:enable_inputs', handlers.enableInputs);
    eventBus.on('dialogue:opened', handlers.dialogueOpened);
    eventBus.on('dialogue:closed', handlers.dialogueClosed);
    eventBus.on('navigation:locked', handlers.navigationLocked);
    eventBus.on('navigation:unlocked', handlers.navigationUnlocked);

    this._eventHandlers = handlers;
  }

  private _eventHandlers: Record<string, (...args: any[]) => void> = {};

  private syncInputEnabled(): void {
    this.input.enabled = !this.phoneOpen && !this.navigationLocked;
  }

  private setupContextRecovery(): void {
    this._visibilityHandler = () => {
      if (document.hidden) {
        if (this.sound.locked === false) (this.sound as any).context?.suspend?.();
      } else {
        const ctx = (this.sound as any).context as AudioContext | undefined;
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', this._visibilityHandler);
  }

  private _visibilityHandler?: () => void;

  private shutdown(): void {
    if (this._eventHandlers) {
      Object.entries(this._eventHandlers).forEach(([event, handler]) => {
        eventBus.off(event, handler as any);
      });
      this._eventHandlers = {} as any;
    }
    if (this._visibilityHandler) {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
      this._visibilityHandler = undefined;
    }
  }

  private async loadCurrentLocation() {
    try {
      const stateResult = await api.getPlayerState();
      if (stateResult.success && stateResult.data) {
        const locationId = stateResult.data.locationId || stateResult.data.current_location_id;
        if (locationId) await this.loadLocationById(locationId);
        else await this.loadLocationById('c3d4e5f6-a7b8-9012-cdef-123456789012');
      }
    } catch (error) {
      console.error('Failed to load current location:', error);
      await this.loadLocationById('c3d4e5f6-a7b8-9012-cdef-123456789012');
    }
  }

  private async loadLocationById(locationId: string) {
    try {
      const result = await api.getLocation(locationId);
      if (result.success && result.data) this.loadScene(result.data);
    } catch (error) {
      console.error('Failed to load location:', error);
    }
  }

  private async loadScene(payload: ScenePayload) {
    this.currentPayload = payload;
    await bootstrapScene(this, payload, this.urlTextureCache, this.loadingOverlay);
    this.applyScenePayload(payload);
    this.cameras.main.fadeIn(500, 0, 0, 0);
  }

  private applyScenePayload(payload: ScenePayload) {
    this.currentPayload = payload;

    this.locationValueText.setText(payload.scene.title);
    this.moodValueText.setText(`[ ${payload.scene.mood.toUpperCase()} ]`);

    if (payload.scene.backgroundUrl) {
      this.renderBackground(payload.scene.backgroundUrl, payload.scene.id);
    }

    this.clearMoodEffects();
    if (payload.scene.mood) this.applyMoodEffects(payload.scene.mood);

    if (payload.scene.ambientSoundUrl) {
      const trackKey = `ambient_${payload.scene.id}`;
      this.audioManager.transitionAmbient(trackKey, payload.scene.ambientSoundUrl);
    }

    renderNPCs(this, payload.npcs, this.npcSprites, (npc) => this.onNPCClick(npc));
    eventBus.emit('location:rendered', payload);
  }

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

  private onNPCClick(npc: NPCData) {
    if (!this.currentPayload) return;
    eventBus.emit('dialogue:start', {
      characterId: npc.characterId,
      sceneId: this.currentPayload.scene.id,
    });
  }

  private async travelTo(locationId: string) {
    await travelTo(
      this,
      locationId,
      this.audioManager
    );
  }

}