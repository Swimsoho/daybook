// Shared colour palette for the little category/area/etc. dots. Kept in lib (not a component)
// so both the store — which auto-assigns a colour when a category is created — and the picker
// UI can import it without a circular dependency. Twelve distinct hues that stay legible on
// every palette's paper, warm or cool.
export const DOT_PALETTE = [
  'hsl(8 62% 48%)',    // red
  'hsl(20 65% 48%)',   // orange
  'hsl(40 68% 44%)',   // gold
  'hsl(95 34% 40%)',   // olive
  'hsl(150 40% 36%)',  // green
  'hsl(175 46% 32%)',  // teal
  'hsl(200 46% 42%)',  // blue
  'hsl(220 52% 52%)',  // indigo
  'hsl(255 40% 54%)',  // violet
  'hsl(295 34% 48%)',  // magenta
  'hsl(330 48% 50%)',  // pink
  'hsl(25 22% 44%)',   // brown
]

// Deterministic fallback so every item shows a stable, sensible dot even before a colour is
// explicitly chosen (existing categories saved before colours existed, for instance).
export function fallbackDot(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return DOT_PALETTE[h % DOT_PALETTE.length]
}

// Next colour to hand a freshly-created item, cycling through the palette by how many already
// exist so a run of new categories comes out visibly different rather than all the same.
export function nextDot(count: number): string {
  return DOT_PALETTE[count % DOT_PALETTE.length]
}
