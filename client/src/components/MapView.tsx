import { useEffect, useMemo, useState, useCallback } from 'react';
import * as api from '../utils/api';
import { navigateTo } from '../router';
import type { Tile } from '../types/map';
import '../styles/map.css';

interface District {
  id: string;
  name: string;
  slug: string;
  description?: string;
  tileCount: number;
  landmarkCount: number;
  coordinates: { x: number; y: number };
}

interface DistrictDetail {
  tiles: Tile[];
  name: string;
  description?: string;
}

const TERRAIN_COLORS: Record<string, string> = {
  street: '#5C6A7A',
  sidewalk: '#8A9B68',
  beach_sand: '#D4834F',
  water_ocean: '#4A7C8A',
  water_river: '#6B8C42',
  grass_park: '#8A9B68',
  cobblestone: '#B8956A',
  industrial_concrete: '#5C6A7A',
  desert_sand: '#C17854',
  port_asphalt: '#5C6A7A',
  building_civic: '#1A1A1A',
  building_residential: '#B8956A',
};

export default function MapView({ initialDistrict, playerState }: { initialDistrict?: string; playerState?: any }) {
  const [districts, setDistricts] = useState<District[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<DistrictDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [dayNight, setDayNight] = useState<'day' | 'night'>('day');

  const currentLocationId = playerState?.locationId as string | undefined;

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    async function load() {
      try {
        if (initialDistrict) {
          const res: any = await api.getDistrictMap(initialDistrict);
          if (!ignore) setSelectedDistrict(res.data);
        } else {
          const res: any = await api.getMapOverview();
          if (!ignore) setDistricts(res.data);
        }
      } catch (e) {
        console.error('Map load failed', e);
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    load();
    return () => { ignore = true; };
  }, [initialDistrict]);

  useEffect(() => {
    if (playerState?.timeBlocks !== undefined) {
      setDayNight(playerState.timeBlocks <= 10 ? 'night' : playerState.timeBlocks >= 30 ? 'day' : dayNight);
    }
  }, [playerState?.timeBlocks]);

  const handleDistrictClick = useCallback((slug: string) => {
    navigateTo(`/map/${slug}`);
  }, []);

  const handleTileClick = useCallback((tile: Tile) => {
    if (tile.metadata?.location_id) {
      navigateTo(`/city/loc/${tile.metadata.location_id}`);
    }
  }, []);

  const handleBack = useCallback(() => {
    navigateTo('/map');
  }, []);

  const worldLabelStyle: React.CSSProperties = useMemo(() => ({
    color: 'var(--color-off-white, #F5F5DC)',
  }), []);

  const districtLabelStyle: React.CSSProperties = useMemo(() => ({
    color: 'var(--color-off-white, #F5F5DC)',
  }), []);

  if (loading) {
    return (
      <div className="map-container" data-daynight={dayNight}>
        <div className="map-loading">Cargando mapa&#8230;</div>
      </div>
    );
  }

  if (!initialDistrict) {
    return (
      <div className="map-container map-world" data-daynight={dayNight}>
        <div className="world-header" style={worldLabelStyle}>
          <h1>LAS FLORES 2077</h1>
          <p className="world-subtitle">Una ciudad de dualidades</p>
        </div>
        <div className="district-cards">
          {districts.map((d) => (
            <button key={d.id} className="district-card" onClick={() => handleDistrictClick(d.slug)}>
              <div className="district-card-header">
                <h3>{d.name}</h3>
                <span className="district-count">{d.tileCount} zonas</span>
              </div>
              <p className="district-description">{typeof d.description === 'string' ? d.description : 'Sin descripción'}</p>
              <div className="district-card-footer">
                <span>✨ {d.landmarkCount} puntos de interés</span>
                <span>Entrar →</span>
              </div>
            </button>
          ))}
        </div>
        <div className="world-controls">
          <button className="daynight-toggle" onClick={() => setDayNight((dn) => (dn === 'day' ? 'night' : 'day'))}>
            {dayNight === 'day' ? '🌙 Noche' : '☀️ Día'}
          </button>
        </div>
      </div>
    );
  }

  if (!selectedDistrict) return null;

  const tiles: Tile[] = selectedDistrict.tiles || [];
  const minX = tiles.length ? Math.min(...tiles.map((t) => t.x)) : 0;
  const maxX = tiles.length ? Math.max(...tiles.map((t) => t.x)) : 0;
  const minY = tiles.length ? Math.min(...tiles.map((t) => t.y)) : 0;
  const maxY = tiles.length ? Math.max(...tiles.map((t) => t.y)) : 0;
  const cols = maxX - minX + 1;

  return (
    <div className="map-container map-district" data-daynight={dayNight}>
      <div className="district-header" style={districtLabelStyle}>
        <button className="back-button" onClick={handleBack}>← Volver</button>
        <div className="district-title">
          <h2>{selectedDistrict.name}</h2>
          <p>{typeof selectedDistrict.description === 'string' ? selectedDistrict.description : ''}</p>
        </div>
        <button className="daynight-toggle" onClick={() => setDayNight((dn) => (dn === 'day' ? 'night' : 'day'))}>
          {dayNight === 'day' ? '🌙 Noche' : '☀️ Día'}
        </button>
      </div>

      {tiles.length === 0 ? (
        <div className="district-empty">
          <p>Este distrito aún no tiene mapa detallado.</p>
        </div>
      ) : (
        <div
          className="tile-grid"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          }}
        >
          {tiles.map((tile: Tile) => {
            const color = TERRAIN_COLORS[tile.terrainType] || '#2a2a2a';
            const isCurrent = currentLocationId && tile.metadata?.location_id === currentLocationId;
            const baseStyle: React.CSSProperties = {
              backgroundColor: color,
              backgroundImage: tile.baseImageUrl ? `url(${tile.baseImageUrl})` : undefined,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
              transform: tile.rotation ? `rotate(${tile.rotation}deg)` : undefined,
            };

            return (
              <div
                key={tile.id}
                className={`map-tile${tile.overlayImageUrl ? ' has-overlay' : ''}${isCurrent ? ' current-location' : ''}`}
                style={baseStyle}
                onClick={() => handleTileClick(tile)}
                title={String(tile.metadata?.label || tile.terrainType)}
              >
                {tile.overlayImageUrl && (
                  <img src={tile.overlayImageUrl} alt="" className="landmark-overlay" draggable={false} />
                )}
                {String(tile.metadata?.label) && !tile.overlayImageUrl && (
                  <span className="tile-dot" />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
