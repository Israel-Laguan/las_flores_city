import Phaser from 'phaser';
import { LoadingOverlay } from './loading-overlay.js';
import { addScanlines, addVignette, addNeonFlare } from './atmosphere-effects.js';

interface ScenePayload {
  scene: {
    id: string;
    title: string;
    backgroundUrl?: string;
    ambientSoundUrl?: string | null;
    mood?: string;
  };
  npcs: any[];
}

export function createAtmosphereEffects(
  scene: Phaser.Scene,
  width: number,
  height: number
): { scanlines: Phaser.GameObjects.TileSprite; vignette: Phaser.GameObjects.Graphics; neonFlare: Phaser.GameObjects.Graphics } {
  return {
    scanlines: addScanlines(scene, width, height),
    vignette: addVignette(scene, width, height),
    neonFlare: addNeonFlare(scene, width, height),
  };
}

export function createHUDBlocks(
  scene: Phaser.Scene,
  width: number
): {
  locationNameContainer: Phaser.GameObjects.Container;
  locationValueText: Phaser.GameObjects.Text;
  moodContainer: Phaser.GameObjects.Container;
  moodValueText: Phaser.GameObjects.Text;
} {
  const locationNameContainer = scene.add.container(104, 18);
  locationNameContainer.setDepth(50);

  const locationBg = scene.add.graphics();
  locationBg.fillStyle(0x0a0a1a, 0.7);
  locationBg.lineStyle(1, 0x00d4ff, 0.25);
  locationBg.fillRoundedRect(-80, -18, 160, 36, 8);
  locationBg.strokeRoundedRect(-80, -18, 160, 36, 8);
  locationNameContainer.add(locationBg);

  const locationLabel = scene.add.text(0, 8, 'LOCATION', {
    font: '10px monospace',
    fontSize: '10px',
    color: '#ffffff',
    align: 'center',
  }).setOrigin(0.5);
  locationLabel.setAlpha(0.7);
  locationLabel.setLetterSpacing(2);
  locationNameContainer.add(locationLabel);

  const locationValueText = scene.add.text(0, 0, '', {
    font: '16px monospace',
    color: '#00d4ff',
    align: 'center',
  }).setOrigin(0.5);
  locationNameContainer.add(locationValueText);

  const moodContainer = scene.add.container(width - 100, 18);
  moodContainer.setDepth(50);

  const moodBg = scene.add.graphics();
  moodBg.fillStyle(0x0a0a1a, 0.7);
  moodBg.lineStyle(1, 0x00d4ff, 0.25);
  moodBg.fillRoundedRect(-100, -18, 200, 36, 8);
  moodBg.strokeRoundedRect(-100, -18, 200, 36, 8);
  moodContainer.add(moodBg);

  const moodLabel = scene.add.text(0, 8, 'MOOD', {
    font: '10px monospace',
    fontSize: '10px',
    color: '#ffffff',
    align: 'center',
  }).setOrigin(0.5);
  moodLabel.setAlpha(0.7);
  moodLabel.setLetterSpacing(2);
  moodContainer.add(moodLabel);

  const moodValueText = scene.add.text(0, 0, '', {
    font: '16px monospace',
    color: '#00d4ff',
    align: 'center',
  }).setOrigin(0.5);
  moodContainer.add(moodValueText);

  return { locationNameContainer, locationValueText, moodContainer, moodValueText };
}

export function createPhoneButton(scene: Phaser.Scene): Phaser.GameObjects.Container {
  const { width } = scene.cameras.main;

  const phoneButton = scene.add.container(width - 40, 40);
  phoneButton.setDepth(60);

  const bg = scene.add.graphics();
  bg.fillStyle(0x001a00, 0.9);
  bg.fillCircle(0, 0, 18);
  bg.lineStyle(1, 0x00ff00, 0.8);
  bg.strokeCircle(0, 0, 18);
  phoneButton.add(bg);

  const icon = scene.add.text(0, 0, '\u{1F4F1}', {
    font: '16px sans-serif',
  }).setOrigin(0.5);
  phoneButton.add(icon);

  const hitArea = scene.add.circle(0, 0, 20, 0x000000, 0);
  hitArea.setInteractive({ useHandCursor: true });
  hitArea.on('pointerdown', () => {
    scene.events.emit('phone:toggle');
  });
  phoneButton.add(hitArea);

  return phoneButton;
}

export async function bootstrapScene(
  scene: Phaser.Scene,
  payload: ScenePayload,
  urlTextureCache: Map<string, string>,
  loadingOverlay: LoadingOverlay
): Promise<void> {
  loadingOverlay.show();

  const assetPromises: Promise<void>[] = [];

  if (payload.scene.backgroundUrl) {
    const bgKey = `bg-${payload.scene.id}`;
    assetPromises.push(loadDynamicAsset(scene, bgKey, payload.scene.backgroundUrl, 'image', urlTextureCache));
  }

  for (const npc of payload.npcs) {
    const npcKey = `npc-${npc.characterId}`;

    if (npc.atlasUrl) {
      assetPromises.push(
        loadSpriteAtlas(scene, npcKey, npc.portraitUrl, npc.atlasUrl, urlTextureCache).then(() => {
        })
      );
    } else {
      assetPromises.push(loadDynamicAsset(scene, npcKey, npc.portraitUrl, 'image', urlTextureCache));
    }
  }

  await Promise.all(assetPromises);

  loadingOverlay.hide();
}

function loadDynamicAsset(
  scene: Phaser.Scene,
  key: string,
  url: string,
  type: 'image' | 'audio',
  urlTextureCache: Map<string, string>
): Promise<void> {
  return new Promise((resolve) => {
    const cachedKey = urlTextureCache.get(url);
    if (cachedKey && scene.textures.exists(cachedKey)) {
      return resolve();
    }

    if (scene.textures.exists(key)) return resolve();

    const errorHandler = (file: any) => {
      if (file.key === key) {
        resolve();
      }
    };

    if (type === 'image') {
      scene.load.image(key, url);
      scene.load.once(`filecomplete-image-${key}`, () => {
        urlTextureCache.set(url, key);
        scene.load.off('loaderror', errorHandler);
        resolve();
      });
      scene.load.once('loaderror', errorHandler);
    } else {
      scene.load.audio(key, url);
      scene.load.once(`filecomplete-audio-${key}`, () => {
        urlTextureCache.set(url, key);
        scene.load.off('loaderror', errorHandler);
        resolve();
      });
      scene.load.once('loaderror', errorHandler);
    }
    scene.load.start();
  });
}

function loadSpriteAtlas(
  scene: Phaser.Scene,
  key: string,
  textureUrl: string,
  atlasUrl: string,
  urlTextureCache: Map<string, string>
): Promise<boolean> {
  return new Promise((resolve) => {
    if (urlTextureCache.has(atlasUrl)) {
      const cachedKey = urlTextureCache.get(atlasUrl)!;
      if (scene.textures.exists(cachedKey)) {
        return resolve(true);
      }
    }

    if (scene.textures.exists(key)) {
      urlTextureCache.set(atlasUrl, key);
      return resolve(true);
    }

    let settled = false;

    const successHandler = () => {
      if (!settled) {
        settled = true;
        scene.load.off('loaderror', errorHandler);
        urlTextureCache.set(atlasUrl, key);

        if (!scene.anims.exists(`${key}-blink`)) {
          scene.anims.create({
            key: `${key}-blink`,
            frames: scene.anims.generateFrameNames(key, {
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

        const expressions = ['neutral', 'happy', 'angry', 'sad', 'focused'];
        for (const expression of expressions) {
          const exprKey = `${key}-${expression}`;
          if (!scene.anims.exists(exprKey)) {
            const frames = scene.anims.generateFrameNames(key, {
              prefix: `${expression}_`,
              start: 0,
              end: 3,
              zeroPad: 2,
            });
            if (frames.length > 0) {
              scene.anims.create({
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
        scene.load.off('loaderror', errorHandler);

        scene.load.image(key, textureUrl);
        scene.load.once(`filecomplete-${key}`, () => {
          urlTextureCache.set(textureUrl, key);
          resolve(false);
        });
        scene.load.start();
      }
    };

    scene.load.on('loaderror', errorHandler);
    scene.load.once(`filecomplete-${key}`, successHandler);
    scene.load.atlas(key, textureUrl, atlasUrl);
    scene.load.start();
  });
}