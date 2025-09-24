"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// index.ts
const express_1 = __importDefault(require("express"));
const TaskHandler_1 = require("./TaskHandler");
const installInstance_1 = require("./handlers/installInstance");
const app = (0, express_1.default)();
app.use(express_1.default.json());
const PORT = 12345;
const registry = new TaskHandler_1.TaskHandlerRegistry();
registry.register('InstallInstance', installInstance_1.installInstanceHandler);
app.post('/api/task', async (req, res) => {
    const { command, params } = req.body;
    if (!command)
        return res.status(400).json({ error: 'Missing command' });
    try {
        const result = await registry.handle(command, params);
        res.json({ ok: true, result });
    }
    catch (err) {
        res.status(500).json({ ok: false, error: err.message });
    }
});
app.listen(PORT, () => {
    console.log(`[elevated-service] Listening on port ${PORT}`);
});
