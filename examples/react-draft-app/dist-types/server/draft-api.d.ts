import type { Express } from 'express';
import type { DraftRepository } from './draft-repository.js';
export declare function registerDraftApi(app: Express, repository: DraftRepository, isCollaborative: (id: string) => boolean): void;
//# sourceMappingURL=draft-api.d.ts.map