import Phaser from 'phaser';

/**
 * Dynamically loads an audio asset from a CDN URL without blocking the render thread.
 * If the audio key already exists in the sound cache, resolves immediately.
 */
export function loadDynamicAudio(scene: Phaser.Scene, key: string, url: string): Promise<void> {
  return new Promise((resolve) => {
    // If the audio track is already loaded in the cache, resolve immediately
    if (scene.cache.audio.exists(key)) {
      return resolve();
    }

    // Queue the file with Phaser's LoaderPlugin
    scene.load.audio(key, url);

    // Bind a one-time file-complete event listener
    scene.load.once(`filecomplete-audio-${key}`, () => {
      resolve();
    });

    scene.load.start();
  });
}
