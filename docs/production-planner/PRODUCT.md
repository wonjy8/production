# Production Planner — Product Constitution

## Purpose
Production Planner is a production command center that makes a shoot understandable at a glance and keeps schedule, content, people, equipment, camera setup, references, and scripts connected.

The product is not a generic project-management tool. It is optimized for planning a production and operating it on the shooting day.

## Primary product promise
A user should be able to open a production and answer three questions in seconds:
1. What are we shooting and when?
2. Is everything ready?
3. What do I need right now?

## Core principles
### 1. Schedule is the primary surface
The schedule is the fastest route into the production. A schedule item opens its content context; users should not have to visit several management pages to understand one shoot.

### 2. Content is the context hub
A content item gathers its script, cast, crew, location, camera setup, equipment and references in one contextual view.

### 3. Information is connected, never duplicated
Register a member or equipment item once, then reference it everywhere. Ownership, assignment and usage are relationships, not copied strings.

### 4. Planning mode and Shoot Mode are different
Planning favors overview and editing. Shoot Mode favors NOW/NEXT, large touch targets, camera/reference/script access and minimal cognitive load.

### 5. Progressive disclosure
Show summary first. Reveal details only when they are needed. Dense information must not become a dense interface.

### 6. AI complements direct manipulation
Frequent/simple actions stay in UI. Complex, cross-module or infrequent actions may be requested conversationally. AI changes must be inspectable and reversible.

## V0.1 scope
- Home / readiness overview
- Schedule
- Content detail
- Embedded script file + original download
- Members
- Equipment with owner and day-of assignee separated
- Camera layout and camera setup
- Reference boards linked to cameras
- Mobile Shoot Mode
- Foundation for conversational/MCP actions

## Explicitly out of V0.1
- Shot list (current workflow is primarily continuous/one-take)
- Full post-production workflow
- Messaging
- Full accounting suite
- Advanced rental-vendor management

## Product test
Before adding a feature ask:
- Does this reduce uncertainty before or during a shoot?
- Can the same goal be reached with less navigation or less data entry?
- Does it preserve the connected data model?
- Is it understandable on a phone at the shooting location?

If the answer is no, do not add the feature yet.
