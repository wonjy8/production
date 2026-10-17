# Production Planner — Architecture

## Information architecture

```text
Workspace
└─ Production
   ├─ Home / Overview
   ├─ Schedule
   ├─ Content
   ├─ Camera Layout
   ├─ References
   ├─ Members
   ├─ Equipment
   └─ Budget (later / lightweight initially)
```

`Content` is the contextual production unit. `Schedule` is the primary navigation surface into content.

## Domain relationships

```text
Production
├─ ScheduleItem ───────→ Content
├─ Content
│  ├─ ScriptFile[]
│  ├─ CastMember[] ────→ Person
│  ├─ CrewAssignment[] → Person
│  ├─ CameraSetup[] ───→ CameraPosition
│  ├─ EquipmentUse[] ──→ Equipment
│  └─ ReferenceLink[] ─→ ReferenceGroup
├─ Person
│  └─ owns ────────────→ Equipment
├─ Equipment
│  ├─ owner
│  └─ dayOfAssignee
└─ ReferenceGroup
   └─ ReferenceImage[]
```

Ownership and day-of responsibility are different fields. A lens can belong to one member and be assigned to another member for a shoot.

## Script model
Scripts are file-first, not editor-first.
- Preserve original upload for download.
- PDF is the preferred embedded preview format.
- Non-PDF originals may later receive a generated preview representation.
- Versions are append-only by default; uploading a new version should not destroy the previous version.

## Reference model
A `ReferenceGroup` is user-named (e.g. 바스트샷, 투샷, 사이드) and contains ordered images plus optional notes.

References can be reused across content. A camera setup can link one or more reference groups. Camera detail must preview those references without leaving the camera context.

## Camera model
Camera placement is saved per content because the same location can have different setups for different content.

A setup may reference:
- position / label (CAM A)
- operator
- camera body
- lens
- support
- audio where relevant
- framing label
- reference groups

## Code architecture

```text
production-planner/
├─ design-system/
│  ├─ tokens
│  ├─ Squircle
│  └─ primitives
├─ patterns/
│  ├─ ScheduleRow
│  ├─ StatusBadge
│  ├─ CameraCard
│  ├─ MemberCard
│  ├─ GearRow
│  ├─ ReferenceGrid
│  └─ ScriptFileCard
├─ features/
│  ├─ overview
│  ├─ schedule
│  ├─ content
│  ├─ camera
│  ├─ references
│  ├─ members
│  ├─ equipment
│  ├─ scripts
│  └─ assistant
└─ pages/
```

Dependency direction is one-way:
`tokens → primitives → patterns → features → pages`

Lower layers must not import higher layers.

## Reuse rules
1. No feature-local button/card/badge styling when a shared primitive exists.
2. No raw semantic colors in feature modules; use tokens.
3. No arbitrary radii in feature modules; use Squircle/shape tokens.
4. Domain-specific repeated UI becomes a pattern.
5. A page orchestrates features; it should contain little domain logic.
6. Domain relationships live in data/models, not duplicated in component state.

## AI/MCP boundary
The UI and domain model must work without AI. AI/MCP actions operate on the same domain operations as direct UI interactions.

Examples:
- `updateScheduleItem`
- `assignEquipment`
- `setEquipmentOwner`
- `assignCameraOperator`
- `linkCameraReference`
- `attachScriptVersion`

This prevents conversational actions from becoming a separate application architecture.

## Change safety
Cross-entity changes should be capable of returning an impact summary before/after mutation. Important AI-driven changes should be reversible where practical.
