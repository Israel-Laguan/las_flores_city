import Phaser from 'phaser';

export function applyRainEffect(
  scene: Phaser.Scene,
  width: number,
  height: number
): Phaser.GameObjects.Particles.ParticleEmitter {
  const rainKey = '__raindrop';
  if (!scene.textures.exists(rainKey)) {
    const canvasTexture = scene.textures.createCanvas(rainKey, 2, 8);
    if (canvasTexture) {
      const ctx = canvasTexture.context;
      ctx.fillStyle = 'rgba(170,170,204,0.6)';
      ctx.fillRect(0, 0, 2, 8);
      canvasTexture.refresh();
    }
  }

  const emitter = scene.add.particles(0, -10, rainKey, {
    x: { min: 0, max: width },
    y: -10,
    lifespan: 1200,
    speedY: { min: 300, max: 500 },
    speedX: { min: -30, max: -10 },
    quantity: 3,
    frequency: 30,
    alpha: { start: 0.6, end: 0 },
  });
  emitter.setDepth(40);
  return emitter;
}

export function applyTenseEffect(
  scene: Phaser.Scene,
  width: number,
  height: number
): Phaser.GameObjects.Graphics {
  const overlay = scene.add.graphics();
  overlay.setDepth(30);
  overlay.fillStyle(0xff0000, 0.08);
  overlay.fillRect(0, 0, width, height);

  const vignette = scene.add.graphics();
  vignette.setDepth(31);
  for (let i = 0; i < 8; i++) {
    const alpha = 0.04 * (8 - i);
    vignette.fillStyle(0x880000, alpha);
    const inset = i * 30;
    vignette.fillRect(inset, inset, width - inset * 2, height - inset * 2);
  }
  return vignette;
}

export function applyNeonEffect(
  scene: Phaser.Scene,
  width: number,
  height: number
): Phaser.GameObjects.Graphics {
  const overlay = scene.add.graphics();
  overlay.setDepth(30);
  overlay.fillStyle(0x000033, 0.35);
  overlay.fillRect(0, 0, width, height);
  return overlay;
}
