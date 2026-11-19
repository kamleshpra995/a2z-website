import { createRoot } from 'react-dom/client';
import './style.css';
import App from './App.tsx';
import PublicTicketPage from './pages/PublicTicketPage.tsx';

// A store QR opens /portal/?store=<id>: the public complaint form, no login needed.
const publicStoreId = new URLSearchParams(window.location.search).get('store');
createRoot(document.getElementById('root')!).render(
  publicStoreId ? <PublicTicketPage storeId={publicStoreId} /> : <App />,
);
