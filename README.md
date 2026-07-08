# NMI Payments widget — bug reproductions

A minimal React app that reproduces two issues in
[`@nmipayments/nmi-pay-react`](https://www.npmjs.com/package/@nmipayments/nmi-pay-react)
(the `NmiPayments` and `NmiThreeDSecure` components).

## Try it

**Demo app: https://nmi-test-131643827145.us-central1.run.app**

## Bug 1 — Payment fields intermittently hang on the loading spinner

`NmiPayments` mounts three hosted-field iframes (`ccnumber`, `ccexp`, `cvv`)
from `secure.nmi.com/token/inline.php`. The widget hides its loading spinner and
fires `onFieldsAvailable` **only after all three iframes have posted a `resize`
message**.

Intermittently, **one iframe never posts its `resize` message**. Because there
is no timeout or fallback, the widget stays on the spinner forever and
`onFieldsAvailable` is never called.

**Reproduce:**
1. Click **🔁 Auto-retry until hang**. The app reloads itself on every
   successful load and keeps going until a hang reproduces.
2. Wait — it stops automatically the moment it catches a hung load, leaving that
   load on screen. The app listens for the iframes' `resize` messages and
   reports which fields signaled; on a hung load it shows e.g. `HANG
   REPRODUCED — missing: [ccnumber]`, and `onFieldsAvailable` never fires.

---
---

## Bug 2 — 3D Secure auth failure is never surfaced; widget stuck loading

Using the test card **`4000 0000 0000 2537`**, running 3D Secure
(`NmiThreeDSecure` → `startThreeDSecure`) fails authentication. Gateway.js logs
the failure to the console:

```
ThreeDSecureUI: Payer Authentication Error - Blocked due to Failed Authentication rule REFID: 85085966
```

However, **`NmiThreeDSecure`'s `onFailure` callback is never called** (nor
`onComplete` / `onChallenge`). The integrating app receives no signal, so the
widget remains **stuck in a loading state** indefinitely.

**Reproduce:**
1. Enter card `4000 0000 0000 2537` with any valid future expiry and CVV.
2. Click **Pay** (this calls `startThreeDSecure` with the tokenized card).
3. Observe: the Gateway.js error above is logged to the console, the 3DS UI
   stays in its loading state, and none of `onComplete` / `onFailure` /
   `onChallenge` fire.

**The event that *is* emitted:** even though no callback fires, Gateway.js does
post the failure as a `message` event on `window` — the vendor just never turns
it into an `onFailure` call. Captured payload (`origin:
https://secure.networkmerchants.com`):

```jsonc
{
  "action": "_gatewayJsInternal_error",
  "service": "ThreeDS",
  "frameId": "47170f48-...",
  "data": {
    "refId": "88657679",
    "message": "Payer Authentication Error - Blocked due to Failed Authentication rule",
    "type": "generalError"
  }
}
```

Listening for this `_gatewayJsInternal_error` / `ThreeDS` message is enough to
detect the failure and recover (surface an error, reset the form) instead of
hanging.

---

## Running locally

```bash
cp .env.example .env.local     # then set VITE_NMI_TOKENIZATION_KEY
npm install
npm run dev
```

`VITE_NMI_TOKENIZATION_KEY` is a public (client-side) tokenization key.
