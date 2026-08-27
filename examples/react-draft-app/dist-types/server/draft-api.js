export function registerDraftApi(app, repository, isCollaborative) {
    app.get('/api/health', (_request, response) => response.json({ ok: true, service: 'collabhub-draft-server' }));
    app.get('/api/drafts/:draftId', async (request, response) => response.json(await repository.get(request.params.draftId)));
    app.post('/api/drafts/:draftId/commands', async (request, response) => {
        const draftId = request.params.draftId;
        if (isCollaborative(draftId))
            return response.status(409).json({ reason: 'collaborativeSessionActive', revision: (await repository.get(draftId)).revision });
        try {
            return response.json({ draft: await repository.execute(draftId, request.body) });
        }
        catch (error) {
            return response.status(409).json({ reason: error instanceof Error ? error.message : String(error), revision: (await repository.get(draftId)).revision });
        }
    });
    app.put('/api/drafts/:draftId', async (request, response) => {
        const draftId = request.params.draftId;
        if (isCollaborative(draftId))
            return response.status(409).json({ reason: 'collaborativeSessionActive', revision: (await repository.get(draftId)).revision });
        const incoming = request.body;
        const current = await repository.get(draftId);
        if (incoming.revision !== current.revision)
            return response.status(409).json({ reason: 'stale revision', revision: current.revision });
        const next = { ...incoming, id: draftId, revision: current.revision + 1 };
        await repository.replace(draftId, next);
        return response.json({ draft: next });
    });
}
//# sourceMappingURL=draft-api.js.map