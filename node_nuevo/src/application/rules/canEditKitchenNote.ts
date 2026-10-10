const NOTE_EDIT_WINDOW_MS = 10 * 60 * 1000;

export function canEditKitchenNote(createdAt: Date, now: Date = new Date()): boolean {
    const createdAtMs = createdAt.getTime();
    const nowMs = now.getTime();
    const elapsedMs = nowMs - createdAtMs;

    return Number.isFinite(createdAtMs) &&
        Number.isFinite(nowMs) &&
        elapsedMs >= 0 &&
        elapsedMs <= NOTE_EDIT_WINDOW_MS;
}
