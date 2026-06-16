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
): Phaser.GameObjects.Image | Phaser.GameObjects.Graphics {
  const npcKey = `npc-${npc.characterId}`;
  if (scene.textures.exists(npcKey)) {
    const sprite = scene.add.image(0, 0, npcKey);
    const tex = scene.textures.get(npcKey);
    const source = tex.getSourceImage();
    const maxH = height * 0.55;
    sprite.setScale(maxH / source.height);
    sprite.setOrigin(0.5, 1);
    container.add(sprite);
    return sprite;
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
  visualElement: Phaser.GameObjects.Image | Phaser.GameObjects.Graphics,
  onNPCClick: (npc: NPCData) => void
): void {
  const hitArea = scene.add.rectangle(0, -40, 80, 90, 0x000000, 0);
  hitArea.setInteractive({ useHandCursor: true });

  hitArea.on('pointerover', () => {
    container.setScale(1.05);
    if (visualElement instanceof Phaser.GameObjects.Image) {
      visualElement.setTint(0xffffff);
    } else {
      visualElement.setAlpha(0.9);
    }
  });

  hitArea.on('pointerout', () => {
    container.setScale(1);
    if (visualElement instanceof Phaser.GameObjects.Image) {
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
    addNameAndMoodTags(scene, container, npc);

    if (npc.canInteract) {
      attachNPCHitArea(scene, container, npc, visualElement, onNPCClick);
    }

    npcSprites.set(npc.characterId, container);
  });
}
