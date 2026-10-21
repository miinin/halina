import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import './styles.css';
import { Home } from './Home.tsx';
import { t } from './i18n/fi.ts';

// hostin koodi (moottori, QR) ladataan vain /host-sivulla → pelaajan paketti pysyy pienenä
const HostApp = lazy(() => import('./host/HostApp.tsx'));
const PlayApp = lazy(() => import('./play/PlayApp.tsx'));

function App() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const page = path.startsWith('/host') ? <HostApp /> : path.startsWith('/play') ? <PlayApp /> : <Home />;
  return (
    <MotionConfig reducedMotion="user">
      <Suspense fallback={<div className="grid h-full place-items-center text-white/60">{t.common.loading}</div>}>{page}</Suspense>
    </MotionConfig>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
