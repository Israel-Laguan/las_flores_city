import { z } from 'zod';

// ============================================================
// Shop Item Schema
// ============================================================
// A `shop_item` is a cosmetic that the player can purchase with
// either `credits` (in-game currency, can be earned) or
// `gold_credits` (real-money, granted by PayPal webhooks).
//
// Authored via the YAML content pipeline at /content/shop/*.yaml
// and upserted by server/src/content/upsert.ts::upsertShopItem.
// The shop route GET /shop/catalog reads from this table.
// ============================================================

export const ShopItemTypeSchema = z.enum(['ui_theme', 'avatar_border', 'character_skin']);
export type ShopItemType = z.infer<typeof ShopItemTypeSchema>;

export const ShopCurrencySchema = z.enum(['credits', 'gold_credits']);
export type ShopCurrency = z.infer<typeof ShopCurrencySchema>;

export const ShopItemSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  item_type: ShopItemTypeSchema,
  price: z.number().int().min(0),
  currency_type: ShopCurrencySchema.default('gold_credits'),
  asset_url: z.string().url(),
  is_active: z.boolean().default(true),
  // UGC authorship metadata. Optional so existing content parses unchanged.
  written_by: z.string().max(100).optional(),
});

export type ShopItem = z.infer<typeof ShopItemSchema>;

// ============================================================
// Shop File Schema (for YAML bundling)
// ============================================================
// A single YAML file can contain multiple shop items as a
// `shop_items: [...]` array, mirroring the multi-item bundles
// used elsewhere in the content pipeline (e.g. `gigs.yaml`).
// ============================================================

export const ShopItemFileSchema = z.object({
  shop_items: z.array(ShopItemSchema),
});

export type ShopItemFile = z.infer<typeof ShopItemFileSchema>;

// ============================================================
// Player Inventory
// ============================================================
// A row in player_inventory represents ownership of a shop_item.
// acquired_via disambiguates how the row was created (purchase
// via /shop/buy, grant via an admin action, or IAP via PayPal
// webhook for grant-only items that bypass the catalog).
// ============================================================

export const InventoryAcquisitionSchema = z.enum(['purchase', 'grant', 'iap']);
export type InventoryAcquisition = z.infer<typeof InventoryAcquisitionSchema>;

export const PlayerInventoryItemSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  shop_item_id: z.string().uuid(),
  acquired_via: InventoryAcquisitionSchema,
  reference_id: z.string().uuid().nullable().optional(),
  acquired_at: z.string().datetime(),
  // Denormalised item data so the client can render the inventory
  // without a second round-trip to /shop/catalog.
  item: ShopItemSchema,
});

export type PlayerInventoryItem = z.infer<typeof PlayerInventoryItemSchema>;

// ============================================================
// Shop Purchase Request
// ============================================================
// Client posts {shop_item_id} to /shop/buy. The server resolves
// the item, validates balance + ownership, calls
// BankService.modifyBalance, and inserts the inventory row.
// ============================================================

export const ShopPurchaseRequestSchema = z.object({
  shop_item_id: z.string().uuid(),
});

export type ShopPurchaseRequest = z.infer<typeof ShopPurchaseRequestSchema>;

export const ShopPurchaseResponseSchema = z.object({
  inventory_item: PlayerInventoryItemSchema,
  new_balance: z.number().int(),
  currency_type: ShopCurrencySchema,
});

export type ShopPurchaseResponse = z.infer<typeof ShopPurchaseResponseSchema>;

// ============================================================
// Equip Request
// ============================================================
// Client posts {slot, shop_item_id} to /shop/equip. slot is one
// of the equipped columns on public_profiles. The server
// validates that the player owns the item before writing.
// ============================================================

export const EquipSlotSchema = z.enum(['theme', 'border']);
export type EquipSlot = z.infer<typeof EquipSlotSchema>;

export const EquipRequestSchema = z.object({
  slot: EquipSlotSchema,
  shop_item_id: z.string().uuid().nullable(),
});

export type EquipRequest = z.infer<typeof EquipRequestSchema>;

// ============================================================
// Public Profile (for the leaderboard "look at this player"
// view, future use — wire shape is the same as a friend
// profile card)
// ============================================================

export const PublicProfileSchema = z.object({
  user_id: z.string().uuid(),
  username: z.string(),
  display_name: z.string().nullable().optional(),
  equipped_theme: ShopItemSchema.nullable().optional(),
  equipped_border: ShopItemSchema.nullable().optional(),
  badges: z.array(z.string()).default([]),
});

export type PublicProfile = z.infer<typeof PublicProfileSchema>;

// ============================================================
// PayPal Webhook Payloads
// ============================================================
// The webhook handler accepts PAYMENT.CAPTURE.COMPLETED events
// from PayPal. The shape below mirrors the relevant fields of
// the PayPal v2 capture resource — we only validate the subset
// we actually consume, not the full resource.
// ============================================================

export const PayPalCaptureStatusSchema = z.enum(['COMPLETED', 'DECLINED', 'PARTIALLY_REFUNDED', 'REFUNDED', 'PENDING']);
export type PayPalCaptureStatus = z.infer<typeof PayPalCaptureStatusSchema>;

export const PayPalAmountSchema = z.object({
  currency_code: z.string().length(3),
  value: z.string(),
});
export type PayPalAmount = z.infer<typeof PayPalAmountSchema>;

export const PayPalPurchaseUnitSchema = z.object({
  custom_id: z.string().uuid().nullable().optional(),
  reference_id: z.string().optional(),
  amount: PayPalAmountSchema.optional(),
});
export type PayPalPurchaseUnit = z.infer<typeof PayPalPurchaseUnitSchema>;

export const PayPalResourceSchema = z.object({
  id: z.string(),
  status: PayPalCaptureStatusSchema,
  custom_id: z.string().uuid().nullable().optional(),
  amount: PayPalAmountSchema.optional(),
  purchase_units: z.array(PayPalPurchaseUnitSchema).optional(),
});
export type PayPalResource = z.infer<typeof PayPalResourceSchema>;

export const PayPalWebhookEventSchema = z.object({
  id: z.string(),
  event_type: z.string(),
  resource_type: z.string(),
  resource: PayPalResourceSchema,
});

export type PayPalWebhookEvent = z.infer<typeof PayPalWebhookEventSchema>;
