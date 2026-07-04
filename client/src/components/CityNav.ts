import '../styles/city-nav.css';
import { navigateTo } from '../router';
import * as api from '../utils/api';

interface LocationInfo {
  id: string;
  name: string;
  description: string;
  district: string;
}

export class CityNav {
  private container: HTMLDivElement;
  private currentLocationId: string | null = null;

  constructor(container: HTMLDivElement, playerState?: any) {
    this.container = container;
    this.container.innerHTML = '';
    this.currentLocationId = playerState?.locationId ?? null;

    this.container.appendChild(this.buildLayout());
    this.loadLocations();
  }

  private buildLayout(): HTMLDivElement {
    const root = document.createElement('div');
    root.className = 'city-nav';

    root.innerHTML = `
      <div class="city-nav-header">
        <h1>LAS FLORES 2077</h1>
        <button class="city-nav-back" data-action="back-to-menu">&#8592; MENU</button>
      </div>
      <div class="city-nav-district">DISTRICTS</div>
      <div class="city-nav-list" id="city-nav-list">
        <div class="city-nav-loading">Loading city data...</div>
      </div>
    `;

    root.querySelector('.city-nav-back')?.addEventListener('click', () => {
      navigateTo('/main');
    });

    root.addEventListener('click', (e: MouseEvent) => {
      const item = (e.target as HTMLElement).closest('.city-nav-item');
      if (!item) return;
      const locationId = (item as HTMLElement).dataset.locationId;
      if (locationId) {
        navigateTo(`/city/loc/${locationId}`);
      }
    });

    return root;
  }

  private async loadLocations(): Promise<void> {
    const listEl = this.container.querySelector('#city-nav-list');
    if (!listEl) return;

    try {
      const result = await api.getAllLocations();
      if (!result.success || !result.data?.locations) {
        listEl.innerHTML = '<div class="city-nav-error">Failed to load city data.</div>';
        return;
      }

      const locations: LocationInfo[] = result.data.locations;
      const grouped = this.groupByDistrict(locations);
      listEl.innerHTML = '';

      for (const [district, locs] of grouped) {
        const districtEl = document.createElement('div');
        districtEl.className = 'city-nav-district';
        districtEl.textContent = district.toUpperCase();
        listEl.appendChild(districtEl);

        for (const loc of locs) {
          const item = document.createElement('div');
          item.className = 'city-nav-item' + (loc.id === this.currentLocationId ? ' current' : '');
          item.dataset.locationId = loc.id;
          item.innerHTML = `
            <span class="city-nav-item-icon">${this.getLocationIcon(loc)}</span>
            <div class="city-nav-item-info">
              <div class="city-nav-item-name">${this.escapeHtml(loc.name)}</div>
              <div class="city-nav-item-desc">${this.escapeHtml(loc.description)}</div>
            </div>
          `;
          listEl.appendChild(item);
        }
      }
    } catch {
      listEl.innerHTML = '<div class="city-nav-error">Connection error. Could not reach the city server.</div>';
    }
  }

  private groupByDistrict(locations: LocationInfo[]): Map<string, LocationInfo[]> {
    const groups = new Map<string, LocationInfo[]>();
    for (const loc of locations) {
      const d = loc.district || 'Unknown';
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d)!.push(loc);
    }
    return groups;
  }

  private getLocationIcon(loc: LocationInfo): string {
    const name = loc.name.toLowerCase();
    if (name.includes('apartment') || name.includes('home')) return '\u{1F3E0}';
    if (name.includes('cafe') || name.includes('bar') || name.includes('club')) return '\u{2615}';
    if (name.includes('center') || name.includes('hub')) return '\u{1F3E2}';
    if (name.includes('market') || name.includes('shop') || name.includes('store')) return '\u{1F3EA}';
    if (name.includes('park') || name.includes('garden')) return '\u{1F331}';
    return '\u{1F4CD}';
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  destroy(): void {
    this.container.innerHTML = '';
  }
}
