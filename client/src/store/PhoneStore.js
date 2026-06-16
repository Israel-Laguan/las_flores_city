class PhoneStore {
    state;
    listeners = new Set();
    constructor(initialState) {
        this.state = initialState;
    }
    getState() {
        return { ...this.state };
    }
    updateState(update) {
        const oldState = this.state;
        this.state = { ...this.state, ...update };
        if (JSON.stringify(oldState) !== JSON.stringify(this.state)) {
            this.notify();
        }
    }
    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
    notify() {
        for (const listener of this.listeners) {
            listener({ ...this.state });
        }
    }
}
export const phoneStore = new PhoneStore({
    currentRoute: 'home',
    credits: 100,
    goldCredits: 0,
    timeBlocks: 48,
    unreadMessagesCount: 0,
    isOpen: false,
});
