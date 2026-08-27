export class DraftCommandBus {
    transport;
    constructor(transport) {
        this.transport = transport;
    }
    execute(command) { return this.transport.execute(command); }
    replaceTransport(transport) { this.transport.close(); this.transport = transport; }
    connectionState() { return this.transport.getConnectionState(); }
}
//# sourceMappingURL=draft-command-bus.js.map