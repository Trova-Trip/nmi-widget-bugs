import { useEffect, useRef, useState } from "react";
import {
  NmiPayments,
  NmiThreeDSecure,
  type NmiPaymentsRef,
  type NmiThreeDSecureRef,
} from "@nmipayments/nmi-pay-react";
import type {
  PaymentChangeEvent,
  PaymentInformation,
  ThreeDSecureCompleteEvent,
  ThreeDSecureFailureEvent,
} from "@nmipayments/nmi-pay";

const TOKENIZATION_KEY = import.meta.env.VITE_NMI_TOKENIZATION_KEY ?? "";

// The NmiPayments hides the spinner + fires onFieldsAvailable only after all three
// hosted-field iframes post a "resize" message. If one never arrives, it hangs.
const REQUIRED_FIELDS = ["ccnumber", "ccexp", "cvv"] as const;
const HANG_THRESHOLD_MS = 5000;

type TimelineEntry = { t: number; label: string };
type ThreeDSStatus = "idle" | "running" | "challenge" | "complete" | "failure";

interface NmiResizeMessage {
  action: "resize";
  fieldId: string;
}

const isResizeEvent = (
  event: MessageEvent,
): event is MessageEvent<NmiResizeMessage> => {
  const { data } = event;
  return data?.action === "resize" && typeof data?.fieldId === "string";
};

function VendorFields() {
  const widgetRef = useRef<NmiPaymentsRef>(null);
  const threeDSRef = useRef<NmiThreeDSecureRef>(null);
  const startedAt = useRef<number>(performance.now());
  // The vendor fires onFieldsAvailable repeatedly; only record it once.
  const fieldsAvailableLogged = useRef(false);

  const [seenFields, setSeenFields] = useState<Set<string>>(new Set());
  const [fieldsAvailable, setFieldsAvailable] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  // Token captured from onChange, exactly like microapps' useNmiForm.
  const [paymentToken, setPaymentToken] = useState<string>();
  const [threeDSStatus, setThreeDSStatus] = useState<ThreeDSStatus>("idle");
  const [threeDSResult, setThreeDSResult] =
    useState<ThreeDSecureCompleteEvent | null>(null);

  const log = (label: string) => {
    const t = Math.round(performance.now() - startedAt.current);
    setTimeline((prev) => [...prev, { t, label }]);
    console.log(`[repro] +${t}ms  ${label}`);
  };

  // Record which field iframes post their "resize" signal.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!isResizeEvent(event)) {
        return;
      }
      const { fieldId } = event.data;
      setSeenFields((prev) => {
        if (prev.has(fieldId)) {
          return prev;
        }
        log(`resize from "${fieldId}"`);
        return new Set(prev).add(fieldId);
      });
    };
    window.addEventListener("message", handleMessage, true);
    return () => window.removeEventListener("message", handleMessage, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flag a hang if onFieldsAvailable never fires within the threshold.
  useEffect(() => {
    const timer = setTimeout(() => {
      // Read the ref, not the stale `fieldsAvailable` captured at mount.
      if (!fieldsAvailableLogged.current) {
        setTimedOut(true);
        log(`HANG DETECTED at ${HANG_THRESHOLD_MS}ms`);
      }
    }, HANG_THRESHOLD_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // --- 3DS flow, mirroring microapps NmiMakePaymentForm ---

  // On submit, kick off 3DS with the token + payment info (buildPaymentInfo).
  const handleSubmit = () => {
    if (!paymentToken) {
      log("3DS: submit blocked — no token yet (fill the card first)");
      return;
    }
    const paymentInfo: PaymentInformation = {
      paymentToken,
      amount: "25.00",
      currency: "USD",
      firstName: "Test",
      lastName: "User",
      email: "test@example.com",
    };
    setThreeDSStatus("running");
    setThreeDSResult(null);
    log("3DS: startThreeDSecure()");
    threeDSRef.current?.startThreeDSecure(paymentInfo);
  };

  // onChallenge — a step-up modal was shown (microapps clears its submitting
  // flag here so the user can interact with the challenge).
  const handleThreeDSChallenge = () => {
    setThreeDSStatus("challenge");
    log("3DS: challenge — step-up modal shown");
  };

  // onComplete — in microapps this hands the result to submitPayment(token,
  // threeDSResult) → the backend charge. Here we just surface the payload.
  const handleThreeDSComplete = (result: ThreeDSecureCompleteEvent) => {
    setThreeDSStatus("complete");
    setThreeDSResult(result);
    log(`3DS: complete — eci=${result.eci}`);
  };

  const handleThreeDSFailure = (error: ThreeDSecureFailureEvent) => {
    setThreeDSStatus("failure");
    log(`3DS: failure — ${error.code}: ${error.message}`);
  };

  const missing = REQUIRED_FIELDS.filter((f) => !seenFields.has(f));
  const hung = timedOut && !fieldsAvailable;

  let status: { text: string; color: string };
  if (fieldsAvailable) {
    status = { text: "✅ OK — widget ready", color: "#0a7d2c" };
  } else if (hung) {
    status = {
      text: `🔴 HANG REPRODUCED — missing: [${missing.join(", ") || "none"}]`,
      color: "#c62828",
    };
  } else {
    status = { text: "⏳ waiting for fields…", color: "#8a6d00" };
  }

  return (
    <div>
      <div
        style={{
          border: `2px solid ${status.color}`,
          borderRadius: 8,
          padding: 12,
          marginBottom: 16,
          background: "#fafafa",
        }}
      >
        <div style={{ fontWeight: 700, color: status.color, marginBottom: 8 }}>
          {status.text}
        </div>
        <div style={{ display: "flex", gap: 12, fontSize: 13 }}>
          {REQUIRED_FIELDS.map((f) => (
            <span
              key={f}
              style={{ color: seenFields.has(f) ? "#0a7d2c" : "#999" }}
            >
              {seenFields.has(f) ? "✓" : "○"} {f}
            </span>
          ))}
        </div>
        <div style={{ fontSize: 13, marginTop: 6 }}>
          onFieldsAvailable: <b>{fieldsAvailable ? "fired" : "not fired"}</b>
        </div>
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

      <NmiPayments
        ref={widgetRef}
        tokenizationKey={TOKENIZATION_KEY}
        layout="multiLine"
        paymentMethods={["card"]}
        onFieldsAvailable={() => {
          if (fieldsAvailableLogged.current) {
            return;
          }
          fieldsAvailableLogged.current = true;
          setFieldsAvailable(true);
          log("onFieldsAvailable fired (1st of many — vendor repeats it)");
        }}
        onChange={(data: PaymentChangeEvent) => {
          setPaymentToken(data.complete ? data.token : undefined);
          console.log("[repro] onChange", data);
        }}
      />

      <button
        onClick={handleSubmit}
        disabled={!paymentToken || threeDSStatus === "running"}
        style={{
          marginTop: 16,
          padding: "10px 20px",
          cursor: paymentToken ? "pointer" : "not-allowed",
          fontWeight: 600,
        }}
      >
        Pay
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

      <NmiThreeDSecure
        ref={threeDSRef}
        tokenizationKey={TOKENIZATION_KEY}
        modal
        onChallenge={handleThreeDSChallenge}
        onComplete={handleThreeDSComplete}
        onFailure={handleThreeDSFailure}
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

export default VendorFields;
