import VendorFields from './VendorFields';

function App() {
    return (
        <div style={{ maxWidth: 560, margin: '32px auto', fontFamily: 'sans-serif' }}>
            <h1 style={{ marginBottom: 16 }}>NMI Widget Repro</h1>
            <button
                onClick={() => window.location.reload()}
                style={{ marginBottom: 16, padding: '6px 12px', cursor: 'pointer' }}
            >
                ↻ Reload
            </button>
            <VendorFields />
        </div>
    );
}

export default App;
