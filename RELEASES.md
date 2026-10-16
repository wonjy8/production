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

## 0.0.8

- Replace image-only PDF with selectable, searchable vector text and embedded Korean/Latin fonts, using the editor's measured positions without browser printing.
- Add shared on-screen/PDF pagination, A4/A5/Letter/custom paper sizes, margins, landscape and zoom; preserve original DOCX packages and image dimensions.
- Persist editable document titles; consolidate exports and organize file/edit/insert/format/view menus and icon toolbar with mobile horizontal scrolling.
- Restore masonry resource browsing alongside list/board views, rename 자료 DB to 자료, add type tabs and a sidebar document-editor shortcut, and align folder/file row heights.
- Default home to today; limit schedule previews to five unended events and separate today's complete schedule group with rules.
- NAS files and configuration: unchanged from 0.0.6.

## 0.0.9

- Replace the file/edit/insert/format/view menu bar with compact, grouped tools and a right settings drawer for pages, comments, fonts and view controls.
- Left-align export choices; mirror undo/redo icons, label ambiguous tools, provide control titles, and consolidate comments and save status.
- Add a pencil beside the editable document title and match editor chrome to the application's system font.
- Manage TTF/OTF fonts from app settings or the document editor, storing them through the existing authorized resource/file API. Load only used faces and embed the selected font in searchable PDFs.
- Recalculate pagination when zoom, drawer width, images or fonts change, including mobile PDF page boundaries.
- NAS files and configuration: unchanged; existing 0.0.6+ resource APIs are reused.

## 0.0.10

- Keep only undo/redo and insertion actions in the toolbar; remove the new-document and font-management shortcuts and neutralize export styling.
- Use exactly mirrored undo/redo paths and reorganize the right drawer into Document, Properties and Settings.
- Show text formatting, table actions and image dimensions according to the selected content; keep page settings and editor preferences separate.
- Insert independent image copies from the existing authorized Materials library with search and previews, including conversion to DOCX/PDF-compatible image formats.
- NAS files and configuration: unchanged.

## 0.0.11

- Serve authorized 640px WebP image thumbnails from a bounded, lazy NAS cache without changing originals. Limit concurrent generation and reject unsupported images without downloading originals as a fallback.
- Persist derived thumbnails on devices with account/connection/content-hash isolation, a 64MB/400-item limit and automatic expiry. Browser-local mode generates them from local files.
- Reuse the thumbnail pipeline in Materials, reference covers, image modules and the editor image picker; defer loading outside the viewport and use file-type icons for video list covers.
- Fetch originals for explicit details, editing, downloads and document insertion. Bound decoded-image memory and keep source/thumbnail caches separate.
- NAS update: replace server.py, browser_gateway.py and requirements.txt; rebuild the container to install Pillow 12.2.0. No .env or database schema changes.

## 0.0.12

- Simplify Materials navigation, rename All Materials, hide sidebar tags and rename classification to tabs. Display archives as a full workspace page.
- Add one tabbed trash browser for references, portfolios, sources, documents, resources and archives, with selection, restore and confirmed permanent removal. Resource tombstones prevent rediscovery; only unreferenced original files are removed, with 30-day resource retention.
- Split members from equipment views, show inventory owners only in Equipment, add owner selection and member-to-equipment links, and filter members by account registration. Preserve inventory during member profile changes.
- Fold completed/elapsed schedules on Home, allow reopening, reveal past history only on upward scrolling, remove sidebar task/schedule shortcuts, and add Home subpage breadcrumbs.
- Add independent task flags retained in the weekly list until completion and correct the assignee toggle.
- Add segmented desktop AM/PM/hour/minute controls, 24-hour input normalization, arrow stepping and a cyclic start/end Tab order; retain mobile time wheels.
- NAS update: replace resources.py and rebuild the existing container. No schema or environment-variable changes.

## 0.0.13

- Rebuild document chrome around a floating, animated Document/Properties/Settings drawer, contextual controls, compact insertion toolbar, heading outline and page/word/zoom status bar.
- Move PDF/Word exports to Document; add margin markers, HEX color controls, text highlights, subscript/superscript, bullet/number variants and list indentation.
- Add anchored table-size selection, device/library images, PNG-backed shapes, file attachments that open on click, and contextual image/shape/table alignment.
- Add repeated header/footer/page-number fields with native DOCX relationships and selectable PDF text, preserving existing untouched Word parts. Retain nested list styles, text marks and object placement through DOCX round trips.
- Add confirmed document trash in Settings and a dismissible editor update prompt using the save-before-update coordinator; retain native unsaved-exit warnings and recovery drafts.
- NAS files, schema and configuration: unchanged from 0.0.12.

## 0.0.14

- Reveal contextual removal icons on row/card hover or within pointer proximity; retain keyboard focus, open confirmation and touch access. Apply shared behavior to modules, schedules, tasks, members and other item removal controls; keep dialog close and labeled destructive actions visible.
- Measure intrinsic module heights even when fixed, update automatic layout as content changes, and magnetically return to content height with hysteresis during pointer or keyboard resizing. Manual heights persist until reset; double-click/Home also restores automatic height.
- Preserve independent neighboring sizes, snapped responsive width layout and drag cancellation. Coalesce content/resize observation and removal proximity work into animation frames.
- NAS files, database schema and configuration: unchanged.

## 0.0.15

- Reserve a fixed header for Document/Properties tabs in the floating editor panel, animate canvas movement, use a hamburger toggle and remove Settings and page-furniture insertion controls.
- Group paragraph and character properties; add icon alignment, line spacing, paragraph spacing, first-line/hanging indentation and DOCX round-trip support. Keep Word normal margins (25.4mm).
- Add split bullet/number style controls and keyboard nesting up to five levels; show outline lines only for nonempty headings. Keep insertion menus above the canvas.
- Reveal list removal controls only on their row hover, retaining keyboard and touch access; use red hover emphasis for member and other removal controls. Preserve module proximity reveal.
- NAS files, database schema and configuration: unchanged.

## 0.0.16

- Add reusable section headings, grouped lists, progress tables, information cards and assignment modules with responsive card/table views, custom fields, arbitrary labels and groups.
- Connect existing teams, members, equipment, resources and schedules; group assignments by real teams and scope member choices accordingly, without fixed A/B concepts. Resource links load metadata until opened.
- Share record data between views in the same tab while preserving per-view presentation; materialize snapshots when disconnecting, deleting a data owner, importing or reusing archived candidates.
- Add editable filming, event, lesson and travel tab templates with unique data IDs, shared list/progress records and independent copies between instances. Include new module kinds in search and Hub.
- NAS files, database schema and configuration: unchanged.

## 0.0.17

- Make the project status All filter include completed projects; show all projects in Home's project browser and total while explicitly labeling the overview's active-project section.
- Use generic resource defaults and add administrator-managed shared category/property settings through the existing workspace API. Add additive podcast, performance, video and photography presets without rewriting existing resource metadata.
- Search resource filenames, URLs and origin project/work-group names alongside titles, tags and properties. Give global and module empty states actionable, distinct instructions.
- Summarize outstanding work, feedback, selected outputs and required exception reasons before project completion. Preview selected archive modules, reuse mode and reset fields before reuse.
- NAS server files, database schema and configuration: unchanged. Shared resource preferences use the existing administrator workspace settings authorization.

## 0.0.18

- Use pointer-based module insertion guides for a single card, an entire row or adjacent placement. Persist independent column stacks and row boundaries, retain neighboring columns and coalesce drag updates per animation frame.
- Suppress additional card transitions while sidebar/container width animates; measure initial layout before paint and reuse unchanged packing calculations during dragging.
- Move modules between custom and built-in content tabs in projects and between reference tabs, highlighting the destination and opening it after an atomic move. Preserve shared-data snapshots, file identity, original placement metadata and undo history; enforce project tab edit permissions.
- Rename project and reference tabs on double-click using the existing editor.
- Install multiple TTF/OTF fonts sequentially with progress and per-file failures, continuing after invalid or duplicate files.
- Align imported media's Save to Original control with upload/tag actions at the right edge, retaining the blue confirmation and removing the separate footer gap.
- NAS files, database schema and configuration: unchanged.

## 0.0.19

- Add module-title context actions for renaming, tab transfer and confirmed deletion. Preserve pointer dragging while restoring context menu handling; use red deletion confirmation and neutral import/original-save controls.
- Keep Add Module accessible at the top while scrolling. Pin Blank Tab in Hub template results, group modules by reusable types and put specialized presets after general modules.
- Customize project, work-group and reference tab icons through the shared icon/emoji/photo picker, with persisted built-in and custom tab choices.
- Keep three fixed task parent groups (Not Started, In Progress, Completed) in list and board views. Add category-specific stages inside these groups in Settings, preserve existing stages, move checked tasks into Completed and support reopening and cross-group dragging.
- NAS files, database schema and configuration: unchanged.

## 0.0.20

- Add a monthly calendar to All Schedules with list/calendar switching, month navigation, today focus, past schedules and existing event detail/edit links. Remove the previous-history hint while retaining upward history reveal in the list.
- Add selection-based highlight insertion to the editor toolbar and use ten shared color presets (red, orange, yellow, green, blue, indigo, purple, brown, black, white) for text/highlight colors. Preserve selection, DOCX autosaving and highlight removal.
- Center the compact floating insertion toolbar, reserve its layout space, keep popovers above the canvas and fit the toolbar/preset palette on mobile.
- NAS files, database schema and configuration: unchanged.

## 0.0.21

- Add horizontal and vertical cm rulers to the document editor, with millimeter ticks, shaded margins and page boundaries. Match document zoom, fit, custom paper sizes and per-page vertical resets; keep the horizontal ruler visible while scrolling.
- Reserve a ruler gutter in fit-to-screen sizing, including mobile/sidebar resizing. Reuse SVG definitions across pages to bound ruler DOM cost.
- Keep rulers outside editable content, DOCX persistence and selectable-text PDF output.
- NAS files, database schema and configuration: unchanged.

## 0.0.22

- Restore the editor's full-width insertion toolbar and align the horizontal/vertical rulers with the viewport's top/left edges while retaining paper/zoom/scroll alignment.
- Share one paragraph/color/bold/italic/underline/link/more toolbar between Properties, automatic desktop text selection and mobile selection. Combine foreground/background presets with recent choices; keep precision controls in Properties.
- Add a keyboard-aware mobile input dock with insertion, formatting, image sources, undo/redo and keyboard dismissal; switch it to the same formatting controls on text selection.
- Limit the desktop context menu to Cut/Copy/Paste, preserve rich clipboard content and retain text when clipboard writes fail or the document changes during an asynchronous operation.
- Preserve Quote paragraph styles in DOCX save/reopen/removal and paint quote borders in selectable-text PDF export. Keep the underlying paginated document model and automatic saving.
- NAS files, database schema and configuration: unchanged.

## 0.0.23

- Simplify Hub: remove the introductory description and module descriptions, remove item borders, reduce icon/row sizes and prevent category labels from shrinking into each other.
- Combine bookmark, web embed and Figma creation under Link with bookmark/embed display choices; preserve existing embedded content.
- Fit workspace modules and photo grids immediately when toggling the sidebar, avoiding sequential container/content resize animations while retaining sidebar entry/exit motion.
- NAS files, database schema and configuration: unchanged.

## 0.0.24

- Compact the shared editor selection controls, color palette and sidebar buttons; keep mobile input touch targets usable.
- Center insertion toolbar controls and reserve a separate outline lane beside the vertical ruler.
- Arrange text properties as Text, Font and Paragraph, with consistent section spacing.
- Reveal editor scrollbars during interaction and hide their thumbs after one second of inactivity without changing layout.
- NAS configuration and server files do not change in this release.

## 0.0.25

- Compact Hub module rows from 80px to a 44px minimum with content-sized height; reduce row and group spacing while preserving template descriptions.
- NAS configuration and server files do not change in this release.

## 0.0.26

- Match tab add/hidden-tab actions at 32px, remove their borders and reveal them near the tab strip or on keyboard focus; keep them available on touch screens.
- Reduce overview bottom padding and omit empty status/date facts.
- Place task entry in the Not Started group in list and board views; collapse Completed by default and mute completed rows.
- Hide completed tasks in Home's all-task view; default all schedules to calendar and place an icon-only back action before Home detail headings.
- Allow schedule rows to grow with wrapped titles and notes and restore the missing circle icon.
- NAS configuration and server files do not change in this release.

## 0.0.27

- Use one page heading format across Settings, database lists, Materials, Home and project/work-group pages: 24px type, a 40px minimum row and 20px spacing below.
- Add the current collection title to database lists and remove duplicated inner padding from Materials so title and content positions align.
- NAS configuration and server files do not change in this release.


## 0.0.28

- Centralize UI language, styles, shared components, icon geometry and documentation in `ui/design-system/`.
- Apply Squircle button corners with a rounded-corner fallback, shared focus and motion rules, and common typography in document and shadow roots.
- Route React and DOM icons through the shared pack; use the common Button in Modal.
- Show the running release from `VERSION` in the sidebar and Settings → General; keep Pages release metadata in sync.
- NAS configuration, database and container files do not change in this release.


## 0.1.0

- Merge database navigation into Materials with a divider before Members, Equipment, Rental Shops and Locations. Preserve the existing data, APIs, permissions and editors.
- Move the unified trash to the bottom of the Materials sidebar and remove category/tag sub-navigation under References, Sources and Portfolios.
- Apply Squircle to all rounded UI corners, keeping existing radius sizes and browser fallback.
- Remove screen/tab entrance motion; keep interaction feedback and reduced-motion support.
- Mobile navigation now has Home, Materials and Settings. Legacy saved database starts resolve into Materials.
- NAS files, schema, settings and containers do not change in this release.


## 0.1.1

- Register original uploads immediately in the central Library catalog; projects keep file-ID connections. Register uncataloged legacy bytes without moving/copying files or replacing user metadata.
- Show resource usage, original-edit impact, and independent-copy actions. Shared documents require an original/copy choice before saving.
- Refuse trash/permanent deletion of in-use originals on the server and in browser storage, including hidden-tab use; preserve files after detaching project links.
- Record the agreed product policies and distinguish the next completion, sharing, permission-approval and template stages.
- NAS update: replace `resources.py` and `server.py` together, then run `sh update.sh` or rebuild/recreate the existing container. Preserve `.env` and `data/`; no schema, dependency or environment-variable changes. See `nas/UPDATE-0.1.1.md`.
