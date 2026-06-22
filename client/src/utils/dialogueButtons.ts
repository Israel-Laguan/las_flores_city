export function disableChoiceButtons(container: HTMLDivElement | null) {
  if (!container) return;
  (container as HTMLElement).style.pointerEvents = 'none';
  container.querySelectorAll('.choice-btn').forEach(btn => {
    (btn as HTMLButtonElement).disabled = true;
    Object.assign(btn as HTMLElement, { style: { pointerEvents: 'none', opacity: '0.5' } });
  });
}

export function enableChoiceButtons(container: HTMLDivElement | null) {
  if (!container) return;
  (container as HTMLElement).style.pointerEvents = 'auto';
  container.querySelectorAll('.choice-btn').forEach(btn => {
    (btn as HTMLButtonElement).disabled = false;
    Object.assign(btn as HTMLElement, { style: { pointerEvents: 'auto', opacity: '1' } });
  });
}

export function attachChoiceButtonListeners(
  container: HTMLDivElement | null,
  onChoice: (index: number) => void
) {
  if (!container) return;
  const buttons = container.querySelectorAll('.choice-btn');
  buttons.forEach(button => {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      onChoice(parseInt(button.getAttribute('data-choice-index') || '0', 10));
    });
    button.addEventListener('mouseenter', () => {
      if (!(button as HTMLButtonElement).disabled) {
        (button as HTMLElement).style.backgroundColor = 'rgba(0, 255, 0, 0.15)';
        (button as HTMLElement).style.borderColor = 'rgba(0, 255, 0, 0.6)';
      }
    });
    button.addEventListener('mouseleave', () => {
      (button as HTMLElement).style.backgroundColor = 'rgba(0, 255, 0, 0.05)';
      (button as HTMLElement).style.borderColor = 'rgba(0, 255, 0, 0.3)';
    });
  });
}
