import type { ContentPlan } from '@las-flores/shared';
import {
  buildMysteryPlan,
  buildShopkeeperPlan,
  buildLocationPlan,
  buildGigPlan,
  buildDialogueScenePlan,
  buildVaultCollectionPlan,
} from './PlanTemplateBuilders.js';

export interface PlanTemplate {
  id: string;
  label: string;
  description: string;
  icon: string;
  buildPlan: (userDescription: string) => ContentPlan;
}

export const PLAN_TEMPLATES: PlanTemplate[] = [
  {
    id: 'add-mystery',
    label: 'Add a Mystery',
    description: 'Creates a mission + dialogue + overlay + vault item',
    icon: '\u{1F50D}',
    buildPlan: buildMysteryPlan,
  },
  {
    id: 'add-shopkeeper',
    label: 'Add a Shopkeeper',
    description: 'Creates a character + dialogue + shop items',
    icon: '\u{1F6D2}',
    buildPlan: buildShopkeeperPlan,
  },
  {
    id: 'add-location',
    label: 'Add a Location',
    description: 'Creates a location + scene + dialogue',
    icon: '\u{1F4CD}',
    buildPlan: buildLocationPlan,
  },
  {
    id: 'add-gig',
    label: 'Add a Gig',
    description: 'Creates a gig + scene + dialogue for a street job',
    icon: '\u{1F4BC}',
    buildPlan: buildGigPlan,
  },
  {
    id: 'add-dialogue-scene',
    label: 'Add a Dialogue Scene',
    description: 'Creates a dialogue + overlay for modifying dialogue trees',
    icon: '\u{1F4AC}',
    buildPlan: buildDialogueScenePlan,
  },
  {
    id: 'add-vault-collection',
    label: 'Add a Vault Collection',
    description: 'Creates a mission + multiple vault items',
    icon: '\u{1F510}',
    buildPlan: buildVaultCollectionPlan,
  },
];

export function getTemplateById(id: string): PlanTemplate | undefined {
  return PLAN_TEMPLATES.find(t => t.id === id);
}
