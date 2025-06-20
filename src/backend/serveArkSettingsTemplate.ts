// Express static middleware for serving ark-settings-template.json
// Add this to your backend server.ts (or similar) to serve the template to the frontend

import path from 'path';
import express from 'express';

export function serveArkSettingsTemplate(app: express.Express) {
  app.use('/ark-settings-template.json', express.static(path.join(__dirname, '../../ark-settings-template.json')));
}
