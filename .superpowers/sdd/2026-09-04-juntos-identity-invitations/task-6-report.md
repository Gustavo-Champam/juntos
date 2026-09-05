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

## Fix round 1 — review findings

### Fixes

- Pending invitation cookies now survive an anonymous acceptance attempt. The client redirects to `/api/auth/google/start?returnTo=%2Fconvite%3Fretomar%3D1`; only `/` and `/convite?retomar=1` are accepted, signed inside the OAuth attempt cookie, and used after the callback. Resumed acceptance sends no token in the URL.
- Invitation copy and selectable fallback use an absolute same-origin URL made with `new URL(path, window.location.origin).href`, retaining the opaque value exclusively in the fragment.
- Profile logout is a client action with disabled/loading state, an accessible failure message, and `router.replace("/entrar")` after its successful 204 response.
- Space and invitation forms validate the contract length bounds locally, map generic `request_failed` responses to Portuguese messages, and separate `role="alert"` failures from polite success status.

### Test evidence

- Focused: `npm --workspace @juntos/web test -- app/api/auth/routes.test.ts components/onboarding/accept-invitation.test.tsx components/onboarding/invitation-card.test.tsx components/onboarding/create-space-form.test.tsx components/profile/logout-button.test.tsx` — 5 files, 41 tests passing.
- Full: `npm --workspace @juntos/web test` — 19 files, 93 tests passing.
- `npm --workspace @juntos/web run lint`, `npm --workspace @juntos/web run typecheck`, `npm --workspace @juntos/web run build`, and `git diff --check` — passing.
