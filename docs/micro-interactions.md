# Micro-interactions audit

Step 1 of the micro-interaction pass. No code has changed. Every row follows the governing rule:
an interaction must say something true about **state or place** (where focus is, that something is a
door, that something was kept, that something is live). Anything that only decorates is cut.

## Before you review: things the brief and the repo disagree on

1. **`design-reference/EXTRACTED.md` does not exist.** The folder holds DESIGN.md, Flaneur.html and
   the animation spec sheet only. Easing curves below come from where they actually live today: the
   spec sheet (`ink`, `arrive`, `depart`) and the prototype frames (`draw`, `rule`). One curve in the
   code, `dissolve` (.4,0,.2,1), came from me, not a reference; it is proposed for removal.
2. **Several starting positions use durations that are not tokens.** The token set is instant 120,
   utility 150, soft 250, reading 400, discovery 1000. The brief also names 200 (input focus),
   180 (link grow), 100 (touch press) and 200 (walk recede). The table maps each to the nearest
   token and marks it **[map]**. Say if you would rather add a token.
3. **The reference choreography uses timings outside the token set**: 300ms fades, 500ms input draw,
   600ms rule, 3.6s pen, 1.2s holds, 40ms per typed character, a 10.2s idle cycle, and block offsets
   (80, 580, 700, 1350, 1500ms). Snapping these to tokens would change the reference.
   **Recommendation:** keep them, but move them into `lib/motion/tokens.ts` as a named `spec` group,
   so there are still no literal ms or cubic-bezier values anywhere else.
4. **Two existing motions animate layout**, which the rules now ban:
   - the query spacer (`height`, 800ms)
   - the walk's gap close (`grid-template-rows`, 350ms)

   Both are rewritten with transform below (P1, P2).
5. **Settings has no copy-to-clipboard.** I read "Settings: copy" as the page's wording, and audited
   that. The one copy action in the app is the walk's "say hello".

## Tokens (proposed `lib/motion/tokens.ts`)

| token | value | used for |
|---|---|---|
| `instant` | 120ms | touch press, retracting link underline, any colour change that answers a click |
| `utility` | 150ms | hover/focus colour, link underline grow **[map from 180]** |
| `soft` | 250ms | input focus extent **[map from 200]**, walk recede **[map from 200]**, city emphasis, "kept" fade |
| `reading` | 400ms | Reading-register arrivals, set-aside, empty and error sentences |
| `discovery` | 1000ms | atlas cold start, idle loop phases (with `spec`) |
| `ease.arrive` | cubic-bezier(0.25, 0.46, 0.45, 0.94) | anything appearing (spec sheet, names arrival) |
| `ease.depart` | cubic-bezier(0.55, 0.055, 0.675, 0.19) | anything leaving (spec sheet, departure) |
| `ease.ink` | cubic-bezier(0.3, 0.1, 0.7, 0.9) | every ink stroke being drawn (spec sheet, pen pace) |
| `ease.draw` | cubic-bezier(0.4, 0, 0.3, 1) | query underline draw (prototype) |
| `ease.rule` | cubic-bezier(0.45, 0, 0.3, 1) | dividing rules (prototype) |
| `ease.color` | linear | colour changes: no curve to perceive at these lengths |
| `spec.*` | reference values | the choreography offsets in decision 3 |

## Global

| touchpoint | today | proposed | duration and easing | reduced motion | touch |
|---|---|---|---|---|---|
| focus-visible (all links and text buttons) | Global `a:focus-visible` and `.textlink:focus-visible` underline (`text-decoration`). Some areas cancel only hover, so focus survives. Nav gets colour only. | The same treatment as hover everywhere: Archive links get the ink underline, Reading-register items their own state (see rows). Nothing loses its outline without an equal replacement. | as hover | instant | n/a |
| Text selection | Browser default (system blue on paper) | `::selection` ink at 12% on the surface. Tells you what you hold without breaking the paper. | none | same | same (system handles) |
| Caret colour | Ink in the query input and the note. Browser default on login and settings. | Ink everywhere text is entered. | none | same | same |
| Cursor | `pointer` on links and text buttons; `text` on the note | Unchanged. Add `pointer` to walk actions and city filters (they are buttons, already true). No custom cursors. | none | same | n/a |
| First load | Grain and nav present. Each page has its own entrance (fades and rises). Fonts swap in (`display: swap`). Page navigation is not animated. | Unchanged: the entrances already say "this arrived". No page transitions (banned). | existing, re-pointed to tokens | entrances off; content present at once | same |
| Hover media | Hover rules apply on every device (sticky on touch). | Every hover rule inside `@media (hover: hover) and (pointer: fine)`. Touch gets `:active` only. | n/a | n/a | `:active` colour for `instant` [map from 100] |
| Hidden tab | Idle loop pauses when hidden. CSS entrances play once. | Unchanged, plus P7. | n/a | n/a | n/a |

## Navigation and shared links

| touchpoint | today | proposed | duration and easing | reduced motion | touch |
|---|---|---|---|---|---|
| Nav items | quiet → nav-active colour on hover/focus (150ms); active item nav-active, no underline | Unchanged in look; moved inside the hover media query; focus-visible identical. | `utility`, `ease.color` | instant colour | `:active` nav-active for `instant` |
| "flaneur" wordmark | same as nav items | same as nav items | same | same | same |
| Every person name (query results, sources, walk cards, person margin, concept rows and margin, city) | Mixed: global underline in some places, none in others (`.q a:hover` and `.sheet a:hover` cancel it). Nothing says "door" consistently. | One shared Archive hover: a tapered ink underline grows from the left, retracts on leave. Built from a `background-image` gradient with `background-size` (no SVG per link). Colour does not change. | grow `utility` **[map from 180]** `ease.arrive`; retract `instant` `ease.depart` | underline appears and leaves instantly | `:active` underline at full width for `instant` |
| Every concept label (query margin, person concepts, person margin, concept "often found with") | Same as person names | Same shared underline. In the margins it sits at margin-text strength, so periphery stays peripheral. | same | same | same |
| Source rows (answer block) | Name link only; snippet and date inert | Name gets the shared underline. The row itself does not react: only the door reacts. | same | same | same |
| "view on LinkedIn ↗" | No hover (cancelled by `.sheet a:hover`) | Shared underline in margin-text. (The arrow nudge is P8, only if you approve it.) | `utility` | underline instant | `:active` underline |

## Query surface (/)

| touchpoint | today | proposed | duration and easing | reduced motion | touch |
|---|---|---|---|---|---|
| Input focus | Autofocus on load. No visible change (`outline: none`); the static ink underline is the only mark. | The underline extends 4px past each end on focus, retracting on blur. Clip-path on a line drawn 8px wider, so no layout moves. Tells you where focus is. | `soft` **[map from 200]** `ease.arrive`; retract `instant` | extent changes instantly | same as desktop (focus is real on touch) |
| Caret | Ink | Ink (unchanged) | none | same | same |
| Typing | Each keystroke dissolves the idle loop (600ms) | Unchanged. No per-keystroke motion: typing is the user's, not ours. | `spec.dissolve` (600) on `ease.depart` (replacing `dissolve`) | loop shows static and hides instantly (already) | same |
| Esc to clear | Clears the text, returns to idle; spacer animates `height` back (layout) | Clears instantly; the input settles back by transform (P1). The idle loop returns after the settle, not during it. | `reading`, `ease.arrive` | instant jump, no movement | n/a (no Esc on touch keyboards) |
| Submit | Enter: underline redraws (500ms), "thinking..." types in at 40ms per character after 500ms; spacer animates `height` 290→88 (layout) | Same draw and typing; the lift moves to transform (P1). | draw `spec.inputDraw` (500) `ease.draw`; type `spec.typePerChar` (40) | underline present, "thinking..." present whole | same |
| Thinking | Italic "thinking..." stays until the response | Unchanged. It is the only loading sign (no spinners). | n/a | static text | same |
| Answer arrival | One 400ms fade; sources rise at +700; footnote at +1350 | Unchanged; values move to tokens and `spec`. | `reading` `ease.arrive`; `spec` offsets | all present at once | same |
| People arrival | Together, 300ms rise 8px; synthesis +80ms; coverage +580ms | Unchanged; values to `spec`. | `spec` | present at once | same |
| Person row hover | The whole row brightens its synthesis line to ink (150ms) | Unchanged, plus the name's shared underline (the name is the door; the brightened line says which row you're on). | `utility` `ease.color` | instant | `:active` on the row brightens for `instant` |
| Mixed-state rule | Draws 600ms at +1500ms | Unchanged | `spec.rule` (600) `ease.rule` | rule present, not drawn | same |
| Margin arrival | 0 → 60% → settles to 100% over 400ms | Unchanged | `reading` `ease.arrive` | present at full | same |
| Margin items | No hover | Shared underline at margin-text strength | as links | as links | as links |
| Empty and error sentences | 400ms fade, Lora | Unchanged. No shake, no colour: the sentence carries it. | `reading` `ease.arrive` | present | same |
| "save this search" | Text button; hover underline; click → "Saved." or "That didn't save." | Copy unchanged ("Saved." / "That didn't save."). It already swaps in place, never a toast; the change is reserving the line's space so nothing below moves. | colour `instant` | same | same |

## Person page (/person/[id])

| touchpoint | today | proposed | duration and easing | reduced motion | touch |
|---|---|---|---|---|---|
| Note, idle | Lora italic; cursor `text`; focus-visible shows a faint underline | Unchanged at rest. Hover shows the 1px ink-faint baseline at 50% (a hint that it's editable), full on focus. | `utility` `ease.color` | instant | no hover hint; tapping enters edit directly |
| Note, editing | Becomes a same-type textarea; no visible edit state | A 1px ink-faint baseline sits under the text while editing. Says "you are writing now". | appears `soft` `ease.arrive` (opacity) | instant | same |
| Note, saving | Text stays; nothing shown | Nothing new while saving (fast, local feel); "kept" confirms. | n/a | n/a | n/a |
| Note, saved | Nothing | "kept" fades in at the right edge (Inter 11px, margin-text), clears after 1.2s. Space reserved. | in `soft`, hold `spec.keptHold` (1200), out `reading` `ease.depart` | appears and clears without fading | same |
| Note, failed | "That didn't save." below; shifts the page about 16px | "not saved. try again." in the same reserved slot as "kept". No shift. | `soft` | instant | same |
| First-note empty state | "add a note" in margin-text italic; click to write | Unchanged copy; same hover baseline hint as an idle note. | `utility` | instant | tap enters edit |
| Role rows | Static | Unchanged: not doors, so no hover. | n/a | n/a | n/a |
| Coverage caveat | Static italic | Unchanged | n/a | n/a | n/a |
| Rule | Draws 600ms from 800ms after load | Unchanged | `spec.rule` `ease.rule` | present | same |
| Archive and margin arrival | Rise at 1600ms; margin fade at 2000ms | Unchanged; to `spec` | `reading` | present | same |

## Walk (/walk)

| touchpoint | today | proposed | duration and easing | reduced motion | touch |
|---|---|---|---|---|---|
| Card hover | Nothing | The other cards recede to 55% opacity. Says which card you're attending to. Focus inside a card does the same. | `soft` **[map from 200]** `ease.color` | instant | none (no sticky hover) |
| Action hover | Hovered action to ink, siblings to margin-text (150ms); applies on touch too | Same, inside the hover media query; focus-visible identical (already). | `utility` | instant | none |
| Action press | Nothing until the request returns | Text goes to ink at once on press. | none (instant) | same | `:active` ink |
| Keyboard | All four actions are buttons, reachable by Tab | Unchanged (verified when built). Shortcuts only if you approve P4. | n/a | n/a | n/a |
| Set-aside | Fade plus 6px drop, 400ms; sound plays | Unchanged | `reading` `ease.depart` | card disappears without movement; sound unaffected | same |
| Gap close | `grid-template-rows` 350ms after a 300ms pause (layout animation) | P2: remove the slot at once, then slide the cards below up by transform from their old position. | `spec.gapClose` (350) `ease.arrive` | gap closes instantly | same |
| Overdue mark | Vertical ink line draws 600ms after the card arrives; accent | Unchanged (accent use 1 of 3) | `spec.markDraw` `ease.ink` | present, not drawn | same |
| say hello | "thinking...", then "copied" replaces the action row; the card leaves 900ms later | The action text itself swaps to "copied" in place for 1.2s, then the card sets aside. No toast. The blocked-tab link stays as today. | `spec.copiedHold` (1200) | same, no fades | same |
| Ending | 800ms of empty surface, then "That's today's walk." fades in over 1200ms; walkEnd cue | Unchanged | `spec.emptySurface`, `spec.endingFade` `ease.arrive` | text present after the pause, no fade | same |

## City (/city)

| touchpoint | today | proposed | duration and easing | reduced motion | touch |
|---|---|---|---|---|---|
| Person hover | Nothing (name underline cancelled) | That person's name and their lines brighten; everyone else recedes to 40%. Says who is connected to whom. Focus on a name does the same. | `soft` `ease.color` | instant | none; tap opens the person |
| Line emphasis | Lines static at 70% (35% under a filter) | Hovered person's lines go to ink-faint at full; others recede with their people. Built as a second path per person in the overlay, toggled by opacity: no geometry changes. | `soft` | instant | none |
| Filter change | Non-matching people fade to 20% (300ms); lines to 35%; positions never move | Non-matching people to 25%. Active filter word in ink (already). Positions never animate. | `soft` | instant | `:active` ink on the filter word |
| Mobile list | Static | Names get the shared underline on press only | `instant` | instant | `:active` underline |

## Atlas (/atlas)

| touchpoint | today | proposed | duration and easing | reduced motion | touch |
|---|---|---|---|---|---|
| Cold-start text | Both lines fade in together (600ms) | The two lines arrive 300ms apart: the second sentence is the instruction, so it lands after the state. | each `discovery` `ease.arrive`; offset `spec.coldStagger` (300) | both present at once | same |
| "the whole city" | margin-text → quiet colour on hover | Shared underline at margin-text strength | as links | as links | as links |

## Settings (/settings)

| touchpoint | today | proposed | duration and easing | reduced motion | touch |
|---|---|---|---|---|---|
| Sound toggle | Word swaps "off" ↔ "on" instantly; hover darkens | Unchanged swap. Turning sound **on** plays captureConfirm once as a preview (the only sound outside the five cues' usual places). | instant | same (sound is not motion) | same |
| Motion toggle | "as your system sets it" ↔ "always reduced", instant | Unchanged | instant | same | same |
| Download extension | Link; hover darkens | Shared underline | as links | as links | as links |
| Export | Link with `download`; nothing after click | Shared underline. On click the file is fetched by the page, so the link can say "thinking..." (the app's one loading word) while the export builds and restore when the download starts. True to state, no timer. | `instant` | same | same |
| Saved query run | "run" → "thinking..." → people list; the accent on the query text if results changed | Unchanged; the accent stays here (use 3 of 3). The people list arrives with a reading fade. | `reading` `ease.arrive` | present | same |
| Page copy | Lowercase labels, plain sentences | Unchanged | n/a | n/a | n/a |

## Login (/login)

| touchpoint | today | proposed | duration and easing | reduced motion | touch |
|---|---|---|---|---|---|
| Secret input | Old `search-input`: a 1px border-bottom that darkens on focus; default caret | Same focus language as the query input (P6): ink caret, underline extent on focus. Layout and copy unchanged. | `soft` | instant | same |
| "enter" | Text button with hover underline | Shared underline | as links | as links | as links |
| Wrong secret | "That secret didn't match." appears | Unchanged | n/a | n/a | n/a |

## Proposals (8 maximum, each needs your yes)

| # | proposal | reason (governing rule) |
|---|---|---|
| P1 | Replace the query spacer's `height` animation with a transform slide (the layout jumps; the content is translated from its old place to its new one) | Place: you still see the input lift to make room for reading, without animating layout (now banned). |
| P2 | Close the walk gap by transform (cards below slide up from their old position) instead of `grid-template-rows` | State: the walk visibly got shorter, without animating layout. |
| P3 | Remove the `dissolve` curve I invented in phase C; use `ease.depart` from the spec sheet | Nothing unreferenced: the idle loop's leaving already has a spec'd curve. |
| P4 | Walk keyboard shortcuts when a card holds focus: h say hello, k keep walking, c street's closed, p just passing, shown nowhere visually (aria-keyshortcuts only) | Place: the focused card is the one that answers, which the recede already shows. |
| P5 | Arriving at `/person/[id]#post-…` from an answer source draws a one-time ink underline beneath that post's date | Place: tells you where the link landed you, then gets out of the way. |
| P6 | Login input uses the query input's focus language | Place: the same "focus is here" everywhere text is entered. |
| P7 | Pause the idle canvas when it is scrolled out of view (IntersectionObserver), not only when the tab is hidden | Nothing animates offscreen (rule). |
| P8 | "view on LinkedIn ↗": the arrow nudges up-right on hover | Door: says this one leaves the city, unlike every other link. |

## Banned-list check (today)

No hover scale, bounce, glow, hover fills, parallax, scroll triggers, skeletons, confetti or cursor
followers anywhere in the app. Shadows: none in the app. (The extension overlay has one from its
reference frame, but the extension is out of scope.) Success toasts: none in the app; "Saved." after
saving a search is an inline swap, not a toast.
