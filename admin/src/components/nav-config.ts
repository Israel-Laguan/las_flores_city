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
      { href: '/pipeline', label: 'Pipeline', icon: 'layers' },
      {
        href: '/story-builder',
        label: 'Story Builder',
        icon: 'wrench',
        subItems: [
          { href: '/story-builder', label: 'Builder' },
          { href: '/story-builder/plans', label: 'Plans' },
        ],
      },
      { href: '/editor', label: 'YAML Editor', icon: 'code' },
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
      {
        href: '/stories',
        label: 'Stories',
        icon: 'book',
        subItems: [
          { href: '/stories', label: 'All Stories' },
          { href: '/story-beats', label: 'Story Beats' },
        ],
      },
      {
        href: '/missions',
        label: 'Missions',
        icon: 'target',
        subItems: [
          { href: '/missions', label: 'All Missions' },
          { href: '/missions/new', label: 'New Mission' },
          { href: '/mysteries', label: 'Mysteries' },
          { href: '/gigs', label: 'Gigs' },
        ],
      },
    ],
  },
  {
    title: 'World',
    items: [
      { href: '/characters', label: 'Characters', icon: 'users' },
      {
        href: '/scenes',
        label: 'Scenes',
        icon: 'film',
        subItems: [
          { href: '/scenes', label: 'All Scenes' },
          { href: '/locations', label: 'Locations' },
          { href: '/maps', label: 'Maps' },
        ],
      },
      {
        href: '/vault',
        label: 'Vault',
        icon: 'lock',
        subItems: [
          { href: '/vault', label: 'All Items' },
          { href: '/shop', label: 'Shop' },
        ],
      },
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
        label: 'Migration',
        icon: 'database',
        subItems: [
          { href: '/migration', label: 'Run Migration' },
          { href: '/validation', label: 'Validation' },
          { href: '/diff', label: 'Diff' },
          { href: '/content-linker', label: 'Linker' },
        ],
      },
      {
        href: '/assets',
        label: 'Assets',
        icon: 'image',
        subItems: [
          { href: '/assets', label: 'Generation' },
          { href: '/asset-coverage', label: 'Coverage' },
          { href: '/asset-promotion', label: 'Promotion' },
        ],
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
