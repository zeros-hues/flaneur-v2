# Flaneur: design implementation context

Visual source of truth is /design-reference (Claude Design screens, plus
the pen.dev animation spec sheet). If this file and the reference disagree
on a visual detail, the reference wins. If the reference shows data we do
not have, render only what exists. NEVER invent names, counts, copy or
example data. Mock text in the designs is illustrative only.

## Concept
Flaneur is a private notebook of people and ideas the user noticed. It is
a city walked slowly, not a dashboard. Test for every decision: does this
feel like moving through a familiar place, or managing a queue?

## Tokens (app/globals.css, every component references these, no hardcoded values)
Colors: surface #F4EFE6, ink #2B2420, ink-quiet #8A7F72, ink-faint #C4BAA8,
margin-text #A89F94, nav-active #5A524C, accent #C1613F.
Accent is used ONLY for: overdue walk cards, correspondence lines, saved
queries with new results. Nowhere else. Not links, buttons, hover states.
Type: two registers. READING = Lora (italic for the user's notes, roman for
generated prose), 17-21px, line-height 1.75, measure 68ch. ARCHIVE = Inter,
11-15px, line-height 1.3, letter-spacing -0.01em. Reading is ONLY for the
user's notes, generated synthesis, answers, and the walk ending sentence.
Everything else is Archive. Load both with next/font (no new dependency).
Motion: utility 150ms, reading 400ms ease-out, discovery 800-1200ms.
Page navigation is NOT animated. No scroll-triggered animation.
No spinners, no skeletons. Loading is the text "thinking..." only.

## Rules that never bend
No cards, no borders on content, no shadows, no badges, no counts of
outstanding items, no infinite scroll, no pagination. Every list ends.
Every person name links to /person/[id]. Every concept label links to
/concept/[id]. Right margin is peripheral: 11px, margin-text color, no
heading, no explanation of why items appear.
Generated content (synthesis, answers) gets data-generated="true" on its
element so it is programmatically distinguishable from captured text.

## Shared primitives (build once, reuse everywhere)
INK STROKE: lib/ink/stroke.ts turns control points plus a seed into a
variable-width filled SVG path (thin at start, full pressure mid, lifting
at end, organic right edge, tapered ends). Seeded so the same element
always draws the same way. components/ink/InkLine.tsx renders it and
reveals left to right with an eased clip-path animation. Used for: input
underline (0.8 / 1.2 / 0.9px), dividing rule (0.7 / 1 / 0.6px), walk card
left mark (2.5 / 3 / 2px), correspondence lines, overlay outline.
GRAIN: a fixed full-viewport overlay, SVG feTurbulence, warm-tinted,
~180px grain, 3.5% opacity, pointer-events none, never above text.
SOUND: lib/sound/engine.ts using Web Audio API only, synthesized, no
audio files. OFF by default. Toggle lives in settings, stored in
localStorage. Cues: captureConfirm (soft low thud ~90ms), cardSlide (short
filtered-noise rustle ~120ms), sayHello (slightly brighter ~150ms),
streetClosed (low, ~180ms tail), walkEnd (silence 400ms, then one soft
tone ~600ms). No sound on search, navigation, errors, loading.
HAPTICS: navigator.vibrate where supported, silent no-op elsewhere.
REDUCED MOTION: prefers-reduced-motion disables every loop and entrance
choreography. Intent is carried by layout and copy instead.

## Generative UI contract
The server decides composition, the client renders from a registry. The
query endpoint returns { blocks: Block[] } where Block is one of:
answer {text, sources[]}, people {items[], coverage}, rule, margin
{items[]}, empty {reason}. The client NEVER parses prose to decide layout.
components/query/BlockRenderer.tsx maps each block type to a component and
owns entrance choreography by block order. No mode label anywhere.

## Working rules
TypeScript strict, no any. Do not add dependencies without asking. Do not
change the database schema without asking. Do not touch lib/parsers or
lib/enrich. Files under 300 lines. After each phase run typecheck and
build, then list what you verified and what you could not verify.