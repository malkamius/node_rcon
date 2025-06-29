import React from 'react';
import { createRoot } from 'react-dom/client';
import { ServerManagerPage } from './ServerManagerPage';

const container = document.getElementById('app');
if (container) {
  const root = createRoot(container);
  root.render(<ServerManagerPage />);
}
