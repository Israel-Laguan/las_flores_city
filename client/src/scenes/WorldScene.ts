import Phaser from 'phaser';
import { eventBus } from '../utils/EventBus';
import * as api from '../utils/api';

export class WorldScene extends Phaser.Scene {
  private isPaused: boolean = false;
  private currentLocationId: string = 'c3d4e5f6-a7b8-9012-cdef-123456789012';

  constructor() {
    super({ key: 'WorldScene' });
  }

  create() {
    const { width, height } = this.cameras.main;

    // Background
    this.cameras.main.setBackgroundColor('#0a0a1a');

    // Location name at top
    const locationText = this.add.text(width / 2, 30, 'Las Flores 2077', {
      font: 'bold 28px monospace',
      color: '#00ff00',
      align: 'center',
    }).setOrigin(0.5);

    // Subtitle
    const subtitle = this.add.text(width / 2, 65, 'The Minimum Viable World', {
      font: '14px monospace',
      color: '#888888',
      align: 'center',
    }).setOrigin(0.5);

    // Instructions
    const instructions = this.add.text(width / 2, height - 50, 'Press [SPACE] to interact • Use Travel menu to move', {
      font: '12px monospace',
      color: '#666666',
      align: 'center',
    }).setOrigin(0.5);

    // Emit scene ready event
    eventBus.emit('world:ready');

    // Listen for events
    eventBus.on('location:loaded', (data: any) => {
      this.currentLocationId = data.id;
      this.updateLocationDisplay(data);
    });

    eventBus.on('travel:complete', (data: any) => {
      this.currentLocationId = data.locationId;
      this.updateStatusBar(data);
    });

    eventBus.on('tb:updated', (remaining: number) => {
      this.updateTBDisplay(remaining);
    });

    eventBus.on('phaser:pause-input', () => {
      this.isPaused = true;
      this.input.enabled = false;
    });

    eventBus.on('phaser:resume-input', () => {
      this.isPaused = false;
      this.input.enabled = true;
    });

    // Load initial state
    this.loadInitialState();
  }

  private async loadInitialState() {
    try {
      const stateResult = await api.getPlayerState();
      if (stateResult.success && stateResult.data) {
        // PlayerState uses flat interface: timeBlocks, credits, locationId
        this.updateTBDisplay(stateResult.data.timeBlocks || 48);
        this.updateCreditsDisplay(stateResult.data.credits || 100);

        if (stateResult.data.locationId) {
          this.currentLocationId = stateResult.data.locationId;
          const location = await api.getLocation(stateResult.data.locationId);
          if (location.success) {
            this.updateLocationDisplay(location.data);
          }
        }
      }
    } catch (error) {
      console.error('Failed to load initial state:', error);
    }
  }

  private updateLocationDisplay(data: any) {
    const locationDisplay = document.getElementById('location-display');
    if (locationDisplay) {
      locationDisplay.textContent = data.name || 'Unknown';
    }
  }

  private updateStatusBar(data: any) {
    if (data.time_blocks_remaining !== undefined) {
      this.updateTBDisplay(data.time_blocks_remaining);
    }
  }

  private updateTBDisplay(remaining: number) {
    const tbDisplay = document.getElementById('tb-display');
    if (tbDisplay) {
      tbDisplay.textContent = `${remaining}/48`;
      // Color code based on remaining
      if (remaining <= 5) {
        tbDisplay.style.color = '#ff0000';
      } else if (remaining <= 10) {
        tbDisplay.style.color = '#ffff00';
      } else {
        tbDisplay.style.color = '#00ff00';
      }
    }
  }

  private updateCreditsDisplay(credits: number) {
    const creditsDisplay = document.getElementById('credits-display');
    if (creditsDisplay) {
      creditsDisplay.textContent = credits.toString();
    }
  }
}
