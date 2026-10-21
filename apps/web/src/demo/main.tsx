import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { MotionConfig } from 'motion/react';
import '../styles.css';
import { DemoApp } from './DemoApp.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <DemoApp />
    </MotionConfig>
  </StrictMode>,
);
