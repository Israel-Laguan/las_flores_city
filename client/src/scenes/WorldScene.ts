import Phaser from 'phaser';
import { eventBus } from '../utils/EventBus';

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Arc;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private isPaused: boolean = false;
  private currentLocation: string = 'welcome_center';

  constructor() {
    super({ key: 'WorldScene' });
  }

  create() {
    // Create a simple world background
    const graphics = this.add.graphics();
    graphics.fillStyle(0x1a1a2e, 1);
    graphics.fillRect(0, 0, 800, 600);
    
    // Add grid lines for visual reference
    graphics.lineStyle(1, 0x333333, 0.5);
    for (let x = 0; x < 800; x += 50) {
      graphics.lineBetween(x, 0, x, 600);
    }
    for (let y = 0; y < 600; y += 50) {
      graphics.lineBetween(0, y, 800, y);
    }
    
    // Create location marker
    const locationMarker = this.add.graphics();
    locationMarker.fillStyle(0x00ff00, 0.3);
    locationMarker.fillCircle(400, 300, 50);
    locationMarker.lineStyle(2, 0x00ff00, 1);
    locationMarker.strokeCircle(400, 300, 50);
    
    // Add location text
    const locationText = this.add.text(400, 300, 'Welcome Center', {
      font: '16px monospace',
      color: '#00ff00',
      align: 'center',
    });
    locationText.setOrigin(0.5);
    
    // Create player (simple circle for now)
    this.player = this.add.circle(400, 300, 15, 0x00ff00);
    this.player.setStrokeStyle(2, 0xffffff);
    this.physics.add.existing(this.player);
    
    // Setup keyboard controls
    this.cursors = this.input.keyboard!.createCursorKeys();
    
    // Emit scene ready event
    eventBus.emit('world:ready');
    
    // Listen for events from DOM/Phone overlay
    eventBus.on('phone:app-opened', (appName: string) => {
      console.log(`Phone app opened: ${appName}`);
      this.isPaused = true;
      eventBus.emit('world:pause');
    });
    
    eventBus.on('phone:app-closed', () => {
      console.log('Phone app closed');
      this.isPaused = false;
      eventBus.emit('world:resume');
    });
    
    // Listen for location change events
    eventBus.on('location:change', (locationId: string) => {
      this.changeLocation(locationId);
    });
    
    // Add interact prompt
    const interactPrompt = this.add.text(400, 280, '[SPACE] to interact', {
      font: '12px monospace',
      color: '#00ff00',
      align: 'center',
    });
    interactPrompt.setOrigin(0.5);
    interactPrompt.setAlpha(0);
    
    // Show interact prompt when near location
    this.physics.add.overlap(this.player, locationMarker, () => {
      interactPrompt.setAlpha(1);
      if (this.input.keyboard!.addKey('SPACE').isDown) {
        this.interactWithLocation();
      }
    });
  }

  update() {
    if (this.isPaused) return;
    
    const player = this.player as Phaser.Physics.Arcade.Image;
    const speed = 200;
    
    // Reset velocity
    player.setVelocity(0);
    
    // Handle keyboard input
    if (this.cursors.left.isDown) {
      player.setVelocityX(-speed);
    } else if (this.cursors.right.isDown) {
      player.setVelocityX(speed);
    }
    
    if (this.cursors.up.isDown) {
      player.setVelocityY(-speed);
    } else if (this.cursors.down.isDown) {
      player.setVelocityY(speed);
    }
    
    // Handle interaction
    if (this.input.keyboard!.addKey('SPACE').isDown) {
      this.interactWithLocation();
    }
  }
  
  private changeLocation(locationId: string) {
    this.currentLocation = locationId;
    // Update UI to reflect new location
    eventBus.emit('location:updated', locationId);
  }
  
  private interactWithLocation() {
    // Emit interaction event
    eventBus.emit('location:interact', this.currentLocation);
  }
}
