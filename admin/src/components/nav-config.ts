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
    title: 'Content',
    items: [
      { href: '/characters', label: 'Characters', icon: 'users' },
      { href: '/dialogues', label: 'Dialogues', icon: 'chat' },
      { href: '/scenes', label: 'Scenes', icon: 'film' },
      {
        href: '/story-beats',
        label: 'Story Beats',
        icon: 'list',
        subItems: [
          { href: '/story-beats', label: 'All Beats' },
          { href: '/story-beats/new', label: 'New Beat' },
        ],
      },
      { href: '/story-arc', label: 'Story Arc', icon: 'trending' },
      {
        href: '/missions',
        label: 'Missions',
        icon: 'target',
        subItems: [
          { href: '/missions', label: 'All Missions' },
          { href: '/missions/new', label: 'New Mission' },
        ],
      },
      { href: '/stories', label: 'Stories', icon: 'book' },
      { href: '/overlays', label: 'Overlays', icon: 'layers' },
      { href: '/locations', label: 'Locations', icon: 'pin' },
      { href: '/vault', label: 'Vault', icon: 'lock' },
      { href: '/gigs', label: 'Gigs', icon: 'bolt' },
      { href: '/shop', label: 'Shop', icon: 'cart' },
      { href: '/maps', label: 'Maps', icon: 'map' },
      { href: '/lore', label: 'Lore', icon: 'fileText' },
      { href: '/mysteries', label: 'Mysteries', icon: 'search' },
    ],
  },
  {
    title: 'Creation',
    items: [
      { href: '/story-builder', label: 'Story Builder', icon: 'wrench' },
      { href: '/story-builder/plans', label: 'Plans', icon: 'clipboard' },
      { href: '/editor', label: 'YAML Editor', icon: 'code' },
      { href: '/content-linker', label: 'Content Linker', icon: 'link' },
      { href: '/assets', label: 'Asset Generation', icon: 'image' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { href: '/migration', label: 'Migration', icon: 'database' },
      { href: '/validation', label: 'Validation', icon: 'checkCircle' },
      { href: '/quality', label: 'Quality Dashboard', icon: 'activity' },
      { href: '/analytics', label: 'Analytics', icon: 'chart' },
      { href: '/asset-coverage', label: 'Asset Coverage', icon: 'grid' },
      { href: '/asset-promotion', label: 'Asset Promotion', icon: 'send' },
      { href: '/diff', label: 'Diff', icon: 'columns' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { href: '/users', label: 'Users', icon: 'shield' },
      { href: '/settings', label: 'Settings', icon: 'cog' },
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
