# Task 6 report — private couple onboarding

## Status

Completed the web identity, onboarding, invitation, profile, and home-route gate work.

## Delivered

- Protected server bootstrap reads the asynchronous session cookie, calls the Render backend directly, validates `bootstrapSchema`, and classifies visitors as `anonymous`, `needs-space`, or `ready`.
- Added `/entrar`, `/comecar`, `/convite`, and `/perfil` using the existing warm editorial visual system.
- Added Google sign-in, create-space, invite generate/copy/regenerate, fragment-token preservation and acceptance, leave-space confirmation, and logout flows.
- Updated the app shell to present authenticated user and space data, with the profile control linked to `/perfil` while retaining the four primary product destinations.
- Added component, bootstrap, and home-gate coverage for the required success and error states.

## Verification

- `npm --workspace @juntos/web test` — 18 files, 82 tests passing
- `npm --workspace @juntos/web run lint` — passing
- `npm --workspace @juntos/web run typecheck` — passing
- `npm --workspace @juntos/web run build` — passing
- `git diff --check` — passing

## Constraint noted

The existing bootstrap contract exposes the authenticated person and a member count, not the other member’s identity. The profile therefore renders the authenticated person’s real name/avatar/email and a truthful joined/waiting state without fabricating a second profile.
