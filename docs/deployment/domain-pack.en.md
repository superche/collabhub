# External Domain Packs

The standalone and distributed images do not require application rules to be compiled into CollabHub. Both support one of two read-only mounted files, so development and production use the same Domain Pack.

## JSON configuration

Use JSON when the application needs the built-in field, entity, list, and strict transaction behaviors.

```bash
docker run --rm --network host \
  -v "$PWD/deploy/domain-pack/domain-pack.example.json:/config/domain-pack.json:ro" \
  -e COLLABHUB_DOMAIN_PACK_CONFIG=/config/domain-pack.json \
  -e COLLABHUB_ROLE=gateway \
  -e DATABASE_URL=... -e REDIS_URL=... -e INTERNAL_TOKEN=... \
  -e JWT_JWKS_URL=... -e JWT_ISSUER=... -e JWT_AUDIENCE=... \
  ghcr.io/superche/collabhub:0.1.3
```

The file controls:

- Domain Pack ID and schema version;
- initial document JSON (`"$documentId"` is replaced for each room);
- which built-in JSON strategies are enabled;
- whether each stale operation is resolved, rejected, or asked to reload.

Configuration is limited to 1 MiB, validated before the server starts, and cannot run code.

## Trusted ESM module

Use an ESM module for linked fields, validation, or application-specific conflict handling.

```bash
docker run --rm --network host \
  -v "$PWD/deploy/domain-pack/domain-pack.example.mjs:/config/domain-pack.mjs:ro" \
  -e COLLABHUB_DOMAIN_PACK_MODULE=/config/domain-pack.mjs \
  ... \
  ghcr.io/superche/collabhub:0.1.3
```

The module exports a Domain Pack object or a factory. The runtime injects `jsonStrategies` and `defineDomainPack`, so the mounted module needs no package imports. See the [linked-field example](../../deploy/domain-pack/domain-pack.example.mjs).

An ESM module is trusted server code, not a sandbox. Review and sign it, mount it read-only, and deploy the same immutable content to every Gateway and Worker. Set only one of `COLLABHUB_DOMAIN_PACK_CONFIG` and `COLLABHUB_DOMAIN_PACK_MODULE`.

The AWS and Alibaba Cloud Terraform stacks accept either `domain_pack_config_json` or `domain_pack_module_source` and distribute the selected file to every VM. The standalone image also exposes `/config`; mount the same file there when testing locally.
