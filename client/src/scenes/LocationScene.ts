import Phaser from 'phaser';
import { eventBus } from '../utils/EventBus';
import * as api from '../utils/api';
import { renderNPCs, NPCData } from './location/npc-renderer';
import { applyRainEffect, applyTenseEffect, applyNeonEffect } from './location/mood-effects';
import { createLoadingOverlay } from './location/loading-overlay';
import { AudioManager } from '../utils/AudioManager';
import { addScanlines, addVignette, addNeonFlare } from './location/atmosphere-effects';
import { travelTo } from './location/location-scene-travel';

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

    this.createAtmosphereEffects(width, height);
    this.createHUDBlocks(width, height);
    this.loadingOverlay = createLoadingOverlay(this);
    this.createPhoneButton();

    this.registerEventHandlers();
    this.setupContextRecovery();
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
    eventBus.on('location:loaded', (data: ScenePayload) => this.loadScene(data));
    eventBus.on('location:npcs-updated', (npcs: NPCData[]) => renderNPCs(this, npcs, this.npcSprites, (npc) => this.onNPCClick(npc)));
    eventBus.on('phone:open', () => { this.phoneOpen = true; this.input.enabled = false; });
    eventBus.on('phone:close', () => { this.phoneOpen = false; this.input.enabled = true; });
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
    eventBus.on('phaser:enable_inputs', () => { this.phoneOpen = false; this.input.enabled = true; });
    eventBus.on('dialogue:opened', () => { this.input.enabled = false; });
    eventBus.on('dialogue:closed', () => { if (!this.phoneOpen) this.input.enabled = true; });
    eventBus.on('navigation:locked', () => { this.navigationLocked = true; });
    eventBus.on('navigation:unlocked', () => { this.navigationLocked = false; });
  }

  private setupContextRecovery(): void {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (this.sound.locked === false) (this.sound as any).context?.suspend?.();
      } else {
        const ctx = (this.sound as any).context as AudioContext | undefined;
        if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
      }
    });
  }

  private createAtmosphereEffects(width: number, height: number) {
    this.scanlines = addScanlines(this, width, height);
    this.vignette = addVignette(this, width, height);
    this.neonFlare = addNeonFlare(this, width, height);
  }

  private createHUDBlocks(width: number, height: number) {
    const locationResult = buildHudContainer(this, width, height, 'LOCATION', 24);
    this.locationNameContainer = locationResult.container as any;
    this.locationValueText = locationResult.valueText as any;

    const moodResult = buildHudContainer(this, width, height, 'MOOD', width - 100);
    this.moodContainer = moodResult.container as any;
    this.moodValueText = moodResult.valueText as any;
  }

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
    hitArea.on('pointerdown', () => eventBus.emit('phone:toggle'));
    this.phoneButton.add(hitArea);
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
    await this.bootstrapScene(payload);
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
      this.navigationLocked,
      this.phoneOpen,
      this.audioManager
    );
  }

  private async bootstrapScene(payload: ScenePayload) {
    this.loadingOverlay.show();
    const assetPromises: Promise<void>[] = [];

    if (payload.scene.backgroundUrl) {
      const bgKey = `bg-${payload.scene.id}`;
      assetPromises.push(this.loadDynamicAsset(bgKey, payload.scene.backgroundUrl, 'image'));
    }

    for (const npc of payload.npcs) {
      const npcKey = `npc-${npc.characterId}`;
      if (npc.atlasUrl) {
        assetPromises.push(this.loadSpriteAtlas(npcKey, npc.portraitUrl, npc.atlasUrl).then(() => {}));
      } else {
        assetPromises.push(this.loadDynamicAsset(npcKey, npc.portraitUrl, 'image'));
      }
    }

    await Promise.all(assetPromises);
    this.loadingOverlay.hide();
  }

  private loadDynamicAsset(key: string, url: string, type: 'image' | 'audio'): Promise<void> {
    return new Promise((resolve) => {
      const cachedKey = this.urlTextureCache.get(url);
      if (cachedKey && this.textures.exists(cachedKey)) return resolve();

      const errorHandler = (file: any) => {
        if (file.key === key) resolve();
      };

      if (type === 'image') {
        this.load.image(key, url);
        this.load.once(`filecomplete-${key}`, () => {
          this.urlTextureCache.set(url, key);
          this.load.off('loaderror', errorHandler);
          resolve();
        });
        this.load.once('loaderror', errorHandler);
      } else {
        this.load.audio(key, url);
        this.load.once(`filecomplete-${key}`, () => {
          this.urlTextureCache.set(url, key);
          this.load.off('loaderror', errorHandler);
          resolve();
        });
        this.load.once('loaderror', errorHandler);
      }
      this.load.start();
    });
  }

  private loadSpriteAtlas(key: string, textureUrl: string, atlasUrl: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (this.urlTextureCache.has(atlasUrl)) {
        const cachedKey = this.urlTextureCache.get(atlasUrl)!;
        if (this.textures.exists(cachedKey)) return resolve(true);
      }
      if (this.textures.exists(key)) {
        this.urlTextureCache.set(atlasUrl, key);
        return resolve(true);
      }

      let settled = false;
      const successHandler = () => {
        if (!settled) {
          settled = true;
          this.load.off('loaderror', errorHandler);
          this.urlTextureCache.set(atlasUrl, key);

          if (!this.anims.exists(`${key}-blink`)) {
            this.anims.create({
              key: `${key}-blink`,
              frames: this.anims.generateFrameNames(key, { prefix: 'blink_', start: 0, end: 3, zeroPad: 2 }),
              frameRate: 8,
              repeat: -1,
              repeatDelay: 2000,
            });
          }

          const expressions = ['neutral', 'happy', 'angry', 'sad', 'focused'];
          for (const expression of expressions) {
            const exprKey = `${key}-${expression}`;
            if (!this.anims.exists(exprKey)) {
              const frames = this.anims.generateFrameNames(key, {
                prefix: `${expression}_`,
                start: 0,
                end: 3,
                zeroPad: 2,
              });
              if (frames.length > 0) {
                this.anims.create({ key: exprKey, frames, frameRate: 8, repeat: -1 });
              }
            }
          }

          resolve(true);
        }
      };

      const errorHandler = (file: any) => {
        if (file.key === key && !settled) {
          settled = true;
          this.load.off('loaderror', errorHandler);
          this.load.image(key, textureUrl);
          this.load.once(`filecomplete-${key}`, () => {
            this.urlTextureCache.set(textureUrl, key);
            resolve(false);
          });
          this.load.start();
        }
      };

      this.load.on('loaderror', errorHandler);
      this.load.once(`filecomplete-${key}`, successHandler);
      this.load.atlas(key, textureUrl, atlasUrl);
      this.load.start();
    });
  }
}

function buildHudContainer(scene: LocationScene, width: number, height: number, labelText: string, x: number): any {
  const container = scene.add.container(x, 18);
  container.setDepth(50);

  const bg = scene.add.graphics();
  bg.fillStyle(0x0a0a1a, 0.7);
  bg.lineStyle(1, 0x00d4ff, 0.25);
  const bw = x < width / 2 ? 80 : 100;
  bg.fillRoundedRect(-bw / 2, -18, bw, 36, 8);
  bg.strokeRoundedRect(-bw / 2, -18, bw, 36, 8);
  container.add(bg);

  const label = scene.add.text(0, 8, labelText, {
    font: '10px monospace',
    fontSize: '10px',
    color: '#ffffff',
    align: 'center',
  }).setOrigin(0.5).setAlpha(0.7).setLetterSpacing(2);
  container.add(label);

  const valueText = scene.add.text(0, 0, '', {
    font: '16px monospace',
    color: '#00d4ff',
    align: 'center',
  }).setOrigin(0.5);
  container.add(valueText);

  return { container, valueText };
}