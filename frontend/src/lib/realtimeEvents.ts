export type RealtimeEvent = { type: string; payload: unknown };

export function parseRealtimeEvent(data: string) {
  try {
    const event = JSON.parse(data) as Partial<RealtimeEvent>;
    if (!event || typeof event.type !== "string") return null;
    return { type: event.type, payload: event.payload } satisfies RealtimeEvent;
  } catch {
    return null;
  }
}

export function shouldRefreshForRealtimeEvent(event: RealtimeEvent) {
  return ["activity.created", "vault.indexed", "hitl.requested"].includes(event.type);
}
