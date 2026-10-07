/**
 * Request-id generation (client-safe): no Node built-ins.
 */
export function newRequestId(): string {
  return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
