import {
    forwardRef,
    useEffect,
    useImperativeHandle,
    useRef,
    useState,
} from 'react';

/**
 * Spike: our own 3D Secure step built directly on NMI's Gateway.js —
 * the same primitive @nmipayments uses (Gateway.create(key).get3DSecure()).
 *
 * Flow, mirroring the vendor bundle:
 *   const ui = Gateway.create(key).get3DSecure().createUI({ ...browserData, ...paymentInfo });
 *   ui.on('challenge' | 'complete' | 'failure', ...);
 *   ui.start('#threeDSMountPoint');
 *
 * `complete` returns the raw ThreeDSecureCompleteEvent (cavv/eci/xid/…) — the
 * exact shape Trova's backend already consumes, so the downstream contract is
 * unchanged.
 */

const GATEWAY_JS_SRC = 'https://secure.networkmerchants.com/js/v1/Gateway.js';

export interface PaymentInformation {
    paymentToken: string;
    currency: string;
    amount: string;
    firstName: string;
    lastName: string;
    email?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    address1?: string;
}

export interface ThreeDSecureCompleteEvent {
    cardHolderAuth: string;
    cavv: string;
    directoryServerId: string;
    eci: string;
    threeDsVersion: string;
    xid: string | null;
}

export interface ThreeDSecureFailureEvent {
    code: string;
    message: string;
}

export interface ThreeDSecureRef {
    startThreeDSecure: (info: PaymentInformation) => void;
}

// Minimal shape of the Gateway.js 3DS API we depend on.
interface Gateway3DSUI {
    on: (event: 'challenge' | 'complete' | 'failure', cb: (e: unknown) => void) => void;
    start: (selector: string) => void;
    unmount: () => void;
}
interface Gateway3DS {
    createUI: (data: Record<string, string>) => Gateway3DSUI;
}
interface GatewayInstance {
    get3DSecure: () => Gateway3DS;
}
declare global {
    interface Window {
        Gateway?: { create: (key: string) => GatewayInstance };
    }
}

const collectBrowserData = (): Record<string, string> => ({
    browserJavascriptEnabled: String(true),
    browserJavaEnabled: String(false),
    browserLanguage: window.navigator.language,
    browserColorDepth: String(window.screen.colorDepth),
    browserScreenHeight: String(window.screen.height),
    browserScreenWidth: String(window.screen.width),
    browserTimeZone: String(new Date().getTimezoneOffset()),
    deviceChannel: 'Browser',
});

interface ThreeDSecureProps {
    tokenizationKey: string;
    onComplete?: (e: ThreeDSecureCompleteEvent) => void;
    onFailure?: (e: ThreeDSecureFailureEvent) => void;
    onChallenge?: () => void;
    onLog?: (label: string) => void;
}

const ThreeDSecure = forwardRef<ThreeDSecureRef, ThreeDSecureProps>(
    ({ tokenizationKey, onComplete, onFailure, onChallenge, onLog }, ref) => {
        const uiRef = useRef<Gateway3DSUI | null>(null);
        const [challenging, setChallenging] = useState(false);

        const log = (label: string) => {
            console.log(`[3ds] ${label}`);
            onLog?.(label);
        };

        // Load Gateway.js once.
        useEffect(() => {
            if (document.querySelector(`script[src="${GATEWAY_JS_SRC}"]`)) {
                return;
            }
            const script = document.createElement('script');
            script.src = GATEWAY_JS_SRC;
            script.onload = () => log('Gateway.js loaded');
            script.onerror = () => log('Gateway.js FAILED to load');
            document.head.appendChild(script);
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);

        // Size the challenge iframe from NMI's resize postMessages.
        useEffect(() => {
            const mountEl = () => document.getElementById('threeDSMountPoint');
            const handleMessage = (event: MessageEvent) => {
                const fromNmi =
                    event.origin.includes('secure.networkmerchants.com') ||
                    event.origin.includes('nmi.com');
                if (
                    fromNmi &&
                    event.data?.action === '_resize' &&
                    event.data?.service === 'ThreeDS'
                ) {
                    const el = mountEl();
                    const iframe = el?.querySelector('iframe');
                    if (iframe && event.data.data) {
                        iframe.style.height = `${event.data.data.height}px`;
                        iframe.style.width = `${event.data.data.width}px`;
                    }
                }
            };
            window.addEventListener('message', handleMessage, true);
            return () => window.removeEventListener('message', handleMessage, true);
            // eslint-disable-next-line react-hooks/exhaustive-deps
        }, []);

        const teardown = () => {
            uiRef.current?.unmount();
            uiRef.current = null;
            setChallenging(false);
        };

        useImperativeHandle(ref, () => ({
            startThreeDSecure: (info: PaymentInformation) => {
                if (!window.Gateway) {
                    log('Gateway.js not ready yet');
                    onFailure?.({ code: 'GATEWAY_NOT_READY', message: 'Gateway.js not loaded' });
                    return;
                }
                try {
                    log('startThreeDSecure — building 3DS UI');
                    const threeDS = window.Gateway.create(tokenizationKey).get3DSecure();
                    const ui = threeDS.createUI({
                        ...collectBrowserData(),
                        ...(info as unknown as Record<string, string>),
                    });
                    uiRef.current = ui;

                    ui.on('challenge', () => {
                        log('challenge — step-up required, showing modal');
                        setChallenging(true);
                        onChallenge?.();
                    });
                    ui.on('complete', (e) => {
                        const result = e as ThreeDSecureCompleteEvent;
                        log(`complete — eci=${result.eci} cavv=${result.cavv ? 'present' : 'none'}`);
                        onComplete?.(result);
                        teardown();
                    });
                    ui.on('failure', (e) => {
                        const err = e as ThreeDSecureFailureEvent;
                        log(`failure — ${err.code}: ${err.message}`);
                        onFailure?.(err);
                        teardown();
                    });

                    ui.start('#threeDSMountPoint');
                    log('ui.start(#threeDSMountPoint) — running (frictionless unless challenged)');
                } catch (err) {
                    log(`threw: ${(err as Error).message}`);
                    onFailure?.({ code: 'THREE_DS_ERROR', message: (err as Error).message });
                    teardown();
                }
            },
        }));

        return (
            <div
                aria-hidden={!challenging}
                style={{
                    position: 'fixed',
                    inset: 0,
                    display: challenging ? 'flex' : 'none',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'rgba(0,0,0,0.4)',
                    zIndex: 1000,
                }}
            >
                <div
                    style={{
                        background: '#fff',
                        borderRadius: 8,
                        minWidth: 320,
                        maxWidth: '90vw',
                        maxHeight: '90vh',
                        overflow: 'auto',
                        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '16px 20px',
                            borderBottom: '1px solid #e1e5e9',
                        }}
                    >
                        <h3 style={{ margin: 0, fontSize: 16 }}>3D Secure Authentication</h3>
                        <button
                            onClick={teardown}
                            style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer' }}
                            aria-label='Close'
                        >
                            &times;
                        </button>
                    </div>
                    {/*
                     * The mount point must exist in the DOM before ui.start() runs.
                     * It stays rendered (inside a display:none overlay for the
                     * frictionless case — the hidden auth iframe still loads).
                     */}
                    <div style={{ padding: 0 }}>
                        <div id='threeDSMountPoint' />
                    </div>
                </div>
            </div>
        );
    }
);

ThreeDSecure.displayName = 'ThreeDSecure';

export default ThreeDSecure;
