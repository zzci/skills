---
name: "claude-api-in-prototypes"
description: "Claude API in prototypes\nAI features in prototypes — no host helper here; use a user-supplied API key"
---
**`window.claude.complete` does not exist in this environment.** That helper is injected only by the claude.ai artifact iframe; a page served over nsl (`http://<name>.localhost/…`) or opened from `file://` has no host bridge, so any prototype written against `window.claude.*` throws at runtime. Never emit code that calls it.

When a prototype genuinely needs a live AI feature, you have two real options:

## Option A (default): mock the AI

For most design work the AI response is content, not infrastructure. Hard-code realistic canned responses (with a short artificial delay to simulate latency) behind the same function interface you'd use for the real call. This keeps the prototype self-contained, offline-safe, and free.

## Option B: user-supplied Anthropic API key, direct fetch

Only when the user explicitly wants live model output in the prototype. Call the Messages API straight from the page:

```html
<script>
async function complete(prompt, apiKey) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true"
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }]
    })
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content.map(b => b.text ?? "").join("");
}
</script>
```

Rules for Option B — all mandatory:

- **The user brings the key.** Never hard-code a key into the HTML, never read one from the repo, never commit one. Have the page prompt for it at runtime (a password-type input) and keep it in memory only — storing it in `localStorage` is opt-in and must be labeled as a risk.
- **Security warning — say it out loud:** an API key embedded in or typed into a browser page is visible to anyone who gets the file or opens DevTools, and the `anthropic-dangerous-direct-browser-access` header exists precisely because browser-side keys are dangerous. This is acceptable only for a private, local prototype. Tell the user this before wiring it, and recommend a scoped, low-limit key they can revoke.
- **Degrade gracefully.** With no key entered, the prototype must still render and fall back to Option A mocks — never a blank or broken screen.
- A standalone-HTML export of such a page still needs the network (and a key) — see [save-as-standalone-html](save-as-standalone-html.md).
