// TaskHandler.ts
export type HandlerFn = (params: any) => Promise<any>;

export class TaskHandlerRegistry {
  private handlers: Map<string, HandlerFn> = new Map();

  register(command: string, handler: HandlerFn) {
    this.handlers.set(command, handler);
  }

  async handle(command: string, params: any): Promise<any> {
    const handler = this.handlers.get(command);
    if (!handler) throw new Error(`No handler for command: ${command}`);
    return handler(params);
  }
}
