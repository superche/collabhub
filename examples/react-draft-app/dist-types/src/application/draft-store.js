export class DraftStore {
    current;
    listeners = new Set();
    constructor(current) {
        this.current = current;
    }
    getSnapshot = () => this.current;
    subscribe = (listener) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
    publish(event) { this.current = event.draft; for (const listener of this.listeners)
        listener(); }
}
//# sourceMappingURL=draft-store.js.map