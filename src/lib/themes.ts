import { ThemeId } from './model'

// Metadata for the Settings-page palette picker. The actual colors live as CSS custom
// properties in index.css ([data-theme="..."] blocks) — this is just the swatch preview
// (so the picker doesn't need to read computed styles) plus display copy. Applying a theme
// is a single `document.documentElement.dataset.theme = id` (see Shell in App.tsx); nothing
// else in the app references a theme id directly, so adding a new palette is just a new
// entry here + a matching CSS block, no component changes required.
export interface ThemeMeta {
  id: ThemeId
  name: string
  blurb: string
  // three preview dots: background, primary, accent — enough to tell palettes apart at a glance
  swatch: [string, string, string]
}

export const THEMES: ThemeMeta[] = [
  { id: 'sage', name: 'Sage', blurb: 'The original — warm paper with a deep green accent.', swatch: ['hsl(42 44% 94%)', 'hsl(152 22% 23%)', 'hsl(42 30% 87%)'] },
  { id: 'clay', name: 'Clay', blurb: 'Warm terracotta on cream paper.', swatch: ['hsl(32 46% 95%)', 'hsl(17 63% 40%)', 'hsl(28 32% 88%)'] },
  { id: 'ocean', name: 'Ocean', blurb: 'Cool navy-blue on a pale blue-gray paper.', swatch: ['hsl(205 40% 95%)', 'hsl(205 45% 28%)', 'hsl(205 25% 88%)'] },
  { id: 'plum', name: 'Plum', blurb: 'Muted berry accent on a soft pink-tinted paper.', swatch: ['hsl(320 28% 95%)', 'hsl(320 35% 30%)', 'hsl(320 18% 88%)'] },
  { id: 'slate', name: 'Slate', blurb: 'Neutral cool gray — the least "warm paper," most minimal option.', swatch: ['hsl(210 15% 95%)', 'hsl(210 25% 25%)', 'hsl(210 12% 88%)'] },
  { id: 'ink', name: 'Ink', blurb: 'Broadsheet crisp — near-black ink on pale ivory, the highest-contrast option.', swatch: ['hsl(45 20% 96%)', 'hsl(222 18% 15%)', 'hsl(45 10% 88%)'] },
  { id: 'burgundy', name: 'Burgundy', blurb: 'Deep wine accent on a soft rose paper — private-study luxury.', swatch: ['hsl(350 24% 95%)', 'hsl(350 48% 30%)', 'hsl(350 16% 88%)'] },
  { id: 'forest', name: 'Forest', blurb: 'Rich, saturated pine — deeper and more vivid than Sage.', swatch: ['hsl(90 22% 95%)', 'hsl(145 42% 20%)', 'hsl(95 16% 88%)'] },
  { id: 'brass', name: 'Brass', blurb: 'Warm gold-ochre on parchment — vintage ledger, study-and-leather.', swatch: ['hsl(40 34% 94%)', 'hsl(40 55% 32%)', 'hsl(38 22% 87%)'] },
  { id: 'snow', name: 'Snow', blurb: 'Pure white background with a graphite accent — the cleanest, brightest option.', swatch: ['hsl(0 0% 100%)', 'hsl(220 14% 20%)', 'hsl(220 12% 92%)'] },
  { id: 'indigo', name: 'Indigo', blurb: 'Bright near-white with a vivid indigo accent — crisp and colourful.', swatch: ['hsl(230 30% 99%)', 'hsl(245 58% 42%)', 'hsl(235 30% 92%)'] },
  { id: 'teal', name: 'Teal', blurb: 'Clean white-cool background with a deep teal accent — fresh and modern.', swatch: ['hsl(190 30% 99%)', 'hsl(185 60% 26%)', 'hsl(190 22% 91%)'] },
]
