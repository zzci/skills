---
name: "options-stack"
description: "Options\nLay out design options — vertical stack (DC) / pannable canvas (non-DC)"
---
Lay design options out on a pannable canvas. There is no host-provided canvas mode in this environment (the hosted `<meta name="design_doc_mode" content="canvas">` shortcut does nothing on an nsl-served page) — use the `design-canvas.jsx` starter instead: copy it in (`cp <skill-dir>/starter-components/design-canvas.jsx designs/<project>/`) and put each option in a `<DCArtboard>` inside a `<DCSection>`; artboards are static design frames, not scroll regions — size each one to fit its content rather than giving inner elements `height:100%` + `overflow:auto`. Keep every frame's left/top ≥ 0. If the user must pick one of the options for you to proceed, do not lay options out this way — build the candidates, surface them, and ask which to proceed with (a concise numbered list in chat).
