# Release and rollback policy

Current baseline: **version 0 (`0.0.0`)**, commit `b2fafdd`.

## Version increments

- Increment the patch number once per completed release to main: `0.0.1`, `0.0.2`, … `0.0.14`, with no automatic rollover.
- Increase the minor number only when the user explicitly requests “버전은 0.1단계 올리자” or an equivalent instruction. The first such release becomes `0.1.0`; subsequent patch releases become `0.1.1`, `0.1.2`, and so on.
- Update `VERSION` when preparing a release. This policy setup alone does not constitute version `0.0.1`.
- Create an annotated `vX.Y.Z` tag on each released commit and push the tag to origin.

## Branches and rollback

- `rollback/version-0` and tag `v0.0.0` preserve the initial main commit. Keep these references unchanged.
- Develop subsequent changes on a separate work branch; `release/0.0.1` is the first such branch. The user’s existing authorization to publish completed changes to main remains applicable.
- Preserve released commits using tags before moving to the next work branch.
- If a rollback is requested, restore the selected release through a new commit on main so that the Pages workflow deploys it and history is retained. Do not force-push main.
- Frontend rollback does not reverse NAS database migrations or restore deleted data. Report any NAS files or container rebuild steps needed for the selected release.

## NAS changes

Whenever NAS changes are needed, describe the exact files and paths, changes or replacement package, commands or Container Manager steps, rebuild/restart requirements, and verification in the chat. Do not merely say to update NAS.

## 0.1.14

- Preserve distinct member IDs and every imported row. Existing-member reuse is explicit; task pickers retain IDs for namesakes.
- Keep date-free projects in planning, show explicit ongoing status, advise on duplicate creation, and unify 160-character names / 2000-character notes with NAS validation. Team pickers have a fieldset/legend.
- Add optional structured event period, location, budget range, goals, lead, stakeholders and risks; search/filter and representative schedule synchronization preserve existing records.
- Add team and multi-person schedule/task assignments, individual call/end times and roles, daily call-sheet CSV, and overlap / under-60-minute rest review before saving, including calendar movement.
- Restore Accounting in the module hub and reuse existing modules. Compare planned, quoted, contracted and actual amounts; calculate VAT, split payments, overdue payments, actual balance and committed availability. Keep original evidence in the library. Invalid amount drafts never become zero.
- NAS baseline 0.1.12 (including web-only 0.1.13): replace access.py, README.md and UPDATE.md, then rebuild. Validate edited metadata and monetary values, hide denied overview planning, and narrowly synchronize schedule dates while retaining hidden planning fields. No schema or dependency changes.
