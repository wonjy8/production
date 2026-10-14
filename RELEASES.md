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
