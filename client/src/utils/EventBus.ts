import EventEmitter from 'eventemitter3';

export class EventBus {
  private static instance: EventBus;
  private emitter: EventEmitter;
  
  private constructor() {
    this.emitter = new EventEmitter();
  }
  
  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }
  
  on(event: string, callback: (...args: any[]) => void) {
    this.emitter.on(event, callback);
  }
  
  off(event: string, callback: (...args: any[]) => void) {
    this.emitter.off(event, callback);
  }
  
  emit(event: string, ...args: any[]) {
    this.emitter.emit(event, ...args);
  }
  
  once(event: string, callback: (...args: any[]) => void) {
    this.emitter.once(event, callback);
  }
}

// Export singleton instance
export const eventBus = EventBus.getInstance();
