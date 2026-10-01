# Interaction standards

Use `Button`, `SubmitButton`, and `ButtonGroup` from `components/ui/Button`.

- Primary is the principal action; secondary/outline are alternatives; tertiary/ghost are low emphasis; destructive is rejection, removal or cancellation; success is only for a positive semantic outcome.
- `Button` defaults to `type="button"`; use `SubmitButton` or explicit `type="submit"` in a form. Preserve `name`, `value`, `formAction`, accessible labels and existing confirmation policy.
- Return the Promise from an async click handler. The button acquires a synchronous lock before calling it, shows a spinner, disables submission, and restores on settlement. Do not use `void` to detach the action. Supply `loadingLabel` for long operations and `loading` for work owned by another component.
- `SubmitButton` follows React form status. All submit actions in the same form disable while its action is pending. A form with a manual `onSubmit` must also pass its own pending state.
- The spinner has a reserved slot. A loading label overlays the original content to preserve width. Inline failure feedback has `role="alert"`; project mutation outcomes have `role="status"`. Do not infer success from arbitrary network activity.
- Use ButtonGroup for related actions: wrapping flex, 12px gap, no overlap. Existing form/modal/header groups use the same spacing tokens. Icon controls need `iconOnly` and a meaningful accessible name.
- Motion tokens are 140ms/200ms with a consistent easing. Fine pointers get 1.015 hover scale and .98 press scale. Disabled controls have no interactive scaling. Visible keyboard focus applies to controls and links. Coarse-pointer controls approach a 44px target.
- Respect reduced motion; retain the layout's positioning transforms. Do not add global click listeners or replace `window.fetch`.
- Approval writes use the existing database-authorized conditional transition from pending. Identical retries return the authoritative outcome; opposite retries conflict. Do not update tasks separately from the approval trigger.
- Invalidate pre-mutation reads. A confirmed outcome may be removed from the active list, with history retained on the server. Never discard or optimistically delete authority history.
- Poll visible pages with in-flight protection. Use an explicit project update signal after a mutation. Keep necessary server-component refreshes where server-owned data still depends on them; do not introduce hard reloads.
- Identical pending or rejected project requests are fingerprinted and serialized in Postgres. Suppressed repetitions appear as `approval.loop_blocked` activity with count, responsible agent and prior outcome. Revised scope/payload must receive a distinct request. Recovery knowledge does not renew a rejected authorization.

Run `npm run test:interactions` before changing these contracts.
