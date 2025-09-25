// index.ts
import express from 'express';
import { TaskHandlerRegistry } from './TaskHandler';
import { installInstanceHandler } from './handlers/installInstance';

const app = express();
app.use(express.json());
const PORT = 12345;

const registry = new TaskHandlerRegistry();
registry.register('InstallInstance', installInstanceHandler);

app.post('/api/task', async (req, res) => {
  const { command, params } = req.body;
  if (!command) return res.status(400).json({ error: 'Missing command' });
  try {
    const result = await registry.handle(command, params);
    res.json({ ok: true, result });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`[elevated-service] Listening on port ${PORT}`);
});
