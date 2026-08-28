# @collabhub/create-react

Add CollabHub to an existing React app without editing its components:

```bash
npx @collabhub/create-react@0.2.0 init .
npm install
npm run collabhub:doctor
```

Customize `collabhub.model.ts`, start the generated service, then run `npm run collabhub:verify` for a two-client linked-update check.

To create a standalone learning app instead:

```bash
npm create @collabhub/react@0.2.0 my-collab-app
cd my-collab-app
npm install
npm run dev
```

Both paths expose only `@collabhub/client-core` and `@collabhub/server-ws`, and include a service Dockerfile.
