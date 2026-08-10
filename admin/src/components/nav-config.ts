// Nav configuration — single source of truth for admin grouping.
//
// `navSections` is the single source of truth for grouping; routes are intentionally
// flat under `app/(admin)/`. Grouping is expressed ONLY here, not via Next route groups.
//
// Rejected design: creating `(content)` / `(creation)` / `(operations)` route groups would
// require ~46 directory moves, break relative imports (`../field-definitions`,
// `../components/BeatUsagesTable`), change no URLs, and buy no layout/loading boundary we
// need. Revisit only when a route cluster genuinely needs its own `layout.tsx` /
// `loading.tsx` / `error.tsx` boundary.
import type { IconName } from './navIcons';

export interface NavSubItem {
  href: string;
  label: string;
}

export interface NavItem {
  href: string;
  label: string;
  icon: IconName;
  subItems?: NavSubItem[];
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

export const navSections: NavSection[] = [
  {
    title: 'Authoring',
    items: [
      { href: '/pipeline', label: 'Pipeline', icon: 'send' },
      {
        href: '/story-builder',
        label: 'Story Builder',
        icon: 'wrench',
        subItems: [
          { href: '/story-builder', label: 'Builder' },
          { href: '/story-builder/plans', label: 'Plans' },
        ],
      },
      ],
  },
  {
    title: 'Story Bible',
    items: [
      { href: '/lore', label: 'Lore', icon: 'fileText' },
    ],
  },
  {
    title: 'Narrative',
    items: [
      { href: '/story-arc', label: 'Story Arc', icon: 'trending' },
      { href: '/story-beats', label: 'Story Beats', icon: 'grid' },
      { href: '/missions', label: 'Missions', icon: 'target' },
      { href: '/gigs', label: 'Gigs', icon: 'bolt' },
    ],
  },
  {
    title: 'World',
    items: [
      { href: '/characters', label: 'Characters', icon: 'users' },
      { href: '/scenes', label: 'Scenes', icon: 'film' },
      { href: '/locations', label: 'Locations', icon: 'pin' },
      { href: '/maps', label: 'Maps', icon: 'map' },
      { href: '/vault', label: 'Vault', icon: 'lock' },
      { href: '/shop', label: 'Shop', icon: 'cart' },
    ],
  },
  {
    title: 'Dialogue',
    items: [
      { href: '/dialogues', label: 'Dialogues', icon: 'chat' },
      { href: '/overlays', label: 'Overlays', icon: 'layers' },
    ],
  },
  {
    title: 'Tools',
    items: [
      {
        href: '/migration',
        label: 'Content Ops',
        icon: 'code',
        subItems: [
          { href: '/editor', label: 'YAML Editor' },
          { href: '/validation', label: 'Validation' },
          { href: '/migration', label: 'Migration' },
          { href: '/diff', label: 'Diff' },
        ],
      },
      {
        href: '/assets',
        label: 'Asset Ops',
        icon: 'image',
        subItems: [
          { href: '/assets', label: 'Asset Generation' },
          { href: '/asset-coverage', label: 'Coverage' },
          { href: '/asset-promotion', label: 'Promotion' },
        ],
      },
      {
        href: '/content-linker',
        label: 'Content Linker',
        icon: 'link',
      },
      {
        href: '/quality',
        label: 'Insights',
        icon: 'activity',
        subItems: [
          { href: '/quality', label: 'Quality' },
          { href: '/analytics', label: 'Analytics' },
        ],
      },
    ],
  },
  {
    title: 'System',
    items: [
      { href: '/ai-config', label: 'AI Config', icon: 'cpu' },
      { href: '/settings', label: 'Settings', icon: 'cog' },
      { href: '/users', label: 'Users', icon: 'shield' },
    ],
  },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

export function isItemActive(pathname: string, item: NavItem): boolean {
  return (
    isActive(pathname, item.href) ||
    (item.subItems ?? []).some(sub => isActive(pathname, sub.href))
  );
}

export function getPageTitle(pathname: string): string {
  if (pathname === '/') return 'Dashboard';

  let best: { href: string; label: string } | null = null;
  for (const section of navSections) {
    for (const item of section.items) {
      const candidates: Array<{ href: string; label: string }> = [
        item,
        ...(item.subItems ?? []),
      ];
      for (const candidate of candidates) {
        if (
          isActive(pathname, candidate.href) &&
          (!best || candidate.href.length > best.href.length)
        ) {
          best = candidate;
        }
      }
    }
  }
  if (best) return best.label;

  const last = pathname.split('/').filter(Boolean).pop() ?? '';
  return last.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
