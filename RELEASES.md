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

## 0.0.1

- Refine catalog, account, sidebar, overview width, and reference heading layouts.
- Remove red from selectable accents; use red for account logout/withdrawal actions.
- Move completion archive access to the materials sidebar.
- Add multi-item trash selection, restore, permanent deletion, and 30-day retention.
- NAS update: replace `server.py` and `access.py` and rebuild the existing container; `.env` changes are not required.

## 0.0.2

- Add responsive Home screens for all tasks, schedules and projects, with clickable summary cards and sidebar task/schedule navigation; remove the Home project filter.
- Unify workspace/sidebar spacing, expand work-group layouts, and simplify the sidebar project add button.
- Edit custom team roles inline with Enter/blur commit.
- Resize timetable event endpoints by dragging; show details on click.
- Add keyboard AM/PM time input, five-minute stepping, mobile time wheels, current-time defaults and date interval preservation; show schedule notes in list modules.
- Import modules as independent snapshots, including file copies; save back to the origin only through a blue two-step confirmation. Convert legacy linked placements to snapshots when editable.
- Use red for destructive actions and deletion confirmations.
- NAS configuration and server files do not change in this release.

## 0.0.3

- Restore the complete pinned WordCraft editor as the default DOCX editor after the simpler editor replacement removed its full menus and tools.
- Connect document opening and automatic DOCX saving to the existing file API, preserving version conflict protection and local recovery copies.
- Keep the simpler editor as an explicit alternative and retain TXT/HTML editing.
- Add a Documents section in Materials with project/reference folders, filename and folder search, and direct document-editor links.
- NAS configuration and server files do not change in this release.

## 0.0.4

- Align timed and all-day Home schedule titles in one shared column; keep all four mobile navigation buttons inside the bar.
- Add app-styled, touch-sized document controls while preserving the original complete tools. Provide mobile reflow, full-tool horizontal navigation and keyboard-aware editor height.
- Load document editing separately from the main app; load the simpler editor only when selected or needed for TXT/HTML.
- Transfer the verified engine as gzip (39,322,422 to 14,701,908 bytes) and reuse its persistent cache. Upstream files and checksum pins stay unchanged.
- NAS configuration and server files do not change in this release.

## 0.0.5

- Replace the startup NAS connection notice with a general app loading message.
- Center icon-only workspace navigation when its selected label cannot fit; keep inactive sidebar areas hidden across workspace changes.
- Open the complete Home schedule timeline at today, with past schedules available by scrolling upward.
- Show full document formatting, table, page layout and review tools by default. Remove the manual save button and add explicit Word and engine-rendered PDF exports.
- Stop original-file autosaving if an export drops custom XML, embedded objects, macro or signature package parts; keep the edited recovery copy available. This does not establish complete Microsoft Word fidelity.
- NAS configuration and server files do not change in this release.

## 0.0.6

- Add an independent resource catalog in SQLite and browser IndexedDB. Register existing and newly placed files, images, links and text notes without moving file bytes or rewriting project/reference content.
- Keep catalog metadata separate from placements; retain registered originals when a project/reference/module connection is removed. Enforce existing visibility/edit permissions and version checks on metadata updates.
- Add Materials → Resource DB, including document creation, file uploads, search, property editing, classification filters, table/board views and document-library integration.
- Add Database and Sermon Notes modules. New entries are real DOCX files opened in the document editor; support worship/QT/club classifications, date/place/speaker/scripture and custom text properties.
- Existing-resource connections share the original; explicit copy creates an independent file. Database module copies retain current property values and labels.
- NAS update required: replace `server.py`, `schema.sql`, `Dockerfile`, and add `resources.py`; rebuild the existing container. Keep `.env` and `data` unchanged. See `nas/UPDATE-0.0.6.md`.

## 0.0.7

- Replace WordCraft and its downloaded WASM engine with the independent document editor; retain legacy document modules and unsaved draft recovery.
- Restore common document tools: fonts, page margins, comments, tables including merged cells, images, links and DOCX export with original package parts preserved.
- Export PDF directly from the visible editor layout, without browser printing. Lossless image PDF uses one continuous page; text is not selectable.
- Load document creation and PDF codecs only when requested; deduplicate shared UI sources during build.
- NAS files and container configuration: unchanged from 0.0.6.
