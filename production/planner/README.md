# Production Planner

Before implementing or reviewing this area, read in order:

1. `../../docs/production-planner/PRODUCT.md`
2. `../../docs/production-planner/UI_LANGUAGE.md`
3. `../../docs/production-planner/ARCHITECTURE.md`
4. `../../docs/production-planner/FEATURES.md`

## Implementation contract
- Reuse the design system before creating new visual code.
- Keep dependency direction: tokens → primitives → patterns → features → pages.
- Use `Squircle`/shape tokens; do not introduce feature-local corner radii.
- Use semantic status components/tokens; do not scatter status colors.
- Model relationships once and reference them instead of duplicating data.
- Preserve content context: script/reference/camera details should be reachable without unnecessary module navigation.
- Build Shoot Mode touch-first and mobile-first.
- AI/MCP operations must call the same domain operations used by direct UI.

## First implementation sequence
1. Design-system primitives
2. Domain types and sample production data
3. Schedule + Content Detail
4. Script file preview/download surface
5. Members + Equipment ownership/assignment
6. Camera layout + Reference linking
7. Home readiness overview
8. Mobile Shoot Mode
9. Conversational/MCP mutation layer
