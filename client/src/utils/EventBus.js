import EventEmitter from 'eventemitter3';
export class EventBus {
    static instance;
    emitter;
    constructor() {
        this.emitter = new EventEmitter();
    }
    static getInstance() {
        if (!EventBus.instance) {
            EventBus.instance = new EventBus();
        }
        return EventBus.instance;
    }
    on(event, callback) {
        this.emitter.on(event, callback);
    }
    off(event, callback) {
        this.emitter.off(event, callback);
    }
    emit(event, ...args) {
        this.emitter.emit(event, ...args);
    }
    once(event, callback) {
        this.emitter.once(event, callback);
    }
}
// Export singleton instance
export const eventBus = EventBus.getInstance();
