import Phaser from 'phaser';

export interface NPCData {
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
  /** Optional URL to a Phaser texture atlas JSON for animated portraits */
  atlasUrl?: string;
  /** Animation key to play when atlas is loaded (defaults to currentMood) */
  expression?: string;
}

const MOOD_COLORS: Record<string, number> = {
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

function getMoodColor(mood: string): number {
  return MOOD_COLORS[mood] ?? 0x333333;
}

function computeNPCPosition(
  npc: NPCData,
  index: number,
  numNPCs: number,
  width: number,
  height: number
): { x: number; y: number } {
  const x = npc.position_x !== undefined ? npc.position_x * width : (width / (numNPCs + 1)) * (index + 1);
  return { x, y: height };
}

function createNPCVisual(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  npc: NPCData,
  height: number
): Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics {
  const npcKey = `npc-${npc.characterId}`;
  if (scene.textures.exists(npcKey)) {
    const texture = scene.textures.get(npcKey);
    const frameTotal = texture.frameTotal;

    // Check if this is an atlas (multiple frames) or a static image
    if (frameTotal > 1) {
      // Atlas loaded: create a Sprite and play the expression animation
      const sprite = scene.add.sprite(0, 0, npcKey);
      const maxH = height * 0.55;
      const scale = maxH / sprite.height;
      sprite.setScale(scale);
      sprite.setOrigin(0.5, 1);

      // VN aesthetic: subtle blue tint for saturate/contrast approximation
      sprite.setTint(0xeeddff);

      // Play the expression animation (default to blink if expression not found)
      const expression = npc.expression || npc.currentMood || 'blink';
      const animKey = `${npcKey}-${expression}`;
      if (scene.anims.exists(animKey)) {
        sprite.play(animKey);
      } else if (scene.anims.exists(`${npcKey}-blink`)) {
        sprite.play(`${npcKey}-blink`);
      }

      container.add(sprite);
      return sprite;
    } else {
      // Static image: use the existing image-based rendering
      const sprite = scene.add.image(0, 0, npcKey);
      const maxH = height * 0.55;
      const scale = maxH / sprite.height;
      sprite.setScale(scale);
      sprite.setOrigin(0.5, 1);

      // VN aesthetic: subtle blue tint for saturate/contrast approximation
      sprite.setTint(0xeeddff);

      container.add(sprite);
      return sprite;
    }
  }
  const fallback = scene.add.graphics();
  fallback.fillStyle(getMoodColor(npc.currentMood), 1);
  fallback.fillRoundedRect(-30, -80, 60, 80, 5);
  fallback.lineStyle(2, 0x00ff00, 1);
  fallback.strokeRoundedRect(-30, -80, 60, 80, 5);
  container.add(fallback);

  const label = scene.add.text(0, -40, npc.name[0], {
    font: 'bold 24px monospace',
    color: '#00ff00',
  }).setOrigin(0.5);
  container.add(label);

  return fallback;
}

function addPortraitFrame(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  npc: NPCData,
  height: number
): void {
  const maxH = height * 0.55;
  const frameH = maxH * 0.95;
  const frameW = frameH * 0.75; // 3:4 aspect ratio matching the prompt library standard

  // Create frame with asymmetric border-radius: 16px 16px 4px 4px
  // Using canvas texture for precise control over corner radii
  const frameKey = `frame-${npc.characterId}`;
  if (scene.textures.exists(frameKey)) {
    const frame = scene.add.image(0, -frameH / 2, frameKey);
    frame.setDepth(9);
    container.add(frame);

    const glitch = scene.add.rectangle(0, -frameH / 2, frameW, frameH, 0x00d4ff, 0.06);
    glitch.setDepth(11);
    glitch.setBlendMode(Phaser.BlendModes.SCREEN);
    container.add(glitch);
    return;
  }

  const canvasTexture = scene.textures.createCanvas(frameKey, frameW, frameH);
  if (canvasTexture) {
    const ctx = canvasTexture.context;
    const radiusTL = 16;
    const radiusTR = 16;
    const radiusBL = 4;
    const radiusBR = 4;
    const lineWidth = 2;
    
    // Clear canvas
    ctx.clearRect(0, 0, frameW, frameH);
    
    // Draw rounded rect with asymmetric corners
    ctx.lineWidth = lineWidth;
    ctx.strokeStyle = 'rgba(0, 212, 255, 0.9)';
    ctx.fillStyle = 'rgba(0, 0, 0, 0)';
    ctx.beginPath();
    
    // Top-left corner (radius 16)
    ctx.moveTo(radiusTL, 0);
    ctx.lineTo(frameW - radiusTR, 0);
    // Top-right corner (radius 16)
    ctx.quadraticCurveTo(frameW, 0, frameW, radiusTR);
    ctx.lineTo(frameW, frameH - radiusBR);
    // Bottom-right corner (radius 4)
    ctx.quadraticCurveTo(frameW, frameH, frameW - radiusBR, frameH);
    ctx.lineTo(radiusBL, frameH);
    // Bottom-left corner (radius 4)
    ctx.quadraticCurveTo(0, frameH, 0, frameH - radiusBL);
    ctx.lineTo(0, radiusTL);
    ctx.quadraticCurveTo(0, 0, radiusTL, 0);
    ctx.closePath();
    ctx.stroke();
    
    canvasTexture.refresh();
  }
  
  const frame = scene.add.image(0, -frameH / 2, frameKey);
  frame.setDepth(9);
  container.add(frame);

  // Glitch overlay rectangle with screen blend mode
  const glitch = scene.add.rectangle(0, -frameH / 2, frameW, frameH, 0x00d4ff, 0.06);
  glitch.setDepth(11);
  glitch.setBlendMode(Phaser.BlendModes.SCREEN);
  container.add(glitch);
}

function addNameAndMoodTags(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  npc: NPCData
): void {
  const nameTag = scene.add.text(0, -8, npc.name, {
    font: 'bold 12px monospace',
    color: '#ffffff',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: { x: 6, y: 3 },
  }).setOrigin(0.5, 1);
  container.add(nameTag);

  const moodTag = scene.add.text(0, 4, npc.currentMood, {
    font: '10px monospace',
    color: '#888888',
    padding: { x: 4, y: 2 },
  }).setOrigin(0.5, 0);
  container.add(moodTag);
}

function attachNPCHitArea(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  npc: NPCData,
  visualElement: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics,
  onNPCClick: (npc: NPCData) => void
): void {
  const hitW = (visualElement instanceof Phaser.GameObjects.Image || visualElement instanceof Phaser.GameObjects.Sprite)
    ? visualElement.displayWidth
    : 60;
  const hitH = (visualElement instanceof Phaser.GameObjects.Image || visualElement instanceof Phaser.GameObjects.Sprite)
    ? visualElement.displayHeight
    : 80;
  const hitArea = scene.add.rectangle(0, -hitH / 2, hitW, hitH, 0x000000, 0);
  hitArea.setInteractive({ useHandCursor: true });

  hitArea.on('pointerover', () => {
    container.setScale(1.05);
    if (visualElement instanceof Phaser.GameObjects.Image || visualElement instanceof Phaser.GameObjects.Sprite) {
      visualElement.setTint(0xffffff);
    } else {
      visualElement.setAlpha(0.9);
    }
  });

  hitArea.on('pointerout', () => {
    container.setScale(1);
    if (visualElement instanceof Phaser.GameObjects.Image || visualElement instanceof Phaser.GameObjects.Sprite) {
      visualElement.clearTint();
    } else {
      visualElement.setAlpha(1);
    }
  });

  hitArea.on('pointerdown', () => {
    onNPCClick(npc);
  });

  container.add(hitArea);
}

export function renderNPCs(
  scene: Phaser.Scene,
  npcs: NPCData[],
  npcSprites: Map<string, Phaser.GameObjects.Container>,
  onNPCClick: (npc: NPCData) => void
): void {
  npcSprites.forEach((sprite) => sprite.destroy());
  npcSprites.clear();

  const { width, height } = scene.cameras.main;
  const numNPCs = npcs.length;

  npcs.forEach((npc, index) => {
    const { x, y } = computeNPCPosition(npc, index, numNPCs, width, height);
    const container = scene.add.container(x, y);
    container.setDepth(10);

    const visualElement = createNPCVisual(scene, container, npc, height);
    addPortraitFrame(scene, container, npc, height);
    addNameAndMoodTags(scene, container, npc);

    if (npc.canInteract) {
      attachNPCHitArea(scene, container, npc, visualElement, onNPCClick);
    }

    npcSprites.set(npc.characterId, container);
  });
}