/** Distinct, readable hues for player names (works on light and dark backgrounds). */
const PALETTE = [
  '#e4572e', '#2e86de', '#17a589', '#c0392b', '#8e44ad',
  '#d68910', '#16a085', '#2c3e50', '#d35400', '#1f618d',
  '#7d3c98', '#229954', '#b03a2e', '#5d6d7e', '#af601a',
];

export function playerColor(players: string[], name: string | undefined): string {
  if (!name) return 'var(--unassigned)';
  const i = players.indexOf(name);
  return PALETTE[(i >= 0 ? i : 0) % PALETTE.length];
}
