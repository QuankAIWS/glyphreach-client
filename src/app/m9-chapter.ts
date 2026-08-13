import type { GlyphReachApp } from './App';
import { addNorthreachJournal } from './m9-journal';
import { addNorthreachCombat } from './m9-combat';
import { addNorthreachMap } from './m9-map';
import { startNorthreachSync } from './m9-sync';
import './m9-chapter.css';
export function applyM9Chapter(root: HTMLElement, app: GlyphReachApp): void {
  addNorthreachJournal(root);
  addNorthreachCombat(root, app);
  addNorthreachMap(root);
  startNorthreachSync(root, app);
}
