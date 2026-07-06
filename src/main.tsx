import { createRoot } from 'react-dom/client';
import App from './App';

// No StrictMode: its dev-only double-mount would remount the widget and skew
// the resize-message tracking, making the intermittent hang harder to read.
createRoot(document.getElementById('root')!).render(<App />);
