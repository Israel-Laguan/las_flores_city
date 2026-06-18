export type AppRoute = 'home' | 'feed' | 'messages' | 'trabajando' | 'banco' | 'myme' | 'vault' | 'settings' | 'identity';

export interface PhoneState {
  currentRoute: AppRoute;
  credits: number;
  goldCredits: number;
  timeBlocks: number;
  unreadMessagesCount: number;
  hasNewVaultItem: boolean;
  isOpen: boolean;
  aiEnabled: boolean;
}

type Listener<T> = (state: T) => void;

class PhoneStore {
  private state: PhoneState;
  private listeners: Set<Listener<PhoneState>> = new Set();

  constructor(initialState: PhoneState) {
    this.state = initialState;
  }

  public getState(): PhoneState {
    return { ...this.state };
  }

  public updateState(update: Partial<PhoneState>): void {
    const oldState = this.state;
    this.state = { ...this.state, ...update };
    if (JSON.stringify(oldState) !== JSON.stringify(this.state)) {
      this.notify();
    }
  }

  public subscribe(listener: Listener<PhoneState>): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
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
  hasNewVaultItem: false,
  isOpen: false,
  aiEnabled: false,
});
