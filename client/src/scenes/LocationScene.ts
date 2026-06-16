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
  private locationNameText!: Phaser.GameObjects.Text;
  private moodText!: Phaser.GameObjects.Text;
  private npcPanel!: Phaser.GameObjects.Container;
  private travelPanel!: Phaser.GameObjects.Container;
  private isTravelMenuOpen: boolean = false;

  constructor() {
    super({ key: 'LocationScene' });
  }

  create() {
    const { width, height } = this.cameras.main;

    this.cameras.main.setBackgroundColor('#0a0a1a');

    // Location name at top
    this.locationNameText = this.add.text(width / 2, 30, '', {
      font: 'bold 24px monospace',
      color: '#00ff00',
      align: 'center',
    }).setOrigin(0.5);

    // Mood indicator
    this.moodText = this.add.text(width / 2, 58, '', {
      font: '12px monospace',
      color: '#666666',
      align: 'center',
    }).setOrigin(0.5);

    // NPC panel on the right
    this.npcPanel = this.add.container(width - 20, 100);
    this.createNPCPanel();

    // Travel button
    this.createTravelButton();

    // Listen for events
    eventBus.on('location:loaded', (data: ScenePayload) => {
      this.loadScene(data);
    });

    eventBus.on('location:npcs-updated', (npcs: NPCData[]) => {
      this.updateNPCs(npcs);
    });

    eventBus.on('travel:menu-toggle', () => {
      this.toggleTravelMenu();
    });

    this.loadCurrentLocation();
  }

  private createNPCPanel() {
    const panelBg = this.add.graphics();
    panelBg.fillStyle(0x000000, 0.8);
    panelBg.fillRoundedRect(-180, 0, 180, 400, 10);
    panelBg.lineStyle(1, 0x00ff00, 0.5);
    panelBg.strokeRoundedRect(-180, 0, 180, 400, 10);
    this.npcPanel.add(panelBg);

    const panelTitle = this.add.text(-90, 10, 'NPCs', {
      font: 'bold 14px monospace',
      color: '#00ff00',
    }).setOrigin(0.5, 0);
    this.npcPanel.add(panelTitle);
  }

  private createTravelButton() {
    const { width, height } = this.cameras.main;

    this.travelPanel = this.add.container(20, height - 80);
    this.travelPanel.setVisible(false);

    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x003300, 0.9);
    btnBg.fillRoundedRect(0, 0, 150, 40, 8);
    btnBg.lineStyle(2, 0x00ff00, 1);
    btnBg.strokeRoundedRect(0, 0, 150, 40, 8);
    this.travelPanel.add(btnBg);

    const btnText = this.add.text(75, 20, '[TRAVEL]', {
      font: 'bold 14px monospace',
      color: '#00ff00',
    }).setOrigin(0.5);
    this.travelPanel.add(btnText);

    const hitArea = this.add.rectangle(75, 20, 150, 40, 0x000000, 0);
    hitArea.setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', () => {
      this.toggleTravelMenu();
    });
    this.travelPanel.add(hitArea);

    const menuBg = this.add.graphics();
    menuBg.fillStyle(0x000000, 0.95);
    menuBg.fillRoundedRect(0, 50, 200, 200, 10);
    menuBg.lineStyle(1, 0x00ff00, 0.5);
    menuBg.strokeRoundedRect(0, 50, 200, 200, 10);
    this.travelPanel.add(menuBg);

    const menuTitle = this.add.text(100, 60, 'DESTINATIONS', {
      font: 'bold 12px monospace',
      color: '#00ff00',
    }).setOrigin(0.5, 0);
    this.travelPanel.add(menuTitle);
  }

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

  private loadScene(payload: ScenePayload) {
    this.currentPayload = payload;

    // Update scene info
    this.locationNameText.setText(payload.scene.title);
    this.moodText.setText(`[ ${payload.scene.mood.toUpperCase()} ]`);

    // Load background image if available
    if (payload.scene.backgroundUrl) {
      const { width, height } = this.cameras.main;
      const bg = this.add.image(width / 2, height / 2, payload.scene.backgroundUrl);
      bg.setDisplaySize(width, height);
      bg.setDepth(-1);
    }

    // Clear old NPCs
    this.npcSprites.forEach(sprite => sprite.destroy());
    this.npcSprites.clear();

    // Create NPC sprites
    this.updateNPCs(payload.npcs);

    // Show travel button
    this.travelPanel.setVisible(true);

    this.loadTravelDestinations();

    eventBus.emit('location:rendered', payload);
  }

  private updateNPCs(npcs: NPCData[]) {
    // Clear old NPCs from panel (keep background and title)
    const childrenToRemove = this.npcPanel.list.filter(
      child => child !== this.npcPanel.list[0] && child !== this.npcPanel.list[1]
    );
    childrenToRemove.forEach(child => child.destroy());

    npcs.forEach((npc, index) => {
      const y = 40 + index * 80;

      const npcContainer = this.add.container(-90, y);

      // Portrait circle (colored by mood)
      const portrait = this.add.graphics();
      const moodColor = this.getMoodColor(npc.currentMood);
      portrait.fillStyle(moodColor, 1);
      portrait.fillCircle(0, 0, 25);
      portrait.lineStyle(2, 0x00ff00, 1);
      portrait.strokeCircle(0, 0, 25);
      npcContainer.add(portrait);

      // Initial letter
      const initial = this.add.text(0, 0, npc.name[0], {
        font: 'bold 16px monospace',
        color: '#00ff00',
      }).setOrigin(0.5);
      npcContainer.add(initial);

      // NPC name
      const nameText = this.add.text(0, 35, npc.name, {
        font: '11px monospace',
        color: '#ffffff',
      }).setOrigin(0.5, 0);
      npcContainer.add(nameText);

      // Relationship + mood
      const rel = npc.relationship;
      const relColor = rel.romance > 50 ? '#ff00ff' :
                       rel.friendship > 50 ? '#ffff00' : '#00ff00';
      const relText = this.add.text(0, 50, `${npc.currentMood} | F:${rel.friendship} R:${rel.romance}`, {
        font: '9px monospace',
        color: relColor,
      }).setOrigin(0.5, 0);
      npcContainer.add(relText);

      // Interaction indicator
      if (!npc.canInteract) {
        const lockIcon = this.add.text(20, -15, '🔒', {
          font: '12px monospace',
        });
        npcContainer.add(lockIcon);
      }

      // Make interactive
      const hitArea = this.add.rectangle(0, 25, 60, 70, 0x000000, 0);
      hitArea.setInteractive({ useHandCursor: npc.canInteract });
      hitArea.on('pointerdown', () => {
        if (npc.canInteract) {
          this.onNPCClick(npc);
        }
      });
      hitArea.on('pointerover', () => {
        portrait.clear();
        portrait.fillStyle(0x003300, 1);
        portrait.fillCircle(0, 0, 25);
        portrait.lineStyle(2, 0x00ff00, 1);
        portrait.strokeCircle(0, 0, 25);
      });
      hitArea.on('pointerout', () => {
        portrait.clear();
        portrait.fillStyle(moodColor, 1);
        portrait.fillCircle(0, 0, 25);
        portrait.lineStyle(2, 0x00ff00, 1);
        portrait.strokeCircle(0, 0, 25);
      });
      npcContainer.add(hitArea);

      this.npcPanel.add(npcContainer);
      this.npcSprites.set(npc.characterId, npcContainer);
    });
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
    };
    return colors[mood] || 0x333333;
  }

  private onNPCClick(npc: NPCData) {
    if (this.currentPayload?.scene) {
      eventBus.emit('npc:interact', {
        characterId: npc.characterId,
        name: npc.name,
        mood: npc.currentMood,
        relationship: npc.relationship,
      });
    }
  }

  private async loadTravelDestinations() {
    try {
      const result = await api.getAllLocations();
      if (result.success && result.data?.locations) {
        const locations = result.data.locations;
        const currentId = this.currentPayload?.scene.id;

        // Clear old destination buttons (keep title)
        const childrenToRemove = this.travelPanel.list.slice(3);
        childrenToRemove.forEach(child => child.destroy());

        locations.forEach((loc: any, index: number) => {
          if (loc.id === currentId) return;

          const y = 85 + index * 30;

          const destBg = this.add.graphics();
          destBg.fillStyle(0x001100, 0.8);
          destBg.fillRoundedRect(10, y, 180, 25, 5);
          this.travelPanel.add(destBg);

          const destText = this.add.text(100, y + 12, `→ ${loc.name}`, {
            font: '11px monospace',
            color: '#00ff00',
          }).setOrigin(0.5);
          this.travelPanel.add(destText);

          const hitArea = this.add.rectangle(100, y + 12, 180, 25, 0x000000, 0);
          hitArea.setInteractive({ useHandCursor: true });
          hitArea.on('pointerdown', () => {
            this.travelTo(loc.id);
          });
          this.travelPanel.add(hitArea);
        });
      }
    } catch (error) {
      console.error('Failed to load travel destinations:', error);
    }
  }

  private async travelTo(locationId: string) {
    try {
      eventBus.emit('travel:start');

      const result = await api.movePlayer(locationId);

      if (result.success) {
        eventBus.emit('travel:complete', {
          locationId,
          timeBlocksRemaining: result.data.time_blocks_remaining,
        });

        await this.loadLocationById(locationId);

        this.isTravelMenuOpen = false;
      } else {
        eventBus.emit('travel:failed', result.error);
      }
    } catch (error: any) {
      console.error('Travel failed:', error);
      eventBus.emit('travel:failed', error.message);
    }
  }

  private toggleTravelMenu() {
    this.isTravelMenuOpen = !this.isTravelMenuOpen;
    const destinations = this.travelPanel.list.slice(3);
    destinations.forEach(child => {
      if ('setVisible' in child && typeof (child as any).setVisible === 'function') {
        (child as any).setVisible(this.isTravelMenuOpen);
      }
    });
  }
}
