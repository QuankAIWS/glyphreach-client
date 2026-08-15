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

// App.mount builds the base DOM synchronously before its first network/Pixi
// await. Finalize the player-facing shell on that boundary so Pixi measures the
// correct layout. Then install interaction controllers against the stable shell
// immediately: they can observe/bind the canvas as it appears, so there is no
// gap where the canvas is visible but the first player click has no controller.
void app.mount(root);
applyStoryPolish(root);
applyM9Chapter(root, app);
applyWorldFirstPresentation(root);
installGroundContextMenu(root);
installPlayerInterface(root, app);
installCombatIntent(root, app);
installChapterLandmarks(root, app);

window.addEventListener('beforeunload', () => app.destroy(), { once: true });