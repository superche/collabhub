// This file runs as trusted server code. Keep it read-only and review it like application code.
// The runtime injects built-in helpers, so this mounted file needs no node_modules imports.
export default ({ jsonStrategies, defineDomainPack }) => defineDomainPack({
  id: 'app.linked-fields',
  schemaVersion: '1.0',
  strategies: [
    ...jsonStrategies,
    {
      id: 'app.rename-and-touch',
      version: '1.0',
      supports: (operationType) => operationType === 'document.renameAndTouch',
      resolve({ operation }) {
        const title = operation.payload?.title
        if (typeof title !== 'string' || !title.trim()) {
          return { kind: 'reject', reason: { code: 'invalidOperation', message: 'title is required' } }
        }
        return {
          kind: 'accept',
          patches: [
            { op: 'set', path: '/title', value: title },
            { op: 'set', path: '/updatedAt', value: new Date().toISOString() },
          ],
        }
      },
    },
  ],
  operationVersionPolicy: {
    decide({ operation }) {
      return operation.operationType === 'document.renameAndTouch'
        ? { kind: 'resolve' }
        : { kind: 'resync', reason: 'reload before applying this older operation' }
    },
  },
  initialState: (documentId) => ({ id: documentId, title: 'Untitled', updatedAt: null, items: [] }),
})
