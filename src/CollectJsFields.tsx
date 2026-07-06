import { useEffect, useRef, useState } from "react";
import ThreeDSecure, {
  type ThreeDSecureRef,
  type ThreeDSecureCompleteEvent,
} from "./ThreeDSecure";

/**
 * Spike: our own card fields built directly on NMI's official Collect.js —
 * the same inline.php hosted-field iframes @nmipayments wraps, but with the
 * documented lifecycle callbacks the vendor component doesn't expose.
 *
 * The key win over @nmipayments: Collect.js has a native `timeoutCallback`
 * that fires if the hosted fields don't finish loading in `timeoutDuration` ms.
 * That is the built-in equivalent of the watchdog we had to bolt on.
 */

const TOKENIZATION_KEY = import.meta.env.VITE_NMI_TOKENIZATION_KEY ?? "";
const COLLECT_JS_SRC = "https://secure.nmi.com/token/Collect.js";
const FIELD_TIMEOUT_MS = 8000;

// Minimal shape of the global Collect.js exposes on window.
interface CollectJSStatic {
  configure: (config: Record<string, unknown>) => void;
  startPaymentRequest: () => void;
}
declare global {
  interface Window {
    CollectJS?: CollectJSStatic;
  }
}

type TimelineEntry = { t: number; label: string };
type Status = "loading" | "ready" | "timeout" | "tokenized";
type ThreeDSStatus = "idle" | "running" | "challenge" | "complete" | "failure";

function CollectJsFields() {
  const startedAt = useRef<number>(performance.now());
  const configuredRef = useRef(false);
  const threeDSRef = useRef<ThreeDSecureRef>(null);

  const [status, setStatus] = useState<Status>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [validity, setValidity] = useState<Record<string, boolean>>({});
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [threeDSStatus, setThreeDSStatus] = useState<ThreeDSStatus>("idle");
  const [threeDSResult, setThreeDSResult] =
    useState<ThreeDSecureCompleteEvent | null>(null);

  const log = (label: string) => {
    const t = Math.round(performance.now() - startedAt.current);
    setTimeline((prev) => [...prev, { t, label }]);
    console.log(`[collectjs] +${t}ms  ${label}`);
  };

  useEffect(() => {
    const configure = () => {
      if (configuredRef.current || !window.CollectJS) {
        return;
      }
      configuredRef.current = true;
      window.CollectJS.configure({
        variant: "inline",
        // Native hang recovery — the feature @nmipayments lacks.
        timeoutDuration: FIELD_TIMEOUT_MS,
        timeoutCallback: () => {
          setStatus((s) => (s === "ready" ? s : "timeout"));
          log(`timeoutCallback — fields did not load in ${FIELD_TIMEOUT_MS}ms`);
        },
        fieldsAvailableCallback: () => {
          setStatus("ready");
          log("fieldsAvailableCallback — all iframes ready");
        },
        validationCallback: (
          field: string,
          valid: boolean,
          message: string,
        ) => {
          setValidity((prev) => ({ ...prev, [field]: valid }));
          log(
            `validation: ${field} ${valid ? "valid" : `invalid (${message})`}`,
          );
        },
        callback: (response: { token: string }) => {
          setToken(response.token);
          setStatus("tokenized");
          log(`token received: ${response.token.slice(0, 12)}…`);
          // Chain straight into 3DS, mirroring Trova's real flow:
          // token → startThreeDSecure(paymentInfo) → charge.
          setThreeDSStatus("running");
          setThreeDSResult(null);
          threeDSRef.current?.startThreeDSecure({
            paymentToken: response.token,
            amount: "25.00",
            currency: "USD",
            firstName: "Test",
            lastName: "User",
            email: "test@example.com",
          });
        },
        fields: {
          ccnumber: {
            selector: "#cj-ccnumber",
            title: "Card Number",
            placeholder: "0000 0000 0000 0000",
          },
          ccexp: {
            selector: "#cj-ccexp",
            title: "Expiration",
            placeholder: "MM / YY",
          },
          cvv: { selector: "#cj-cvv", title: "CVV", placeholder: "123" },
        },
      });
      log("CollectJS.configure() called");
    };

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${COLLECT_JS_SRC}"]`,
    );
    if (existing && window.CollectJS) {
      configure();
      return;
    }

    const script = document.createElement("script");
    script.src = COLLECT_JS_SRC;
    // Collect.js reads the tokenization key from this attribute on its own tag.
    script.setAttribute("data-tokenization-key", TOKENIZATION_KEY);
    script.onload = () => {
      log("Collect.js script loaded");
      configure();
    };
    script.onerror = () => log("Collect.js script FAILED to load");
    document.head.appendChild(script);
    log("injecting Collect.js script");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const statusBanner: Record<Status, { text: string; color: string }> = {
    loading: { text: "⏳ loading Collect.js fields…", color: "#8a6d00" },
    ready: {
      text: "✅ fields ready (fieldsAvailableCallback fired)",
      color: "#0a7d2c",
    },
    timeout: {
      text: "🔴 timeoutCallback fired — fields never loaded",
      color: "#c62828",
    },
    tokenized: { text: "🎉 payment token generated", color: "#0a7d2c" },
  };
  const banner = statusBanner[status];

  const fieldBoxStyle: React.CSSProperties = {
    border: "1px solid #ccc",
    borderRadius: 6,
    padding: "10px 12px",
    minHeight: 44,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 12,
    color: "#555",
    marginBottom: 4,
  };

  return (
    <div>
      {/*
       * Force an explicit height on the mount points and the injected
       * iframes. Collect.js sizes these iframes from a postMessage
       * "resize" — the same signal that intermittently never arrives and
       * hangs @nmipayments. Pinning the height here means a field that
       * fails to self-size still renders and stays usable. This is the
       * defense we get by owning the container.
       */}
      <style>{`
                #cj-ccnumber, #cj-ccexp, #cj-cvv { min-height: 24px; }
                #cj-ccnumber iframe, #cj-ccexp iframe, #cj-cvv iframe {
                    width: 100% !important;
                    height: 24px !important;
                    border: 0;
                }
            `}</style>
      <div
        style={{
          border: `2px solid ${banner.color}`,
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: 700, color: banner.color, marginBottom: 6 }}>
          {banner.text}
        </div>
        <div style={{ fontSize: 13 }}>
          validity:{" "}
          {Object.keys(validity).length === 0
            ? "(none yet)"
            : Object.entries(validity)
                .map(([f, v]) => `${f}:${v ? "✓" : "✗"}`)
                .join("  ")}
        </div>
        {token && (
          <div style={{ fontSize: 12, marginTop: 6, wordBreak: "break-all" }}>
            <b>token:</b> {token}
          </div>
        )}
        <details style={{ marginTop: 8, fontSize: 12 }}>
          <summary style={{ cursor: "pointer" }}>
            timeline ({timeline.length})
          </summary>
          <pre style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>
            {timeline.map((e) => `+${e.t}ms  ${e.label}`).join("\n") ||
              "(empty)"}
          </pre>
        </details>
      </div>

      {/* Collect.js injects an iframe into each of these mount points. */}
      <div style={{ display: "grid", gap: 12 }}>
        <div style={fieldBoxStyle}>
          <div style={labelStyle}>Card number</div>
          <div id="cj-ccnumber" />
        </div>
        <div
          style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
        >
          <div style={fieldBoxStyle}>
            <div style={labelStyle}>Expiration</div>
            <div id="cj-ccexp" />
          </div>
          <div style={fieldBoxStyle}>
            <div style={labelStyle}>CVV</div>
            <div id="cj-cvv" />
          </div>
        </div>
      </div>

      <button
        onClick={() => {
          log("startPaymentRequest()");
          window.CollectJS?.startPaymentRequest();
        }}
        disabled={status === "loading" || status === "timeout"}
        style={{ marginTop: 16, padding: "8px 16px", cursor: "pointer" }}
      >
        Tokenize card → run 3DS
      </button>

      {threeDSStatus !== "idle" && (
        <div
          style={{
            marginTop: 16,
            border: `2px solid ${THREE_DS_COLORS[threeDSStatus]}`,
            borderRadius: 8,
            padding: 12,
            background: "#fafafa",
          }}
        >
          <div
            style={{ fontWeight: 700, color: THREE_DS_COLORS[threeDSStatus] }}
          >
            {THREE_DS_LABELS[threeDSStatus]}
          </div>
          {threeDSResult && (
            <pre
              style={{
                margin: "8px 0 0",
                fontSize: 12,
                whiteSpace: "pre-wrap",
              }}
            >
              {JSON.stringify(threeDSResult, null, 2)}
            </pre>
          )}
        </div>
      )}

      <ThreeDSecure
        ref={threeDSRef}
        tokenizationKey={TOKENIZATION_KEY}
        onChallenge={() => setThreeDSStatus("challenge")}
        onComplete={(result) => {
          setThreeDSStatus("complete");
          setThreeDSResult(result);
          log(`3DS complete — eci=${result.eci}`);
        }}
        onFailure={(err) => {
          setThreeDSStatus("failure");
          log(`3DS failure — ${err.code}: ${err.message}`);
        }}
        onLog={(label) => log(`3DS: ${label}`)}
      />
    </div>
  );
}

const THREE_DS_COLORS: Record<ThreeDSStatus, string> = {
  idle: "#999",
  running: "#8a6d00",
  challenge: "#1565c0",
  complete: "#0a7d2c",
  failure: "#c62828",
};

const THREE_DS_LABELS: Record<ThreeDSStatus, string> = {
  idle: "",
  running: "⏳ 3DS running (frictionless unless a challenge is required)…",
  challenge: "🔐 3DS challenge — step-up modal shown",
  complete: "✅ 3DS complete — authentication payload received",
  failure: "🔴 3DS failed",
};

export default CollectJsFields;
