import { createStoryPlanHandlers, type Callbacks } from './useStoryPlanApiHandlers';

export function useStoryPlanApi(cb: Callbacks) {
  return createStoryPlanHandlers(cb);
}
