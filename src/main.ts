import './style.css';
import { GlyphReachApp } from './app/App';
import { applyStoryPolish } from './app/story-polish';

const root = document.querySelector<HTMLElement>('#app');
if (!root) throw new Error('GlyphReach root element not found');

const app = new GlyphReachApp();
void app.mount(root);
applyStoryPolish(root);

window.addEventListener('beforeunload', () => app.destroy(), { once: true });
