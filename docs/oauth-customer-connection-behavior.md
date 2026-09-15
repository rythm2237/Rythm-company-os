# OAuth customer connection behavior

RYTHM keeps customer setup visible while external authorization is in progress.

- External OAuth authorization must open in a separate browser tab/window.
- The original RYTHM Integration page remains open so the persistent setup guide is not lost.
- RYTHM must never attempt to inject or overlay UI on a third-party OAuth origin such as accounts.google.com.
- The guide remains available inside RYTHM until the customer explicitly closes it.
- Connection status remains `Setup required` until the provider callback succeeds and verification is recorded.
- Test-mode provider restrictions are treated as provider configuration problems, not as successful connections.
