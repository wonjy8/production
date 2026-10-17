# Production Planner — Feature Specifications

Every feature starts with a reason. Implementation must preserve the reason even when a shortcut is technically easier.

## Home / Overview
**Why:** Answer what is happening, what is ready and what needs attention without opening modules.

Show production identity, date/time/location, readiness summary, meaningful warnings and today's/next schedule. Readiness is derived from connected data rather than manually typed percentages.

## Schedule
**Why:** The production day is the user's primary mental model.

A schedule row communicates time, content, location and readiness. Opening it enters content context. Avoid calendar complexity when a shooting-day timeline communicates the job better.

## Content Detail
**Why:** A user should understand one shoot without module-hopping.

Summary-first sections:
- script
- cast
- crew
- camera setup
- references
- equipment
- readiness

Management modules still exist for global editing, but content detail is the operational view.

## Script Files
**Why:** Teams commonly already have a source script document. The app should make it immediately accessible rather than force re-entry.

Flow: Content → Script card → embedded preview → optional fullscreen → original download.

Keep version history. PDF is the primary preview format.

## Members
**Why:** Understand who is participating, their role, call time, owned gear and day-of responsibility.

A member profile distinguishes `owned equipment` from `assigned equipment`.

## Equipment
**Why:** Prevent missing equipment and clarify ownership/responsibility.

Minimum concepts:
- item
- category
- owner type/member
- availability/status
- day-of assignee
- usage / camera setup

Never collapse owner and assignee into one field.

## Camera Layout
**Why:** Communicate physical setup and responsibility faster than prose.

Camera markers sit on a location/floor-plan context. Selecting a camera opens an inspector with operator, body, lens, support, framing and linked references.

Camera layouts are content-specific and can later support copying from another content item.

## References
**Why:** Communicate the intended image directly and visually.

Users create named reference groups and add ordered images. Reference management is gallery-first, not table-first.

Critical flow: Camera → linked reference preview → image viewer. Do not force navigation to the Reference module for viewing.

## Shoot Mode
**Why:** On set, speed and certainty matter more than management depth.

Prioritize:
- NOW
- NEXT
- current camera assignment
- references
- script
- readiness/blocker

Design mobile-first and touch-first.

## Assistant / Conversational Editing
**Why:** Reduce friction for cross-module changes and questions.

Good uses:
- reschedule and inspect conflicts
- reassign camera/member/equipment
- ask what is not ready
- connect existing entities

Direct UI remains available for common operations. AI mutations use the same domain commands as UI mutations and should expose impact/reversal for meaningful changes.
