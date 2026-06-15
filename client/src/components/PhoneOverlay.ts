import { eventBus } from '../utils/EventBus';
import * as api from '../utils/api';

export class PhoneOverlay {
  private container: HTMLDivElement;
  private currentApp: string | null = null;
  private apps: Map<string, HTMLElement> = new Map();
  private dialogueContainer: HTMLDivElement | null = null;
  
  constructor() {
    this.container = document.getElementById('phone-overlay') as HTMLDivElement;
    this.setupStyles();
    this.createPhoneShell();
    this.setupEventListeners();
  }
  
  private setupStyles() {
    this.container.style.position = 'fixed';
    this.container.style.top = '0';
    this.container.style.left = '0';
    this.container.style.width = '100%';
    this.container.style.height = '100%';
    this.container.style.pointerEvents = 'none';
    this.container.style.zIndex = '1000';
  }
  
  private createPhoneShell() {
    // Create phone container
    const phone = document.createElement('div');
    phone.style.position = 'absolute';
    phone.style.right = '20px';
    phone.style.top = '20px';
    phone.style.width = '350px';
    phone.style.height = '600px';
    phone.style.backgroundColor = 'rgba(0, 0, 0, 0.95)';
    phone.style.border = '2px solid #00ff00';
    phone.style.borderRadius = '20px';
    phone.style.pointerEvents = 'auto';
    phone.style.display = 'flex';
    phone.style.flexDirection = 'column';
    phone.style.overflow = 'hidden';
    phone.style.fontFamily = 'monospace';
    
    // Create header
    const header = document.createElement('div');
    header.style.padding = '10px 15px';
    header.style.backgroundColor = '#1a1a2e';
    header.style.borderBottom = '1px solid #00ff00';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    
    const title = document.createElement('span');
    title.textContent = 'LAS FLORES';
    title.style.color = '#00ff00';
    title.style.fontSize = '14px';
    title.style.fontWeight = 'bold';
    
    const timeBlocks = document.createElement('span');
    timeBlocks.id = 'time-blocks-display';
    timeBlocks.textContent = 'TB: 12/12';
    timeBlocks.style.color = '#00ff00';
    timeBlocks.style.fontSize = '12px';
    
    header.appendChild(title);
    header.appendChild(timeBlocks);
    
    // Create app tabs
    const tabBar = document.createElement('div');
    tabBar.style.display = 'flex';
    tabBar.style.backgroundColor = '#0d0d1a';
    tabBar.style.borderBottom = '1px solid #00ff00';
    
    const appNames = ['Feed', 'Messages', 'Vault', 'Identity'];
    appNames.forEach(appName => {
      const tab = document.createElement('button');
      tab.textContent = appName;
      tab.style.flex = '1';
      tab.style.padding = '8px';
      tab.style.border = 'none';
      tab.style.backgroundColor = 'transparent';
      tab.style.color = '#00ff00';
      tab.style.cursor = 'pointer';
      tab.style.fontFamily = 'monospace';
      tab.style.fontSize = '11px';
      tab.style.textTransform = 'uppercase';
      
      tab.addEventListener('click', () => this.openApp(appName.toLowerCase()));
      tab.addEventListener('mouseenter', () => {
        tab.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
      });
      tab.addEventListener('mouseleave', () => {
        tab.style.backgroundColor = 'transparent';
      });
      
      tabBar.appendChild(tab);
    });
    
    // Create app content area
    const appContent = document.createElement('div');
    appContent.id = 'phone-app-content';
    appContent.style.flex = '1';
    appContent.style.padding = '15px';
    appContent.style.color = '#00ff00';
    appContent.style.fontFamily = 'monospace';
    appContent.style.fontSize = '13px';
    appContent.style.overflow = 'auto';
    appContent.style.lineHeight = '1.5';
    
    phone.appendChild(header);
    phone.appendChild(tabBar);
    phone.appendChild(appContent);
    this.container.appendChild(phone);
    
    // Create apps
    this.createFeedApp();
    this.createMessagesApp();
    this.createVaultApp();
    this.createIdentityApp();
    this.createDialogueApp();
    
    // Open Feed app by default
    this.openApp('feed');
  }
  
  private createFeedApp() {
    const app = document.createElement('div');
    app.innerHTML = `
      <h3 style="margin: 0 0 15px 0; color: #00ff00; border-bottom: 1px solid #00ff00; padding-bottom: 5px;">FEED</h3>
      <p style="color: #888;">Your personalized news feed is empty.</p>
      <p style="color: #888; margin-top: 10px;">Visit locations and meet people to fill your feed with stories.</p>
    `;
    this.apps.set('feed', app);
  }
  
  private createMessagesApp() {
    const app = document.createElement('div');
    app.innerHTML = `
      <h3 style="margin: 0 0 15px 0; color: #00ff00; border-bottom: 1px solid #00ff00; padding-bottom: 5px;">MESSAGES</h3>
      <div style="border: 1px solid #00ff00; padding: 10px; margin-bottom: 10px; border-radius: 5px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
          <strong>ARIA</strong>
          <span style="color: #888; font-size: 11px;">NOW</span>
        </div>
        <p style="margin: 0; font-size: 12px; color: #aaa;">Welcome to Las Flores! I'm your personal AI assistant. Type HELP anytime for guidance.</p>
      </div>
    `;
    this.apps.set('messages', app);
  }
  
  private createVaultApp() {
    const app = document.createElement('div');
    app.innerHTML = `
      <h3 style="margin: 0 0 15px 0; color: #00ff00; border-bottom: 1px solid #00ff00; padding-bottom: 5px;">VAULT</h3>
      <p style="color: #888;">Your inventory is empty.</p>
      <p style="color: #888; margin-top: 10px;">Collect items during your adventures.</p>
    `;
    this.apps.set('vault', app);
  }
  
  private createIdentityApp() {
    const app = document.createElement('div');
    app.innerHTML = `
      <h3 style="margin: 0 0 15px 0; color: #00ff00; border-bottom: 1px solid #00ff00; padding-bottom: 5px;">IDENTITY</h3>
      <div style="margin-bottom: 15px;">
        <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: #00ff00;">ACTIVE</span></p>
        <p style="margin: 5px 0;"><strong>Location:</strong> Welcome Center</p>
        <p style="margin: 5px 0;"><strong>Time-Blocks:</strong> 12/12</p>
      </div>
      <div style="border-top: 1px solid #333; padding-top: 10px;">
        <p style="color: #888; font-size: 11px;">Your identity is verified.</p>
      </div>
    `;
    this.apps.set('identity', app);
  }
  
  private createDialogueApp() {
    const app = document.createElement('div');
    app.id = 'dialogue-app';
    this.apps.set('dialogue', app);
  }
  
  private openApp(appName: string) {
    const app = this.apps.get(appName);
    if (!app) return;
    
    const content = document.getElementById('phone-app-content');
    if (content) {
      content.innerHTML = '';
      content.appendChild(app);
    }
    
    this.currentApp = appName;
    eventBus.emit('phone:app-opened', appName);
  }
  
  private setupEventListeners() {
    // Listen for world events
    eventBus.on('world:pause', () => {
      this.container.style.pointerEvents = 'auto';
    });
    
    eventBus.on('world:resume', () => {
      this.container.style.pointerEvents = 'none';
    });
    
    // Listen for dialogue events
    eventBus.on('dialogue:start', async (dialogueId: string) => {
      await this.startDialogue(dialogueId);
    });
    
    eventBus.on('dialogue:choose', async (choiceId: string, nodeId: string) => {
      await this.makeChoice(choiceId, nodeId);
    });
    
    // Close phone when clicking outside
    this.container.addEventListener('click', (e) => {
      if (e.target === this.container) {
        this.close();
      }
    });
  }
  
  private async startDialogue(dialogueId: string) {
    try {
      const response = await api.getDialogue(dialogueId);
      if (response.success && response.data) {
        const { tree, current_node, available_choices } = response.data;
        this.renderDialogue(tree, current_node, available_choices);
        this.openApp('dialogue');
      }
    } catch (error) {
      console.error('Failed to start dialogue:', error);
    }
  }
  
  private async makeChoice(choiceId: string, nodeId: string) {
    try {
      const response = await api.makeDialogueChoice('current', choiceId, nodeId);
      if (response.success && response.data) {
        const { next_node, time_blocks_spent } = response.data;
        this.updateDialogueNode(next_node);
        this.updateTimeBlocks(time_blocks_spent);
      }
    } catch (error) {
      console.error('Failed to make choice:', error);
    }
  }
  
  private renderDialogue(tree: any, currentNode: any, choices: any[]) {
    const dialogueApp = this.apps.get('dialogue');
    if (!dialogueApp) return;
    
    dialogueApp.innerHTML = `
      <h3 style="margin: 0 0 15px 0; color: #00ff00; border-bottom: 1px solid #00ff00; padding-bottom: 5px;">${tree.name}</h3>
      <div id="dialogue-content" style="margin-bottom: 15px;">
        <p style="color: #fff; margin-bottom: 10px;">${currentNode.text}</p>
      </div>
      <div id="dialogue-choices" style="border-top: 1px solid #333; padding-top: 10px;">
        ${choices.map(choice => `
          <button class="dialogue-choice" data-choice-id="${choice.id}" data-node-id="${currentNode.id}" style="
            display: block;
            width: 100%;
            padding: 10px;
            margin-bottom: 8px;
            background-color: transparent;
            border: 1px solid #00ff00;
            color: #00ff00;
            cursor: pointer;
            font-family: monospace;
            font-size: 12px;
            text-align: left;
            border-radius: 3px;
          ">
            ${choice.text}
            ${choice.time_block_cost ? `<span style="color: #888; font-size: 10px;"> (${choice.time_block_cost.amount} TB)</span>` : ''}
          </button>
        `).join('')}
      </div>
    `;
    
    // Add choice event listeners
    const choiceButtons = dialogueApp.querySelectorAll('.dialogue-choice');
    choiceButtons.forEach(button => {
      button.addEventListener('click', () => {
        const choiceId = button.getAttribute('data-choice-id');
        const nodeId = button.getAttribute('data-node-id');
        if (choiceId && nodeId) {
          eventBus.emit('dialogue:choose', choiceId, nodeId);
        }
      });
      
      button.addEventListener('mouseenter', () => {
        button.style.backgroundColor = 'rgba(0, 255, 0, 0.1)';
      });
      
      button.addEventListener('mouseleave', () => {
        button.style.backgroundColor = 'transparent';
      });
    });
  }
  
  private updateDialogueNode(node: any) {
    const dialogueContent = document.getElementById('dialogue-content');
    if (dialogueContent) {
      dialogueContent.innerHTML = `<p style="color: #fff; margin-bottom: 10px;">${node.text}</p>`;
    }
  }
  
  private updateTimeBlocks(spent: number) {
    const display = document.getElementById('time-blocks-display');
    if (display) {
      const current = parseInt(display.textContent?.split('/')[0]?.replace('TB: ', '') || '12');
      const newAmount = current - spent;
      display.textContent = `TB: ${newAmount}/12`;
    }
  }
  
  close() {
    this.currentApp = null;
    eventBus.emit('phone:app-closed');
  }
  
  open() {
    if (this.currentApp) {
      this.openApp(this.currentApp);
    } else {
      this.openApp('feed');
    }
  }
}

// Initialize phone overlay when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  new PhoneOverlay();
});
