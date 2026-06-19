import Phaser from 'phaser';
import { eventBus } from './EventBus';
import { loadDynamicAudio } from './Loader';

/**
 * Centralized Ambient Audio Controller for Las Flores 2077.
 * Manages dynamic audio loading, smooth cross-fading between ambient tracks,
 * browser autoplay policy mitigation, and global volume control.
 */
export class AudioManager {
  private scene: Phaser.Scene;
  private currentTrack: Phaser.Sound.BaseSound | null = null;
  private currentTrackKey: string | null = null;
  private masterVolume: number = 0.8;
  // Tracks SFX keys currently in-flight to prevent channel overlap/clipping
  private activeSfx: Set<string> = new Set();

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.initEventBindings();
  }

  private initEventBindings(): void {
    // Listen for global volume adjustments from the Phone's Settings App
    eventBus.on('audio:volume_change', (volume: number) => {
      this.masterVolume = Phaser.Math.Clamp(volume, 0, 1);
      if (this.currentTrack && 'setVolume' in this.currentTrack) {
        (this.currentTrack as any).setVolume(this.masterVolume);
      }
    });

    // Listen for direct UI/event-triggered SFX (like system alerts)
    eventBus.on('audio:play_sfx', (data: { key: string; url: string }) => {
      this.playOneShotSFX(data.key, data.url);
    });
  }

  /**
   * Safe Cross-fade Transition:
   * Fades the old track to 0 over 1.5s, then destroys it.
   * Fades the new track to masterVolume over 1.5s.
   */
  public async transitionAmbient(key: string, url: string): Promise<void> {
    if (this.currentTrackKey === key) return; // Prevent restarting the same track

    // 1. Load the new track from the CDN
    await loadDynamicAudio(this.scene, key, url);

    const oldTrack = this.currentTrack;
    
    // 2. Initialize and play the new track at 0 volume (Muted)
    const newTrack = this.scene.sound.add(key, { loop: true, volume: 0 });
    this.currentTrack = newTrack;
    this.currentTrackKey = key;

    // Handle browser autoplay policies safely before playing
    if (this.scene.sound.locked) {
      this.scene.sound.once('unlocked', () => {
        newTrack.play();
        this.executeCrossfade(oldTrack, newTrack);
      });
    } else {
      newTrack.play();
      this.executeCrossfade(oldTrack, newTrack);
    }
  }

  private executeCrossfade(
    oldTrack: Phaser.Sound.BaseSound | null, 
    newTrack: Phaser.Sound.BaseSound
  ): void {
    // Fade in the new track
    this.scene.tweens.add({
      targets: newTrack,
      volume: this.masterVolume,
      duration: 1500,
      ease: 'Linear'
    });

    // Fade out and stop the old track
    if (oldTrack) {
      this.scene.tweens.add({
        targets: oldTrack,
        volume: 0,
        duration: 1500,
        ease: 'Linear',
        onComplete: () => {
          oldTrack.stop();
          this.scene.sound.remove(oldTrack);
        }
      });
    }
  }

  private async playOneShotSFX(key: string, url: string): Promise<void> {
    // Channel overlap guard: skip if the same SFX is already playing.
    // This prevents audio clipping from rapid typewriter clicks.
    if (this.activeSfx.has(key)) return;
    this.activeSfx.add(key);

    await loadDynamicAudio(this.scene, key, url);
    const sfx = this.scene.sound.add(key, { loop: false, volume: this.masterVolume });
    sfx.play();
    sfx.once('complete', () => {
      this.scene.sound.remove(sfx);
      this.activeSfx.delete(key);
    });
  }

  /**
   * Cleanup method to stop current track and remove event listeners.
   */
  public destroy(): void {
    if (this.currentTrack) {
      this.currentTrack.stop();
      this.scene.sound.remove(this.currentTrack);
      this.currentTrack = null;
      this.currentTrackKey = null;
    }
  }
}
