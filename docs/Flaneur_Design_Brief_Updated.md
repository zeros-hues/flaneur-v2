# Flaneur — Design Brief

2026-10-10 · Updated product and art direction

## Purpose

This brief translates the updated Flaneur PRD into interface and interaction direction.

Every design decision should answer one question:

> **Does this help the user recognize, recall, and reconnect the things they once noticed — without making them feel like they are managing a database?**

Flaneur is no longer framed primarily as a quiet LinkedIn journal or a daily review ritual. It is a personal memory of a user's trail of attention across people, work, ideas, and trajectories. The interface should make that memory feel legible, alive, and trustworthy.

The product should feel like **a composed field of living evidence**: editorial rather than dashboard-like, observational rather than managerial, intelligent without looking like an AI control panel.

## Product character

Flaneur should feel:

- observant;
- intelligent;
- quiet but not sleepy;
- editorial;
- tactile without skeuomorphism;
- asymmetric but composed;
- private;
- curious;
- precise about provenance.

It should not feel:

- like a CRM;
- like Notion with a graph;
- like a bookmarking grid;
- like an infinite social feed;
- like a Victorian scrapbook;
- like a literal Paris map;
- like an AI chatbot wrapped in generic gradients;
- like a task system demanding maintenance.

## Conceptual metaphor

The flaneur metaphor still matters, but it should govern **behavior and point of view**, not visual costume.

A flaneur notices, wanders, returns, sees adjacency, and gradually understands a place through repeated encounters. That maps directly to the product's behavior:

**notice → save → forget → need → resurface → connect**

The metaphor earns a small vocabulary:

- **Street** — the main surface where the user asks their trail and follows what appears;
- **Walk** — a finite resurfacing sequence;
- **Atlas** — the shape of accumulated attention;
- **Correspondence** — a meaningful relationship noticed between separate encounters.

Everything else uses plain product language. Do not rename ordinary UI controls for atmosphere.

## Visual direction

The previous parchment / terracotta / aged-map direction should be retired. It over-literalizes the historical metaphor and risks making the product feel nostalgic rather than contemporary.

The updated art direction is **ink-led editorial modernism**.

### Palette

The system is built from four roles rather than decorative color:

| Token | Direction | Use |
| --- | --- | --- |
| `paper` | warm off-white / very light neutral | primary reading surfaces, large fields |
| `ink` | near-black | primary type, structural rules, icons |
| `ink-blue` | deep blue-black | system interpretation, active intellectual structure, selected states |
| `signal-red` | restrained red | user's own emphasis, moments of live relevance, rare attention signals |

Black, ink blue, and red are the identity colors. The interface should still have enough pale negative space to remain readable and calm.

Do not spread red across generic controls. It should mean **this matters now** or **this mark came from the user**. Ink blue can carry system intelligence and inferred structure more often, but should remain dark and restrained rather than becoming a bright SaaS accent.

Exact hex values remain open until contrast testing and visual prototyping.

### Typography

Typography is the main visual system.

Use a strong editorial hierarchy with a limited family set:

- one expressive display/editorial face for large titles, names, and conceptual statements;
- one highly legible text/UI face for facts, body copy, controls, and dense evidence;
- optional italic or alternate style within the family for user-authored notes rather than a literal handwriting font.

The earlier handwriting-adjacent typeface should not be a default requirement. It can make the interface feel scrapbook-like and may become illegible at scale. The distinction between user / source / inference should be made through a coordinated system of type, labels, color, and provenance — not through handwriting alone.

### Composition

The interface should feel assembled rather than tiled.

Prefer:

- large fields of whitespace;
- strong vertical rhythm;
- offset columns;
- editorial captions;
- thin rules;
- carefully placed metadata;
- controlled overlaps or cropped media where useful;
- individual objects with distinct hierarchy rather than repetitive cards.

Avoid:

- equal-width dashboard grids;
- dense card mosaics;
- floating glass panels;
- pill overload;
- gradients used as generic AI decoration;
- excessive rounded rectangles;
- fake paper tears, deckled edges, or faux aged texture.

### Texture

Texture should come from typography, line work, captured source fragments, screenshots, images, and subtle noise — not literal parchment simulation.

A very light grain is acceptable if it survives at normal viewing scale without reading as an effect.

### Iconography

Use simple, precise line icons or typographic controls. Do not force hand-drawn icons to support the metaphor.

The brand can contain one or two distinctive wayfinding marks, but ordinary controls should remain familiar.

## Truth and provenance system

Flaneur's interface must visually distinguish four kinds of information:

1. **User** — what the user wrote or explicitly confirmed.
2. **Source** — what the captured material explicitly states.
3. **Extracted** — structured data Flaneur parsed from that source.
4. **Inferred** — an interpretation generated by Flaneur.

This distinction is a core design problem, not metadata relegated to an info drawer.

Recommended direction:

- user observations receive the strongest personal emphasis, potentially signal red or a distinctive text treatment;
- source facts remain neutral and structurally quiet;
- extracted structure uses the normal system style;
- inferred observations use ink blue and an unobtrusive `inferred` cue;
- every generated synthesis exposes its supporting sources on demand and important claims may show provenance inline.

The interface should never make an AI inference look identical to a fact copied from a source.

## Pacing and motion

The product should feel deliberate, but not deliberately slow.

The previous rule that major navigation should be 350–500ms to evoke walking is too prescriptive. Motion should now follow meaning:

### Tier 1 — utility

Capture, search, filter changes, source opening, editing, and basic navigation.

- fast;
- approximately 120–220ms;
- no theatrical easing;
- immediate feedback.

### Tier 2 — spatial continuity

Moving between related objects: Street → Person, Person → Concept, Concept → Artifact.

- approximately 220–380ms;
- soft ease-out;
- preserve visual continuity where possible;
- shared-element transitions are welcome when they clarify relationship.

### Tier 3 — discovery

Reserved for meaningful resurfacing or correspondence.

- approximately 500–900ms where warranted;
- should reveal a relationship, not decorate a transition;
- use sparingly enough that discovery still feels earned.

Reduced-motion equivalents are required for every tier.

## Information architecture

The primary product architecture becomes:

1. **Street** — home / ask your trail.
2. **Person** — memory of a person.
3. **Concept** — how an idea appears across the user's trail.
4. **Walk** — finite resurfacing.
5. **Atlas** — shape of attention, useful only after enough data exists.
6. **Capture** — lightweight browser overlay / extension.

Relationship status is subordinate to Person rather than a primary section.

## Screen specifications

### 1. Street — primary home

The Street is the clearest expression of the updated product.

It opens with a quiet query surface, not a chatbot transcript.

Primary prompt direction:

**What are you trying to remember, find, or think through?**

The page can support three response modes without exposing tabs:

- **Recall** — "Who was that person…?"
- **Resurface** — "I'm working on X. What have I already found?"
- **Reflect** — "What patterns do you see across…?"

#### Response composition

Do not return a long AI paragraph followed by links.

A strong response is assembled from evidence:

- one concise answer or observation;
- people / artifacts / concepts displayed as primary objects;
- the user's original note or reason for noticing;
- visible source fragments;
- inferred relationships distinguished from facts;
- optional follow-up paths.

The visual form should make the answer feel **reconstructed from the user's own trail**.

#### Empty state

Before substantial data exists, the Street should teach the product through real examples rather than metaphorical emptiness.

Example:

> Save a few people or posts. Then ask things like “who was that mechanical engineer who moved into AI?”

Avoid an empty map as the first product experience; the value proposition is recall, not cartography.

### 2. Capture

Capture is the fastest surface in the system and should have almost no visual ceremony.

Elements:

- source preview / identity;
- **Save**;
- optional field: **What caught your attention?**

After saving:

- instant confirmation;
- inferred entities and background processing do not block dismissal;
- if Flaneur suggests a reason for noticing, it can appear later for confirmation rather than forcing an extra capture step.

Do not ask the user to tag, categorize, choose a district, or clean the graph during capture.

### 3. Person — memory of a person

The Person page is not a profile page.

Primary question:

**Why is this person in my world?**

Recommended page hierarchy:

#### Identity

Name, current role, organization, location if relevant. Keep this compact.

#### Why you noticed them

The strongest memory cue. Prefer the user's own note; otherwise show a clearly marked inferred summary.

#### Encounters

A chronological trail showing when the person appeared in the user's attention:

- saved profile;
- saved a post;
- noticed a project;
- surfaced again because of current work;
- contacted, if applicable.

This history should feel like evidence of attention, not activity logging.

#### Trajectory

Show education and work as a legible path, emphasizing meaningful transitions rather than dumping every job field.

Example:

Mechanical Engineering → Computational Design → Machine Learning → Founder

The visual can be linear or editorial; it does not need a literal road metaphor.

#### Work and ideas

Saved artifacts and the concepts associated with them.

#### Correspondences

Examples:

- "Three other people you've saved made a similar engineering → computation transition."
- "Their WebGPU work intersects with your recent 3D interaction research."

These must expose evidence and confidence.

### 4. Concept

A Concept page answers:

**How has this idea appeared across what I've noticed?**

It should show:

- the people through whom the concept entered the collection;
- relevant artifacts;
- the user's observations;
- adjacent concepts;
- a time dimension where useful;
- cross-disciplinary appearances;
- current relevance.

Avoid turning Concepts into folders with counts.

### 5. Walk

The Walk is a finite sequence of **three stops**.

It is not the home screen and not a review queue.

Each stop should have an explicit reason for appearing when possible:

- "You saved this eight months ago. It relates closely to what you've been exploring this week."
- "You encountered this person twice, through different projects."
- "This old post connects two themes that have recently converged in your collection."

The Walk should feel complete after the third stop.

Interactions:

- open / linger;
- keep;
- dismiss or reduce future resurfacing;
- contact when appropriate.

Metaphorical action labels such as `say hello` or `keep walking` can survive where naturally understood, but should not force every item into a four-state spaced-repetition grammar.

### 6. Atlas

Atlas visualizes the **shape of attention**, not the graph database.

At the highest level, show meaningful territories such as:

- disciplines;
- recurring concepts;
- trajectories;
- organizations/schools;
- places;
- emergent clusters.

A user should be able to answer "what have I been drawn to?" without interpreting a force-directed graph.

Possible visual directions:

- editorial map fields;
- labeled regions;
- density/constellation patterns;
- layered indexes;
- zoomable semantic territories.

Avoid literal antique maps and data-viz hairballs.

### 7. Correspondence

Correspondence is a pattern that appears across screens, not a destination that depends on Atlas.

Visual treatment should make a relationship legible in context:

- two trajectories aligned;
- a thin connection between objects;
- repeated concept labels across sources;
- evidence excerpts placed in parallel;
- a brief system observation in ink blue.

The earlier "ink line drawing between districts" can remain one Atlas expression, but correspondence must work even when no map exists.

### 8. Onboarding

Onboarding should establish usefulness quickly.

Sequence:

1. One-sentence promise: **Remember what caught your attention.**
2. Install / enable capture.
3. Save the first real person or post.
4. Show what Flaneur extracted and what came directly from the source.
5. Prompt one immediate query about the saved item.

The goal is to reach a real recall interaction quickly, not to explain the full flaneur metaphor.

### 9. Settings and data controls

Settings stay plain and functional.

Essential controls:

- data export;
- source permissions;
- deletion;
- inference controls where practical;
- capture adapters;
- model/provider disclosure if relevant;
- reduced motion;
- accessibility;
- privacy/security.

No metaphorical names for these surfaces.

## Responsive behavior

Desktop is the primary deep-use environment for Street, Person, Concept, and Atlas.

The browser extension handles capture in context.

Mobile/tablet should prioritize:

- quick recall;
- Person reading;
- Walk;
- captured-item review;
- share-sheet capture if supported.

Do not simply collapse desktop Atlas into a tiny mobile graph.

## Accessibility

### Contrast

All palette combinations must meet WCAG AA for their actual usage. Signal red and ink blue must not rely on hue alone to communicate provenance or state.

### Motion

Every discovery animation has a reduced-motion equivalent that preserves the information relationship without movement.

### Keyboard and screen reader

Street results, evidence groups, source links, Person encounters, and Walk controls must all be fully keyboard navigable and have coherent reading order.

### Non-color provenance

User/source/inferred states require text labels, icons, or typographic differences in addition to color.

## Content and voice

Flaneur speaks observationally and precisely.

Prefer:

- "You saved this when you were looking at 3D interaction."
- "These three people share a similar transition from engineering into computational work."
- "This may be related to your recent WebGPU research."

Avoid:

- "We discovered an amazing connection!"
- "Your network is growing."
- "You have 17 items waiting."
- generic AI phrasing such as "Based on your knowledge base…"
- over-poetic street metaphors in errors and settings.

Uncertainty should be explicit:

- "This appears to be the same person."
- "Flaneur inferred this from the captured profile."
- "Possible correspondence."

## Design principles by priority

1. **Make memory cues visible.** Why the user noticed something matters more than generic metadata.
2. **Show evidence, not AI authority.** Answers should feel reconstructed from sources.
3. **Keep people human.** A person is a history of encounters and trajectory, not a contact card.
4. **Make intelligence quiet.** Avoid AI decoration and chatbot conventions.
5. **Preserve finiteness.** No infinite feed, no backlog pressure.
6. **Let the graph remain mostly invisible.** Use it to improve screens rather than demanding graph navigation.
7. **Use the metaphor structurally, not cosmetically.** Contemporary product first, literary reference second.

## Immediate design priorities

Design and prototype in this order:

1. **Street — Recall result** using a half-remembered-person query.
2. **Street — Resurface result** using a current-project query such as 3D interaction.
3. **Person** with reason-for-noticing, encounters, trajectory, and correspondence.
4. **Capture overlay** with optional reason for noticing.
5. **Concept** page.
6. **Three-stop Walk.**
7. **Atlas** only after the object-level language is stable.

The most important prototype test is not whether the interface looks beautiful. It is whether someone can look at a result and immediately understand:

- why this appeared;
- what came from the source;
- what they themselves noticed;
- what Flaneur inferred;
- where to go next.

## Handoff note

Treat the current moodboard/style work — black, ink blue, restrained red, strong editorial typography, and contemporary asymmetry — as the visual foundation. The older parchment, terracotta, aged-map, handwriting, and deckled-paper prescriptions are superseded by this brief.

The spirit of the old design remains useful: unhurried observation, no guilt, finite discovery, and restraint. The literal historical styling does not.
