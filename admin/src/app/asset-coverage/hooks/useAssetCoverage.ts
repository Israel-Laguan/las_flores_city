import { useState, useEffect } from 'react';

interface CharacterAsset {
  id: string;
  name: string;
  hasPortrait: boolean;
  portraitUrls: string[];
}

interface SceneAsset {
  id: string;
  name: string;
  hasBackground: boolean;
  backgroundUrl: string | null;
}

interface AssetCoverageResponse {
  success: boolean;
  data: {
    characters: CharacterAsset[];
    scenes: SceneAsset[];
  };
}

export function useAssetCoverage() {
  const [characters, setCharacters] = useState<CharacterAsset[]>([]);
  const [scenes, setScenes] = useState<SceneAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAssets() {
      try {
        const res = await fetch('/api/admin/coverage/assets');
        const json: AssetCoverageResponse = await res.json();
        if (json.success) {
          setCharacters(json.data.characters);
          setScenes(json.data.scenes);
        } else {
          setError('Failed to load asset coverage');
        }
      } catch {
        setError('Failed to load asset coverage');
      } finally {
        setLoading(false);
      }
    }
    fetchAssets();
  }, []);

  const charsMissing = characters.filter((c) => !c.hasPortrait);
  const charsReady = characters.filter((c) => c.hasPortrait);
  const scenesMissing = scenes.filter((s) => !s.hasBackground);
  const scenesReady = scenes.filter((s) => s.hasBackground);

  return { characters, scenes, loading, error, charsMissing, charsReady, scenesMissing, scenesReady };
}