export type Tile = {
  id: string;
  x: number;
  y: number;
  terrainType: string;
  baseImageUrl?: string;
  overlayImageUrl?: string;
  rotation: number;
  isFlipped: boolean;
  metadata: Record<string, unknown>;
};

export type District = {
  id: string;
  name: string;
  slug: string;
  description?: string;
  tileCount: number;
  landmarkCount: number;
  coordinates: { x: number; y: number };
};