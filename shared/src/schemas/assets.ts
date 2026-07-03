import { z } from 'zod';

export const AssetBaseSchema = z.object({
  id: z.string().uuid(),
  prompt_rel: z.string(),
  proposal_index: z.number().int(),
  image_path: z.string(),
  seed: z.number().nullable().optional(),
  chosen: z.boolean().default(false),
  created_at: z.string().datetime(),
  // New fields from migration 041
  asset_type: z.string().optional(),
  prompt_text: z.string().optional(),
  negative_prompt: z.string().optional(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  final_path: z.string().nullable().optional(),
});

export type AssetBase = z.infer<typeof AssetBaseSchema>;

export const AssetVariantSchema = z.object({
  id: z.string().uuid(),
  base_id: z.string().uuid(),
  variant_name: z.string(),
  image_path: z.string(),
  i2i_strength: z.number().nullable().optional(),
  created_at: z.string().datetime(),
  // New fields from migration 041
  prompt_text: z.string().optional(),
  negative_prompt: z.string().optional(),
  width: z.number().int().nullable().optional(),
  height: z.number().int().nullable().optional(),
  final_path: z.string().nullable().optional(),
});

export type AssetVariant = z.infer<typeof AssetVariantSchema>;

export const GenerateBasesRequestSchema = z.object({
  prompt_rel: z.string(),
  count: z.number().int().min(1).max(10).default(4),
  // Optional overrides; if omitted, parsed from .prompt.md
  asset_type: z.string().optional(),
  negative_prompt: z.string().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

export type GenerateBasesRequest = z.infer<typeof GenerateBasesRequestSchema>;

export const GenerateVariantsRequestSchema = z.object({
  base_id: z.string().uuid(),
  variants: z.array(z.object({
    variant_name: z.string(),
    prompt: z.string(),
    i2i_strength: z.number().min(0).max(1).default(0.7),
    // Optional overrides
    negative_prompt: z.string().optional(),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
  })),
});

export type GenerateVariantsRequest = z.infer<typeof GenerateVariantsRequestSchema>;

export const ApproveBaseRequestSchema = z.object({
  base_id: z.string().uuid(),
});

export type ApproveBaseRequest = z.infer<typeof ApproveBaseRequestSchema>;

export const AssetListResponseSchema = z.object({
  prompt_rel: z.string(),
  bases: z.array(AssetBaseSchema),
  variants: z.array(AssetVariantSchema),
});

export type AssetListResponse = z.infer<typeof AssetListResponseSchema>;

// Prompt catalog types for the admin UI "what do you want to create?" menu
export const PromptCatalogEntrySchema = z.object({
  prompt_rel: z.string(),
  name: z.string(),
  category: z.string(),
  asset_type: z.string(),
  dimensions: z.object({
    width: z.number().int(),
    height: z.number().int(),
  }).optional(),
  prompt_file: z.string(),
  variants: z.array(z.object({
    name: z.string(),
    prompt: z.string(),
    negative_prompt: z.string().optional(),
  })),
});

export type PromptCatalogEntry = z.infer<typeof PromptCatalogEntrySchema>;

export const PromptCatalogResponseSchema = z.object({
  categories: z.array(z.object({
    id: z.string(),
    label: z.string(),
    icon: z.string().optional(),
    entries: z.array(PromptCatalogEntrySchema),
  })),
});

export type PromptCatalogResponse = z.infer<typeof PromptCatalogResponseSchema>;

// Publish workflow
export const PublishAssetRequestSchema = z.object({
  base_id: z.string().uuid().optional(),
  variant_id: z.string().uuid().optional(),
  // If omitted, uses the inventory convention based on asset_type + prompt_rel
  final_path: z.string().optional(),
});

export type PublishAssetRequest = z.infer<typeof PublishAssetRequestSchema>;

export const PublishAssetResponseSchema = z.object({
  success: z.boolean(),
  final_path: z.string(),
  url: z.string(),
});

export type PublishAssetResponse = z.infer<typeof PublishAssetResponseSchema>;

// List-all response
export const AssetGroupSummarySchema = z.object({
  prompt_rel: z.string(),
  base_count: z.number().int(),
  variant_count: z.number().int(),
  chosen_base_id: z.string().uuid().nullable().optional(),
});

export type AssetGroupSummary = z.infer<typeof AssetGroupSummarySchema>;

export const AssetListAllResponseSchema = z.object({
  groups: z.array(AssetGroupSummarySchema),
});

export type AssetListAllResponse = z.infer<typeof AssetListAllResponseSchema>;