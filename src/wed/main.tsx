import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WeddingPage } from './WeddingPage';
import './wed.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WeddingPage />
  </StrictMode>,
);
