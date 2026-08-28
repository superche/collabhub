# Kubernetes

`base/` is a cloud-neutral production reference for Kubernetes 1.29+. It expects externally managed PostgreSQL, Redis, TLS, and JWT/JWKS identity.

Before applying, copy `base/` into an environment overlay and replace every placeholder in the Secret and Gateway Origin configuration. Do not commit production secrets.

```bash
kubectl apply -k deploy/kubernetes/base
```

The default ConfigMap mounts a declarative JSON Domain Pack at `/config/domain-pack.json`. Replace it with your own JSON file, or mount a trusted ESM module and set `COLLABHUB_DOMAIN_PACK_MODULE` instead.
