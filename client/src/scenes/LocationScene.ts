import Phaser from 'phaser';
import { eventBus } from '../utils/EventBus';
import * as api from '../utils/api';

interface NPCData {
  characterId: string;
  name: string;
  portraitUrl: string;
  currentMood: string;
  relationship: {
    friendship: number;
    romance: number;
  };
  canInteract: boolean;
  position_x?: number;
}

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
  private loadingContainer!: Phaser.GameObjects.Container;
  private loadingDots: Phaser.GameObjects.Text | null = null;
  private loadingDotsTimer: Phaser.Time.TimerEvent | null = null;

  private phoneOpen: boolean = false;

  constructor() {
    super({ key: 'LocationScene' });
  }

  create() {
    const { width, height } = this.cameras.main;
    this.cameras.main.setBackgroundColor('#0a0a1a');

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

    eventBus.on('dialogue:opened', () => {
      this.input.enabled = false;
    });

    eventBus.on('dialogue:closed', () => {
      if (!this.phoneOpen) {
        this.input.enabled = true;
      }
    });

    this.loadCurrentLocation();
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
    this.showLoading();

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

    this.hideLoading();
  }

  private createLoadingOverlay() {
    const { width, height } = this.cameras.main;

    this.loadingContainer = this.add.container(0, 0);
    this.loadingContainer.setDepth(200);
    this.loadingContainer.setVisible(false);

    const bg = this.add.graphics();
    bg.fillStyle(0x0a0a1a, 1);
    bg.fillRect(0, 0, width, height);
    this.loadingContainer.add(bg);

    const title = this.add.text(width / 2, height / 2 - 30, 'LOADING SCENE', {
      font: 'bold 16px monospace',
      color: '#00ff00',
    }).setOrigin(0.5);
    this.loadingContainer.add(title);

    this.loadingDots = this.add.text(width / 2, height / 2 + 5, '', {
      font: '14px monospace',
      color: '#666666',
    }).setOrigin(0.5);
    this.loadingContainer.add(this.loadingDots);
  }

  private showLoading() {
    this.loadingContainer.setVisible(true);

    let dotCount = 0;
    this.loadingDotsTimer = this.time.addEvent({
      delay: 400,
      loop: true,
      callback: () => {
        dotCount = (dotCount + 1) % 4;
        this.loadingDots?.setText('.'.repeat(dotCount));
      },
    });
  }

  private hideLoading() {
    this.loadingContainer.setVisible(false);
    if (this.loadingDotsTimer) {
      this.loadingDotsTimer.destroy();
      this.loadingDotsTimer = null;
    }
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
      this.applyRainEffect(width, height);
    }

    if (normalizedMood === 'tense' || normalizedMood === 'dangerous' || normalizedMood === 'threat') {
      this.applyTenseEffect(width, height);
    }

    if (normalizedMood === 'neon' || normalizedMood === 'night' || normalizedMood === 'dark') {
      this.applyNeonEffect(width, height);
    }
  }

  private applyRainEffect(width: number, height: number) {
    const rainKey = '__raindrop';
    if (!this.textures.exists(rainKey)) {
      const canvasTexture = this.textures.createCanvas(rainKey, 2, 8);
      if (canvasTexture) {
        const ctx = canvasTexture.context;
        ctx.fillStyle = 'rgba(170,170,204,0.6)';
        ctx.fillRect(0, 0, 2, 8);
        canvasTexture.refresh();
      }
    }

    this.rainEmitter = this.add.particles(0, -10, rainKey, {
      x: { min: 0, max: width },
      y: -10,
      lifespan: 1200,
      speedY: { min: 300, max: 500 },
      speedX: { min: -30, max: -10 },
      quantity: 3,
      frequency: 30,
      alpha: { start: 0.6, end: 0 },
    });
    this.rainEmitter.setDepth(40);
  }

  private applyTenseEffect(width: number, height: number) {
    this.moodOverlay = this.add.graphics();
    this.moodOverlay.setDepth(30);

    this.moodOverlay.fillStyle(0xff0000, 0.08);
    this.moodOverlay.fillRect(0, 0, width, height);

    const vignette = this.add.graphics();
    vignette.setDepth(31);

    for (let i = 0; i < 8; i++) {
      const alpha = 0.04 * (8 - i);
      vignette.fillStyle(0x880000, alpha);
      const inset = i * 30;
      vignette.fillRect(inset, inset, width - inset * 2, height - inset * 2);
    }

    this.moodOverlay = vignette;
  }

  private applyNeonEffect(width: number, height: number) {
    this.moodOverlay = this.add.graphics();
    this.moodOverlay.setDepth(30);

    this.moodOverlay.fillStyle(0x000033, 0.35);
    this.moodOverlay.fillRect(0, 0, width, height);
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
    this.npcSprites.forEach(sprite => sprite.destroy());
    this.npcSprites.clear();

    const { width, height } = this.cameras.main;
    const numNPCs = npcs.length;

    npcs.forEach((npc, index) => {
      let targetX: number;
      if (npc.position_x !== undefined) {
        targetX = npc.position_x * width;
      } else {
        targetX = (width / (numNPCs + 1)) * (index + 1);
      }

      const targetY = height;

      const container = this.add.container(targetX, targetY);
      container.setDepth(10);

      const npcKey = `npc-${npc.characterId}`;
      let visualElement: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics | null = null;

      if (this.textures.exists(npcKey)) {
        const sprite = this.add.image(0, 0, npcKey);
        const tex = this.textures.get(npcKey);
        const source = tex.getSourceImage();
        const maxH = height * 0.55;
        const scale = maxH / source.height;
        sprite.setScale(scale);
        sprite.setOrigin(0.5, 1);
        container.add(sprite);
        visualElement = sprite;
      } else {
        const fallback = this.add.graphics();
        const moodColor = this.getMoodColor(npc.currentMood);
        fallback.fillStyle(moodColor, 1);
        fallback.fillRoundedRect(-30, -80, 60, 80, 5);
        fallback.lineStyle(2, 0x00ff00, 1);
        fallback.strokeRoundedRect(-30, -80, 60, 80, 5);
        container.add(fallback);

        const label = this.add.text(0, -40, npc.name[0], {
          font: 'bold 24px monospace',
          color: '#00ff00',
        }).setOrigin(0.5);
        container.add(label);
        visualElement = fallback;
      }

      const nameTag = this.add.text(0, -8, npc.name, {
        font: 'bold 12px monospace',
        color: '#ffffff',
        backgroundColor: 'rgba(0,0,0,0.7)',
        padding: { x: 6, y: 3 },
      }).setOrigin(0.5, 1);
      container.add(nameTag);

      const moodTag = this.add.text(0, 4, npc.currentMood, {
        font: '10px monospace',
        color: '#888888',
        padding: { x: 4, y: 2 },
      }).setOrigin(0.5, 0);
      container.add(moodTag);

      if (npc.canInteract) {
        const hitArea = this.add.rectangle(0, -40, 80, 90, 0x000000, 0);
        hitArea.setInteractive({ useHandCursor: true });

        hitArea.on('pointerover', () => {
          container.setScale(1.05);
          if (visualElement instanceof Phaser.GameObjects.Image) {
            visualElement.setTint(0xffffff);
          } else if (visualElement instanceof Phaser.GameObjects.Graphics) {
            visualElement.setAlpha(0.9);
          }
        });

        hitArea.on('pointerout', () => {
          container.setScale(1);
          if (visualElement instanceof Phaser.GameObjects.Image) {
            visualElement.clearTint();
          } else if (visualElement instanceof Phaser.GameObjects.Graphics) {
            visualElement.setAlpha(1);
          }
        });

        hitArea.on('pointerdown', () => {
          this.onNPCClick(npc);
        });

        container.add(hitArea);
      }

      this.npcSprites.set(npc.characterId, container);
    });
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

        await this.bootstrapScene(newPayload);
        this.applyScenePayload(newPayload);

        eventBus.emit('travel:complete', {
          locationId: result.data.to_location_id,
          fromLocationId: result.data.from_location_id,
          timeBlocksRemaining: result.data.time_blocks_remaining,
          tbCost: result.data.tb_cost,
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

    this.renderNPCs(payload.npcs);

    eventBus.emit('location:rendered', payload);
  }

  private getMoodColor(mood: string): number {
    const colors: Record<string, number> = {
      neutral: 0x333333,
      happy: 0x006600,
      excited: 0x009900,
      friendly: 0x004400,
      shy: 0x333366,
      flirty: 0x663366,
      blushing: 0x663333,
      angry: 0x660000,
      tense: 0x444400,
      cozy: 0x333300,
      rainy: 0x333344,
      neon: 0x330066,
      dangerous: 0x660000,
      night: 0x000033,
      dark: 0x111111,
    };
    return colors[mood] || 0x333333;
  }
}
