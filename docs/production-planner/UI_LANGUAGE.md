# Production Planner — UI Language

This document is the visual and interaction contract for Production Planner. New UI must reuse this language instead of inventing local styles.

## Experience words
**Glanceable · Calm · Contextual · Connected · Shoot-friendly**

## Hierarchy
1. Current state / next action
2. Essential production information
3. Supporting detail
4. Management metadata

A screen should not make all four levels visually equal.

## Shape language
The primary shape is a **squircle / continuous curve**.

Use the shared `Squircle` primitive for cards, controls, thumbnails, sheets and modal surfaces whenever practical. Do not scatter arbitrary `border-radius` values through feature code.

Shape tokens:
- `control`: compact buttons, inputs, badges
- `surface`: cards, rows, image tiles
- `panel`: sheets, dialogs, large inspectors
- `hero`: large media and major project surfaces

If native continuous-corner rendering is unavailable, the shared primitive owns the fallback. Features must not implement their own approximation.

## Spacing
Use only spacing tokens. Default rhythm is based on 4px increments, with 8/12/16/24/32 as the common working set.

Prefer whitespace over divider lines. A divider is used only when spacing cannot communicate grouping.

## Typography
Use semantic roles, not page-specific sizes:
- `display`: project/content identity
- `title`: section/page title
- `body`: primary readable information
- `label`: controls and metadata labels
- `meta`: secondary supporting information

Important information should be expressed through hierarchy before color.

## Color
The base interface is neutral. Color communicates state or a single primary action.

Semantic states:
- `ready`: complete / secured
- `attention`: needs confirmation
- `danger`: blocks or threatens the shoot
- `info`: neutral active context

Never communicate state by color alone. Pair it with text and/or an icon.

Reserve danger/red for genuine blocking or destructive conditions.

## Status vocabulary
Prefer a small shared vocabulary:
- 준비 완료
- 확인 필요
- 문제 있음
- 미정

Equipment/rental may extend this with domain states such as `대여 필요`, `예약`, `픽업 완료`, `반납 완료`.

## Interaction
### Primary action
Prefer one obvious primary action per context.

### Direct before conversational
Common operations should remain directly tappable/clickable. AI is for cross-context changes, natural-language requests and assistance—not as a replacement for every control.

### Context preservation
Do not send users to another module when a small contextual surface can complete the task. Example: Camera → Reference preview should open inside camera context rather than navigating to the Reference management page.

### Progressive disclosure
Collapsed state communicates summary. Expanded state communicates details. Avoid exposing database-shaped forms by default.

### Mobile / Shoot Mode
- Large touch targets
- NOW and NEXT dominate hierarchy
- No hover-only behavior
- Script and reference access within one or two actions
- Avoid dense tables

## Component rule
Pages and features compose shared components. They do not own visual primitives.

Allowed hierarchy:
`design tokens → primitives → patterns → features → pages`

A feature may create a new pattern only when existing patterns cannot express its recurring domain interaction.

## Change rule
A global visual change must have one source of truth. Examples:
- Button appearance → shared Button primitive
- Squircle curvature → shape tokens / Squircle primitive
- Status appearance → shared StatusBadge
- Spacing rhythm → tokens

Do not solve a global change by editing individual screens.
