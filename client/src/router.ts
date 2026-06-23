import { eventBus } from './utils/EventBus';

type RouteHandler = (params: Record<string, string>) => void | Promise<void>;

const routes: Record<string, RouteHandler> = {};

export function registerRoute(path: string, handler: RouteHandler): void {
  routes[path] = handler;
}

export function navigateTo(path: string, replace: boolean = false): void {
  if (replace) {
    history.replaceState({}, '', path);
  } else {
    history.pushState({}, '', path);
  }
  eventBus.emit('route:changed', path);
  const handler = routes[path] || routes['/404'];
  if (handler) {
    handler({});
  }
}

export function getCurrentPath(): string {
  return window.location.pathname;
}

export function startRouter(): void {
  window.addEventListener('popstate', () => {
    const path = getCurrentPath();
    eventBus.emit('route:changed', path);
    const handler = routes[path] || routes['/404'];
    if (handler) {
      handler({});
    }
  });
}