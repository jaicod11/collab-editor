# infra/

**This directory is the local development stack. It is not deployment
infrastructure.**

The deployment target is Render (backend) and Vercel (frontend). Both terminate
TLS, route traffic, and supply their own process supervision, so there is no
layer here that runs in production. Managed MongoDB (Atlas) and Redis (Upstash)
are configured through their own dashboards, not through files in this repo.

## What is here

| File | Purpose |
|---|---|
| `docker-compose.dev.yml` | Local MongoDB + Redis. The only supported way to run this stack locally. |
| `redis.dev.conf` | Redis configuration for that stack. Mounted, loaded, and verified in force. |

Start it with:

```bash
docker compose -f infra/docker-compose.dev.yml up -d
```

Ports are deliberately non-default (`27018`, `6380`) and bound to `127.0.0.1`,
so a local run can never be reached from another machine or mistaken for a real
deployment. See `server/.env.local.example`.

## What was removed, and why

Three files were deleted in Phase 8 rather than repaired. Each described an
architecture that does not exist and had never run.

**`nginx.conf`** — a reverse proxy with TLS termination, `ip_hash` sticky
sessions and three upstream Node instances. Render routes traffic straight to
the container; there is nowhere to insert a proxy, so this would never have
served a request. It was also wrong in ways nobody noticed precisely *because*
it never ran: three upstreams when one backend exists, so most requests would
have hit dead ports until health checks ejected them; a nested
`location ~* \.(js|css)$` block whose own `add_header` silently discarded the
four security headers set in the parent, per nginx's header inheritance rules;
and `limit_conn 10` keyed on source IP, which would have capped an entire office
behind one NAT at ten concurrent editor sessions on a WebSocket application.

Its premise was untrue as well. The README claimed horizontal scaling "out of
the box" via `@socket.io/redis-adapter` — that package is not installed. The
multi-node topology the config described could not have worked.

**`redis.conf`** — 97 lines of tuning that Redis rejects outright. Directives
carried trailing `#` comments on the same line, which is a fatal parse error:

```
*** FATAL CONFIG FILE ERROR (Redis 7.2.15) ***
Reading the configuration file, at line 40
>>> 'save 900 1      # save after 900s if at least 1 key changed'
Invalid save parameters
```

It was never mounted by any compose file, so nothing had ever surfaced this.
It also set `bind 127.0.0.1 ::1`, which inside a container binds the
*container's* loopback and makes a published port unreachable. Production Redis
is Upstash, a managed service that takes no `redis.conf` at all.

**`docker-compose.yml`** — its own header read "Local development
infrastructure", which is what `docker-compose.dev.yml` now does properly. It
ran MongoDB with no authentication and Redis with no password, both published on
`0.0.0.0`, which on any host with a routable interface is an unauthenticated
database on the public internet. Keeping a second, insecure compose file next to
the working one is a copy-paste hazard with no upside.

Deployment is documented in [`DEPLOYMENT.md`](../DEPLOYMENT.md) at the repo root.
