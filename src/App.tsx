import { useState } from 'react';
import VendorFields from './VendorFields';
import CollectJsFields from './CollectJsFields';

type Impl = 'vendor' | 'collectjs';

const TABS: { id: Impl; label: string }[] = [
    { id: 'vendor', label: '@nmipayments (current)' },
    { id: 'collectjs', label: 'Collect.js (our spike)' },
];

function App() {
    const [impl, setImpl] = useState<Impl>('vendor');

    return (
        <div style={{ maxWidth: 560, margin: '32px auto', fontFamily: 'sans-serif' }}>
            <h1 style={{ marginBottom: 4 }}>NMI Widget Repro</h1>
            <p style={{ marginTop: 0, color: '#666', fontSize: 14 }}>
                Reload repeatedly to compare the vendor component against a
                direct Collect.js integration.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                {TABS.map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setImpl(tab.id)}
                        style={{
                            padding: '6px 12px',
                            cursor: 'pointer',
                            fontWeight: impl === tab.id ? 700 : 400,
                            border: '1px solid #ccc',
                            borderRadius: 6,
                            background: impl === tab.id ? '#e8f0fe' : '#fff',
                        }}
                    >
                        {tab.label}
                    </button>
                ))}
                <button
                    onClick={() => window.location.reload()}
                    style={{ padding: '6px 12px', cursor: 'pointer', marginLeft: 'auto' }}
                >
                    ↻ Reload
                </button>
            </div>

            {/* key={impl} forces a clean remount when switching implementations. */}
            {impl === 'vendor' ? (
                <VendorFields key='vendor' />
            ) : (
                <CollectJsFields key='collectjs' />
            )}
        </div>
    );
}

export default App;
