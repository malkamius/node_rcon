"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TaskHandlerRegistry = void 0;
class TaskHandlerRegistry {
    constructor() {
        this.handlers = new Map();
    }
    register(command, handler) {
        this.handlers.set(command, handler);
    }
    async handle(command, params) {
        const handler = this.handlers.get(command);
        if (!handler)
            throw new Error(`No handler for command: ${command}`);
        return handler(params);
    }
}
exports.TaskHandlerRegistry = TaskHandlerRegistry;
