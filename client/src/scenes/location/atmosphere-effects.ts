import Phaser from 'phaser';

/**
 * Add a tiled canvas texture with horizontal scanline pattern.
 * Matches the CSS .scanlines effect: repeating-linear-gradient with 2px dark / 4px transparent lines.
 * @param scene - The Phaser scene
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Image game object with the scanline texture
 */
export function addScanlines(
  scene: Phaser.Scene,
  width: number,
  height: number
): Phaser.GameObjects.Image {
  const scanlineKey = '__scanlines';
  
  // Create canvas texture with horizontal scanline pattern
  const canvasTexture = scene.textures.createCanvas(scanlineKey, width, 8);
  if (canvasTexture) {
    const ctx = canvasTexture.context;
    // 2px dark lines, 4px transparent (total 6px pattern)
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, 0, width, 2);
    // Lines 2-6 are transparent (not filled)
    canvasTexture.refresh();
  }
  
  const scanlineImage = scene.add.image(width / 2, height / 2, scanlineKey);
  scanlineImage.setDepth(8);
  scanlineImage.setAlpha(0.5);
  scanlineImage.setBlendMode(Phaser.BlendModes.MULTIPLY);
  scanlineImage.setInteractive(false);
  
  return scanlineImage;
}

/**
 * Add a Graphics-based radial darkening vignette effect.
 * Draws concentric rounded rects with increasing alpha from center outward.
 * @param scene - The Phaser scene
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Graphics game object with the vignette
 */
export function addVignette(
  scene: Phaser.Scene,
  width: number,
  height: number
): Phaser.GameObjects.Graphics {
  const vignette = scene.add.graphics();
  vignette.setDepth(8);
  
  // Draw 8 concentric rounded rects with increasing alpha
  // Using rounded rects to match the concept's radial effect
  for (let i = 0; i < 8; i++) {
    const alpha = 0.04 * (8 - i);
    vignette.fillStyle(0x000000, alpha);
    const inset = i * 30;
    vignette.strokeRoundedRect(
      inset,
      inset,
      width - inset * 2,
      height - inset * 2,
      20
    );
  }
  
  vignette.setInteractive(false);
  return vignette;
}

/**
 * Add a horizontal gradient line (neon flare) at ~160px from bottom.
 * Matches the CSS .neon-flare effect: linear-gradient from transparent to neon-blue and back.
 * @param scene - The Phaser scene
 * @param width - Canvas width
 * @param height - Canvas height
 * @returns Graphics game object with the flare
 */
export function addNeonFlare(
  scene: Phaser.Scene,
  width: number,
  height: number
): Phaser.GameObjects.Graphics {
  const flare = scene.add.graphics();
  flare.setDepth(8);
  
  // Draw a 2px tall gradient line at height - 160px
  const flareY = height - 160;
  
  // Create the gradient manually by drawing multiple lines with increasing alpha
  for (let i = 0; i < 4; i++) {
    const alpha = 0.1 * (i + 1);
    flare.fillStyle(0x00d4ff, alpha);
    flare.fillRect(0, flareY + i, width, 1);
  }
  
  flare.setInteractive(false);
  return flare;
}