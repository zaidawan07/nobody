# Routes

File-based routing, one file per route. The folder name becomes the path.

| File | Path |
|------|------|
| `index.tsx` | `/` |
| `auth/index.tsx` | `/auth/` |
| `auth/signup.tsx` | `/auth/signup` |
| `_authenticated/route.tsx` | layout guard — requires a signed-in user |
| `_authenticated/agency/` | agency-admin pages, requires `agency_admin` |
| `_authenticated/employee/` | employee pages, requires `employee` |
| `_authenticated/platform/` | super-admin pages, requires `super_admin` |

- `$param` segments (e.g. `$propertyId.tsx`) are wildcards.
- `_leading-underscore` folders are pathless layouts — they wrap children
  without appearing in the URL.
- Add a route, and TanStack Router regenerates `routeTree.gen.ts` on the next
  dev-server reload. Do not edit `routeTree.gen.ts` by hand.

`platform/route.tsx` redirects anyone who is not a super admin; `agency/route.tsx`
and `employee/route.tsx` do the same for their roles. Those guards are UI-level —
the real boundary is row-level security in the database, which every query
goes through.
