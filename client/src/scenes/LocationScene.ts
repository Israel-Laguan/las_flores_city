import Phaser from 'phaser';
import { eventBus } from '../utils/EventBus';
import * as api from '../utils/api';
import { renderNPCs, NPCData } from './location/npc-renderer';
import { applyRainEffect, applyTenseEffect, applyNeonEffect } from './location/mood-effects';
import { createLoadingOverlay, LoadingOverlay } from './location/loading-overlay';
import { AudioManager } from '../utils/AudioManager';
import { addScanlines, addVignette, addNeonFlare } from './location/atmosphere-effects';

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

  // Atmosphere effects
  private scanlines!: Phaser.GameObjects.TileSprite;
  private vignette!: Phaser.GameObjects.Graphics;
  private neonFlare!: Phaser.GameObjects.Graphics;

  // HUD blocks
  private locationNameContainer!: Phaser.GameObjects.Container;
  private locationValueText!: Phaser.GameObjects.Text;
  private moodContainer!: Phaser.GameObjects.Container;
  private moodValueText!: Phaser.GameObjects.Text;

  private phoneButton!: Phaser.GameObjects.Container;
  private loadingOverlay!: LoadingOverlay;
  private audioManager!: AudioManager;

  private phoneOpen: boolean = false;
  /** Set to true while the WorldScene onboarding lock is active (Req 12.1). */
  private navigationLocked: boolean = false;

  // URL-to-key cache for preventing duplicate loads (fixes "E. Phaser loading guard")
  private urlTextureCache: Map<string, string> = new Map();

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

    // Create atmosphere effects (scanlines, vignette, neon flare)
    this.createAtmosphereEffects(width, height);

    // Create styled HUD blocks
    this.createHUDBlocks(width, height);

    this.createLoadingOverlay();
    this.createPhoneButton();

    this.registerEventHandlers();
    this.setupContextRecovery();
    this.registerDefaultAnimations();
    this.loadCurrentLocation();
  }

  /**
   * Creates atmosphere effects: scanlines, vignette, and neon flare.
   * All effects are added at depth 8, below mood overlays and NPCs.
   */
  private createAtmosphereEffects(width: number, height: number) {
    this.scanlines = addScanlines(this, width, height);
    this.vignette = addVignette(this, width, height);
    this.neonFlare = addNeonFlare(this, width, height);
  }

  /**
   * Creates styled HUD blocks matching the VN concept aesthetic.
   * Location name (top-left) and mood (top-right) with rounded rect backgrounds.
   */
  private createHUDBlocks(width: number, height: number) {
    // Location name HUD block (top-left)
    this.locationNameContainer = this.add.container(24, 18);
    this.locationNameContainer.setDepth(50);

    const locationBg = this.add.graphics();
    locationBg.fillStyle(0x0a0a1a, 0.7);
    locationBg.lineStyle(1, 0x00d4ff, 0.25);
    locationBg.fillRoundedRect(-80, -18, 160, 36, 8);
    locationBg.strokeRoundedRect(-80, -18, 160, 36, 8);
    this.locationNameContainer.add(locationBg);

    const locationLabel = this.add.text(0, 8, 'LOCATION', {
      font: '10px monospace',
      fontSize: '10px',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5);
    locationLabel.setAlpha(0.7);
    locationLabel.setLetterSpacing(2);
    this.locationNameContainer.add(locationLabel);

    this.locationValueText = this.add.text(0, 0, '', {
      font: '16px monospace',
      color: '#00d4ff',
      align: 'center',
    }).setOrigin(0.5);
    this.locationNameContainer.add(this.locationValueText);

    // Mood HUD block (top-right)
    // Positioned at top-right with offset for the block width
    this.moodContainer = this.add.container(width - 100, 18);
    this.moodContainer.setDepth(50);

    const moodBg = this.add.graphics();
    moodBg.fillStyle(0x0a0a1a, 0.7);
    moodBg.lineStyle(1, 0x00d4ff, 0.25);
    moodBg.fillRoundedRect(-100, -18, 200, 36, 8);
    moodBg.strokeRoundedRect(-100, -18, 200, 36, 8);
    this.moodContainer.add(moodBg);

    const moodLabel = this.add.text(0, 8, 'MOOD', {
      font: '10px monospace',
      fontSize: '10px',
      color: '#ffffff',
      align: 'center',
    }).setOrigin(0.5);
    moodLabel.setAlpha(0.7);
    moodLabel.setLetterSpacing(2);
    this.moodContainer.add(moodLabel);

    this.moodValueText = this.add.text(0, 0, '', {
      font: '16px monospace',
      color: '#00d4ff',
      align: 'center',
    }).setOrigin(0.5);
    this.moodContainer.add(this.moodValueText);
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

  // ==================== Default Animations ====================

  /**
   * Register default animations for sprite atlas support.
   * Per-texture blink animations are created in loadSpriteAtlas() after
   * successful atlas load using convention: {textureKey}-blink with frames
   * named blink_00, blink_01, etc.
   */
  private registerDefaultAnimations(): void {
    // Default blink animation is registered per-texture when atlases load.
    // This method documents the convention for future reference.
    // See loadSpriteAtlas() for actual animation creation.
  }

  // ==================== Dynamic Asset Loading Pipeline ====================

  private loadDynamicAsset(key: string, url: string, type: 'image' | 'audio'): Promise<void> {
    return new Promise((resolve) => {
      // Cache by URL: if this URL was already loaded under any key, resolve immediately
      const cachedKey = this.urlTextureCache.get(url);
      if (cachedKey && this.textures.exists(cachedKey)) {
        return resolve();
      }

      if (this.textures.exists(key)) return resolve();

      const errorHandler = (file: any) => {
        if (file.key === key) {
          resolve();
        }
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

  /**
   * Load a texture atlas (texture + JSON) for animated NPC portraits.
   * If atlas loading fails, falls back to loading the texture as a static image.
   * @param key - The texture key to use
   * @param textureUrl - URL to the texture image (PNG)
   * @param atlasUrl - URL to the atlas JSON
   * @returns Promise resolving to true if atlas loaded, false if fallback to image
   */
  private loadSpriteAtlas(key: string, textureUrl: string, atlasUrl: string): Promise<boolean> {
    return new Promise((resolve) => {
      // Check URL cache first
      if (this.urlTextureCache.has(atlasUrl)) {
        const cachedKey = this.urlTextureCache.get(atlasUrl)!;
        if (this.textures.exists(cachedKey)) {
          return resolve(true);
        }
      }

      // Check if texture already exists
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

          // Create default blink animation for this atlas
          if (!this.anims.exists(`${key}-blink`)) {
            this.anims.create({
              key: `${key}-blink`,
              frames: this.anims.generateFrameNames(key, {
                prefix: 'blink_',
                start: 0,
                end: 3,
                zeroPad: 2,
              }),
              frameRate: 8,
              repeat: -1,
              repeatDelay: 2000,
            });
          }

          // Create expression-specific animations if they exist in the atlas
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
                this.anims.create({
                  key: exprKey,
                  frames,
                  frameRate: 8,
                  repeat: -1,
                });
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

          // Fallback: load texture as static image
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

  private async bootstrapScene(payload: ScenePayload): Promise<void> {
    this.loadingOverlay.show();

    const assetPromises: Promise<void>[] = [];

    if (payload.scene.backgroundUrl) {
      const bgKey = `bg-${payload.scene.id}`;
      assetPromises.push(this.loadDynamicAsset(bgKey, payload.scene.backgroundUrl, 'image'));
    }

    for (const npc of payload.npcs) {
      const npcKey = `npc-${npc.characterId}`;

      if (npc.atlasUrl) {
        // Use the portraitUrl as the texture URL for the atlas
        // The atlas will be loaded with this URL as the texture
        assetPromises.push(
          this.loadSpriteAtlas(npcKey, npc.portraitUrl, npc.atlasUrl).then(() => {
            // Atlas loaded (or fallback to image) - texture is ready
          })
        );
      } else {
        assetPromises.push(this.loadDynamicAsset(npcKey, npc.portraitUrl, 'image'));
      }
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

    // Update HUD blocks
    this.locationValueText.setText(payload.scene.title);
    this.moodValueText.setText(`[ ${payload.scene.mood.toUpperCase()} ]`);

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