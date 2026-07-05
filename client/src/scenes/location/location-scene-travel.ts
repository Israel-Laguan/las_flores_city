import * as api from '../../utils/api';
import { eventBus } from '../../utils/EventBus';

export async function travelTo(
  scene: any,
  locationId: string,
  audioManager: any
): Promise<void> {
  if (scene.navigationLocked) return;
  eventBus.emit('navigation:request');

  await scene.cameras.main.fadeOut(500, 0, 0, 0);
  eventBus.emit('travel:start');
  scene.input.enabled = false;

  try {
    const result = await api.movePlayer(locationId);

    if (result.success) {
      await completeTravel(scene, audioManager, result);
    } else {
      await handleTravelError(scene, result);
    }
  } catch (error: any) {
    console.error('Travel failed:', error);
    eventBus.emit('monologue:thought', 'The network flickered. I couldn\'t get where I was going.');
    eventBus.emit('travel:failed', error.message);
    await scene.cameras.main.fadeIn(500, 0, 0, 0);
  }

  if (!scene.phoneOpen) scene.input.enabled = true;
}

async function completeTravel(
  scene: any,
  audioManager: any,
  result: any
): Promise<void> {
  eventBus.emit('tb:updated', result.data.time_blocks_remaining);

  const newPayload = {
    scene: result.data.scene,
    npcs: result.data.npcs,
  };

  scene.clearMoodEffects();
  scene.npcSprites.forEach((s: any) => s.destroy());
  scene.npcSprites.clear();

  if (result.data.scene.ambientSoundUrl) {
    const trackKey = `ambient_${result.data.scene.id}`;
    audioManager.transitionAmbient(trackKey, result.data.scene.ambientSoundUrl);
  }

  await scene.bootstrapScene(newPayload);
  scene.applyScenePayload(newPayload);

  eventBus.emit('travel:complete', {
    locationId: result.data.to_location_id,
    fromLocationId: result.data.from_location_id,
    timeBlocksRemaining: result.data.time_blocks_remaining,
    tbCost: result.data.tb_cost,
  });
  eventBus.emit('location:changed', {
    locationId: result.data.to_location_id,
    scene: result.data.scene,
  });

  await scene.cameras.main.fadeIn(500, 0, 0, 0);
}

async function handleTravelError(scene: any, result: any): Promise<void> {
  const error = result.error || 'Unknown error';
  const reason = result.reason || '';

  if (error === 'exhausted') eventBus.emit('monologue:thought', 'I can barely keep my eyes open. I need to find somewhere to rest.');
  else if (error === 'location_locked') eventBus.emit('monologue:thought', reason || 'That path is blocked.');
  else if (error === 'already_here') eventBus.emit('monologue:observation', "I'm already here.");
  else eventBus.emit('monologue:thought', 'Something went wrong. The city won\'t let me move.');

  eventBus.emit('travel:failed', error);
  await scene.cameras.main.fadeIn(500, 0, 0, 0);
}