export const API_BASE = '/assets';

export type Category = {
  id: string;
  label: string;
  icon: string;
  entries: Array<{
    prompt_rel: string;
    name: string;
    category: string;
    asset_type: string;
    dimensions: { width: number; height: number };
    prompt_file: string;
    variants: Array<{ name: string; prompt: string; negative_prompt?: string }>;
  }>;
};

export type View = 'catalog' | 'generator';
