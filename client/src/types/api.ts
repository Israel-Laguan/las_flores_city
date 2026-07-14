export interface VaultItem {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  mediaPath: string;
  itemType: string;
  requiresSignedUrl?: boolean;
  unlockedAt: string;
}

export interface ShopItem {
  id: string;
  name: string;
  description?: string;
  item_type: 'ui_theme' | 'avatar_border' | 'character_skin';
  price: number;
  currency_type: 'credits' | 'gold_credits';
  asset_url: string;
  is_active: boolean;
}

export interface PlayerInventoryItem {
  id: string;
  user_id: string;
  shop_item_id: string;
  acquired_via: 'purchase' | 'grant' | 'iap';
  reference_id?: string | null;
  acquired_at: string;
  item: ShopItem;
}

export interface PublicProfile {
  user_id: string;
  username: string;
  display_name?: string | null;
  equipped_theme?: ShopItem | null;
  equipped_border?: ShopItem | null;
  badges: string[];
}
