---
name: "make-tweakable"
description: "Make tweakable\nAdd in-design tweak controls (in-page panel; no host Tweaks toolbar here)"
---
Make sure your design supports Tweaks — user-adjustable knobs for high-impact values. If the user tells you what to make tweakable, do that. If not, pick a few high-impact values — key colors, a layout variant, a feature flag, headline copy. Keep the Tweaks panel small and tasteful; hide it completely when toggled off.

## Build the panel in-page

There is **no host-provided Tweaks toolbar or panel in this environment** — the claude.ai postMessage protocol (`__edit_mode_available` / `__activate_edit_mode` / `__edit_mode_set_keys`) has no listener on an nsl-served page, so a panel wired only to it never opens. Build the whole thing in the page:

- A fixed-position panel with inputs/selects/sliders wired to CSS custom properties or React state, plus **its own Show/Hide toggle** — a small in-page button or switch labeled "Tweaks" driven by local state; when off, the panel is fully hidden.
- You may start from the `starter-components/tweaks-panel.jsx` scaffold for its form-control helpers (`<TweakSlider>`, `<TweakToggle>`, color inputs, `TWEAK_DEFAULTS` shape), but drive its visibility from your own toggle — its host-activation wiring is inert here.
- Keep a single `TWEAK_DEFAULTS` object as the source of truth for tweakable values. To persist the user's tweaks across reloads, write the current values to `localStorage` on change and rehydrate on load (the host file-write-back path doesn't exist here; if the user wants a tweak made permanent, they ask you and you edit the source).
- It's fine to ship a couple of tasteful controls visible by default so the user can explore directions quickly. Suggest expressive, multi-variable knobs over pixel-pushing: a "minimalism" slider, a time-of-day palette morph, an era/style toggle — each still just a key in `TWEAK_DEFAULTS` plus a control.
