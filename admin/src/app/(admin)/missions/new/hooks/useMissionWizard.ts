'use client';

import { useMissionForm } from './useMissionForm';
import { useMissionEntityLists } from './useMissionEntityLists';
import { useMissionGenerator } from './useMissionGenerator';

export function useMissionWizard() {
  const form = useMissionForm();
  const entities = useMissionEntityLists();
  const generator = useMissionGenerator();

  const handleGenerate = async () => {
    await generator.handleGenerate({
      title: form.title,
      description: form.description,
      status: form.status,
      loreRef: form.loreRef,
      selectedCharacters: entities.selectedCharacters,
      selectedScenes: entities.selectedScenes,
      selectedDialogues: entities.selectedDialogues,
      vaultItems: form.vaultItems,
      overlays: form.overlays,
      createStory: form.createStory,
      storyTitle: form.storyTitle,
      storyDescription: form.storyDescription,
      storyLoreRef: form.storyLoreRef,
    });
  };

  const reset = () => {
    generator.reset();
    form.resetForm();
    entities.resetSelections();
  };

  return {
    step: generator.step, setStep: generator.setStep,
    generating: generator.generating, generated: generator.generated,
    error: generator.error, generatedLinks: generator.generatedLinks,
    ...form,
    ...entities,
    handleGenerate, reset,
  };
}
