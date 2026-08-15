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

// App.mount builds the base DOM synchronously before it waits for the server and
// Pixi. Keep the presentation pass on that original boundary so Pixi measures
// the final world-shell layout, then wait for mount completion before attaching
// player-facing world interaction listeners. This preserves camera geometry
// while ensuring the first click cannot race the asynchronously-created canvas.
const mountPromise = app.mount(root);
applyStoryPolish(root);
applyM9Chapter(root, app);
applyWorldFirstPresentation(root);

void mountPromise.then(() => {
  installPlayerInterface(root, app);
  installGroundContextMenu(root);
  installCombatIntent(root, app);
  installChapterLandmarks(root, app);
});

window.addEventListener('beforeunload', () => app.destroy(), { once: true });