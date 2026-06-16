import Phaser from 'phaser';

export interface LoadingOverlay {
  container: Phaser.GameObjects.Container;
  show: () => void;
  hide: () => void;
}

export function createLoadingOverlay(scene: Phaser.Scene): LoadingOverlay {
  const { width, height } = scene.cameras.main;

  const container = scene.add.container(0, 0);
  container.setDepth(200);
  container.setVisible(false);

  const bg = scene.add.graphics();
  bg.fillStyle(0x0a0a1a, 1);
  bg.fillRect(0, 0, width, height);
  container.add(bg);

  const title = scene.add.text(width / 2, height / 2 - 30, 'LOADING SCENE', {
    font: 'bold 16px monospace',
    color: '#00ff00',
  }).setOrigin(0.5);
  container.add(title);

  const dots = scene.add.text(width / 2, height / 2 + 5, '', {
    font: '14px monospace',
    color: '#666666',
  }).setOrigin(0.5);
  container.add(dots);

  let dotsTimer: Phaser.Time.TimerEvent | null = null;

  return {
    container,
    show() {
      container.setVisible(true);
      let dotCount = 0;
      dotsTimer = scene.time.addEvent({
        delay: 400,
        loop: true,
        callback: () => {
          dotCount = (dotCount + 1) % 4;
          dots.setText('.'.repeat(dotCount));
        },
      });
    },
    hide() {
      container.setVisible(false);
      if (dotsTimer) {
        dotsTimer.destroy();
        dotsTimer = null;
      }
    },
  };
}
