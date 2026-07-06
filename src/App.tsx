import VendorFields from './VendorFields';

function App() {
    return (
        <div style={{ maxWidth: 560, margin: '32px auto', fontFamily: 'sans-serif' }}>
            <h1 style={{ marginBottom: 4 }}>NMI Widget Repro</h1>
            <p style={{ marginTop: 0, color: '#666', fontSize: 14 }}>
                Reload the page repeatedly — roughly 1 in 10 loads the payment
                fields hang on the spinner and never become ready.
            </p>
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
