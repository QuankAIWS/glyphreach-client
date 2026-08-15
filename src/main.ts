import './style.css';
import { GlyphReachApp } from './app/App';
import { installChapterLandmarks } from './app/chapter-landmarks';
import { installCombatIntent } from './app/combat-intent';
import { installGroundContextMenu } from './app/ground-context';
import { applyM9Chapter } from './app/m9-chapter';
import { installPlayerInterface } from './app/world-interaction-interface';
import { applyStoryPolish } from './app/story-polish';
import { applyWorldFirstPresentation } from './app/world-first-presentation';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('GlyphReach root element not found');

const app = new GlyphReachApp();

void (async () => {
  // App.mount resolves only after the authoritative welcome state has been
  // applied and Pixi has mounted the world canvas. Install all player-facing
  // interaction layers after that boundary so the very first world click is
  // never racing an asynchronously-created canvas.
  await app.mount(root);
  applyStoryPolish(root);
  applyM9Chapter(root, app);
  applyWorldFirstPresentation(root);
  installPlayerInterface(root, app);
  installGroundContextMenu(root);
  installCombatIntent(root, app);
  installChapterLandmarks(root, app);
})();

window.addEventListener('beforeunload', () => app.destroy(), { once: true });