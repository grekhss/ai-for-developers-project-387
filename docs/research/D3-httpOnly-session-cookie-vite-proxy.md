# D3: httpOnly session cookie across the Vite dev proxy

- **Ticket:** [#5](https://github.com/grekhss/ai-for-developers-project-386/issues/5) (blocks S2)
- **Date:** 2026-10-15
- **Scope:** can a server-issued httpOnly cookie **Session** work end-to-end given the dev topology — Vite proxying `/api` to Express on `:4000`?

> Location note: this repo has no pre-existing `docs/research/` convention
> (`docs/` currently holds only `docs/agents/`, and `docs/adr/` does not exist yet).
> Findings notes for the wayfinder map therefore live under `docs/research/`, one
> file per ticket, named `D<ticket>-<slug>.md`.

## Verdict

**Yes.** A server-issued `HttpOnly` cookie **Session** works end-to-end in both dev
and prod, with **no change to `vite.config.ts`** and **no CORS configuration**:

1. The browser only ever talks to the Vite dev origin; `/api` is same-origin from the
   browser's point of view, so the default `fetch` credential mode already sends and
   stores the cookie. Prefer an explicit `credentials: 'include'`.
2. Vite's dev proxy **preserves `Set-Cookie` verbatim** (it vendors `http-proxy-3`, and
   `cookieDomainRewrite` / `cookiePathRewrite` are disabled by default). `changeOrigin`
   only rewrites the outgoing request `Host`, not cookies.
3. Dev cookie: host-only, `HttpOnly`, `SameSite=Lax`, `Secure` off, `Path=/`.
   Prod cookie: same but `Secure` on (and `SameSite=Lax` for a same-origin deploy).
4. Express 5 **sends** the cookie with the built-in `res.cookie(...)`; it **reads** it
   only after adding `cookie-parser` (Express has no built-in cookie parsing). Sign it
   (`signed: true`) so the **Role** in the payload cannot be tampered with.

## Topology in this repo

- `calendar-of-meetings/vite.config.ts` — dev proxy: `'/api' → http://localhost:${PORT}`
  (`PORT ?? 4000`) with `changeOrigin: true`.
- `calendar-of-meetings/src/lib/bookings/http.ts` — the SPA calls the API with bare
  `fetch('/api/bookings…')`; `baseUrl = ''` means "current origin".
- `calendar-of-meetings/server/app.ts` — `createApp(repo, options)`; in prod it also
  serves the built `dist/` static files, so the API and SPA share one origin.
- Consequence: **dev and prod are both same-origin.** Dev's origin is the Vite origin
  (e.g. `http://localhost:5173`); prod's origin is the Express origin. Neither is
  cross-origin, so CORS never enters the picture.

## 1. Required `fetch` `credentials` setting

The Fetch Standard defines a request's **credentials mode** as `"omit"`,
`"same-origin"` or `"include"` and says that unless stated otherwise it is
`"same-origin"`:

> `"omit"` — Excludes credentials from this request, and causes any credentials sent
> back in the response to be ignored.
> `"same-origin"` — Include credentials with requests made to same-origin URLs, and use
> any credentials sent back in responses from same-origin URLs.
> `"include"` — Always includes credentials with this request, and always use any
> credentials sent back in the response.
>
> — WHATWG Fetch Standard, "credentials mode" (`fetch.bs`, `RequestCredentials`)

The concrete storage rule is `includeCredentials`: `Set-Cookie` headers are only parsed
and stored when it is true, and the `Cookie` request header is only appended when it is
true:

> Let `includeCredentials` be true if one of
> - `request`'s credentials mode is `"include"`
> - `request`'s credentials mode is `"same-origin"` and `request`'s response tainting is `"basic"`
>
> is true; otherwise false.
> …
> If `includeCredentials` is true, then the user agent should **parse and store response
> `Set-Cookie` headers** given `request` and `response`.
>
> — WHATWG Fetch Standard, "HTTP-network-or-cache fetch"

`response tainting` is `"basic"` exactly when the response is same-origin.

**What this means here:**

| Setting | Dev (through proxy) | Prod (Express serves SPA) | Cross-origin API |
| --- | --- | --- | --- |
| unset (default `same-origin`) | ✅ sends + stores | ✅ sends + stores | ❌ ignored |
| `'same-origin'` | ✅ | ✅ | ❌ |
| `'include'` | ✅ | ✅ | ✅ (needs CORS, below) |
| `'omit'` | ❌ | ❌ | ❌ |

**Recommendation:** pass `credentials: 'include'` explicitly on every API call. It is the
only value that keeps working if the API ever moves to a separate origin, and it is
identical to the default for the same-origin paths we have today, so it costs nothing.
The current bare `fetch` in `src/lib/bookings/http.ts` would technically work already
(default = `same-origin`), but relying on the default is the fragile part — a single
`credentials: 'omit'` silently disables the session.

MDN states the intent plainly:

> By default, credentials are only included in same-origin requests. To customize this
> behavior, as well as to control whether the browser respects any **`Set-Cookie`**
> response headers, set the `credentials` option…
> `omit`: never send credentials in the request or include credentials in the response.
>
> — MDN, "Using the Fetch API → Including credentials"

`credentials` must be set per request; it cannot be defaulted globally for `fetch`
(there is no `fetch` defaults object). Both calls in `http.ts` (`list` and `create`) need
it.

### If the API is ever cross-origin

Then `credentials: 'include'` **and** server CORS headers are required together:
`Access-Control-Allow-Credentials: true` and an explicit
`Access-Control-Allow-Origin: <client origin>` (never `*`). Also note:

> if a cookie's `SameSite` attribute is set to `Strict` or `Lax`, then the cookie will
> not be sent cross-site, even if `credentials` is set to `include`.
>
> — MDN, "Using the Fetch API → Including credentials"

So a cross-site API would additionally force `SameSite=None; Secure` on the cookie. That
is **not** our situation and is worth avoiding.

## 2. Does the Vite dev proxy preserve `Set-Cookie`?

**Yes — verbatim, out of the box.** Three independent confirmations:

1. **Docs.** Vite's `server.proxy` "Extends [`http-proxy-3`](https://github.com/sagemathinc/http-proxy-3#options)."
   — Vite server options docs, `server.proxy`.
   `cookieDomainRewrite` / `cookiePathRewrite` are `http-proxy-3` options that default to
   `false` (rewriting disabled):
   > `cookieDomainRewrite`: rewrites domain of `set-cookie` headers. Possible values:
   > `false` (default): disable cookie rewriting …
   > `cookiePathRewrite`: rewrites path of `set-cookie` headers. … `false` (default):
   > disable cookie rewriting
   > — http-proxy-3 README, "Options"

2. **The vendored source.** This repo's Vite is **8.3.1**, which bundles
   `http-proxy-3@1.23.3`. The outgoing-response pass copies **every** response header —
   including `set-cookie` — to the client response:
   ```js
   // node_modules/vite/dist/node/chunks/node.js (~line 18964)
   function writeHeaders(_req, res, proxyRes, options) {
     const rewriteCookieDomainConfig = …
     const rewriteCookiePathConfig = …
     const setHeader = (key, header) => {
       if (header == void 0) return;
       if (rewriteCookieDomainConfig && key.toLowerCase() === "set-cookie") header = …
       if (rewriteCookiePathConfig  && key.toLowerCase() === "set-cookie") header = …
       res.setHeader(String(key).trim(), header);
     };
     …
     for (const key0 in proxyRes.headers) { … setHeader(key, header); }
   }
   ```
   With both rewrite configs unset (our case), `setHeader('set-cookie', proxyRes.headers['set-cookie'])`
   runs unchanged. Multiple cookies arrive as an array and Node's
   `res.setHeader('set-cookie', [...])` emits multiple `Set-Cookie` headers, so several
   cookies (or a rotated **Session** cookie) survive intact.

3. **`changeOrigin` is unrelated to cookies.** It only rewrites the outgoing request
   `Host`:
   > `changeOrigin`: true/false, Default: false — changes the origin of the host header
   > to the target URL
   > — http-proxy-3 README, "Options"
   ```js
   // node_modules/vite/dist/node/chunks/node.js (~line 18803)
   if (options.changeOrigin) outgoing.headers.host = …
   ```
   It never touches response cookies.

**Conclusion:** no Vite config change is needed. Do **not** add `cookieDomainRewrite`.

### Why host-only cookies still work across ports

Browsers scope cookies by host, not port. Express issues a host-only cookie (no
`Domain`) and the browser receives it from the Vite origin, so it is stored for host
`localhost` and sent back on every subsequent request to `http://localhost:5173/api/...`.
Two practical rules:

- **Never set `Domain` in dev.** If Express set `Domain=localhost:4000`, that is not a
  valid cookie domain. `changeOrigin` makes the proxy's outgoing `Host`
  `localhost:4000`, but the browser only cares about the host it is talking to
  (`localhost`), so a bare host-only cookie is correct.
- **Pick one host and stay on it.** `localhost` and `127.0.0.1` are different cookie
  hosts. Open the app on the same hostname consistently, or expect to log in twice.

## 3. Cookie attributes: dev vs prod

| Attribute | Dev | Prod | Why |
| --- | --- | --- | --- |
| name | `session` (plain) | `session` (plain) | `__Host-` / `__Secure-` prefixes require `Secure`; see below |
| `HttpOnly` | `true` | `true` | JS cannot read it; it is *still sent* on `fetch` |
| `SameSite` | `'lax'` | `'lax'` (or `'strict'`) | all requests are same-site; CSRF hardening |
| `Secure` | `false` (off) | `true` | must be `false` over plain `http` |
| `Domain` | omitted (host-only) | omitted (host-only) | tightest scope; no subdomains in play |
| `Path` | `'/'` | `'/'` | Express default; fine for `/api` too |
| `Max-Age`/`Expires` | omit → session cookie, or a short `Max-Age` | set `Max-Age` | lifetime policy |

Sources / rationale:

- **`HttpOnly`:** "Forbids JavaScript from accessing the cookie… a cookie that has been
  created with `HttpOnly` will still be sent with JavaScript-initiated requests, for
  example, when calling … `fetch()`." — MDN, `Set-Cookie` → `HttpOnly`. This is exactly
  the property we want: XSS cannot read the **Session**, but the SPA still authenticates.
- **`SameSite`:** `Strict` sends only for same-site requests; `Lax` additionally allows
  top-level, safe-method cross-site navigations; `None` requires `Secure`. — MDN,
  `Set-Cookie` → `SameSite`. Since every request is same-origin, `Lax` (or even `Strict`)
  works. `Lax` is the conventional default and avoids surprising the user if we ever add
  a top-level GET navigation into the app.
- **`Secure`:** "Indicates that the cookie is sent to the server only when a request is
  made with the `https:` scheme (except on localhost)… Insecure sites (`http:`) cannot
  set cookies with the `Secure` attribute. The `https:` requirements are ignored when the
  `Secure` attribute is set by localhost." — MDN, `Set-Cookie` → `Secure`. So dev over
  `http://localhost` *would* tolerate `Secure`, but relying on that browser exception is
  fragile; leave `Secure` off in dev and turn it on in prod.
- **`Domain` omitted → host-only:** "If omitted, the cookie is returned only to the host
  that sent it (i.e., it becomes a 'host-only cookie')." — MDN, `Set-Cookie` → `Domain`.
- **Cookie prefixes:** `__Host-` requires `Secure` + `Path=/` + no `Domain`;
  `__Secure-` requires `Secure` from an HTTPS page. Both are unusable on the dev `http`
  origin, and since dev and prod share one implementation, a plain name that toggles
  attributes per environment is the pragmatic choice. (Caveat: onboarding a `__Host-`
  name only for prod means the dev and prod cookie names differ; keep it simple unless
  hardening demands it.) — MDN, `Set-Cookie` → "Cookie prefixes".

### Prod behind TLS termination

If a reverse proxy terminates TLS and forwards `http` to Express, `res.cookie({ secure: true })`
still just writes the `Secure` attribute; the browser (which sees `https`) stores it
correctly. `app.set('trust proxy', 1)` is only needed if code inspects `req.secure` / uses
`express-session` with `cookie.secure: 'auto'`, so that `X-Forwarded-Proto` is honored.
If prod is served over plain `http`, drop `Secure` — otherwise browsers discard the
cookie.

## 4. What the Express side must send and read

### Send

`res.cookie()` is built into Express 5:

> `res.cookie(name, value [, options])` … `value` … an object is serialized as JSON.
> … `path` … Default: `"/"`. … `httpOnly` … `secure` … `sameSite` … `signed`:
> Indicates if the cookie should be signed.
> — Express 5.x API, `res.cookie()`

```ts
// login route, sketch — options come from one shared helper so login/logout match
const sessionCookie = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 14 * 24 * 60 * 60 * 1000, // ms; or omit for a session cookie
  signed: true,
};

res.cookie('session', { role, bookerName }, sessionCookie);
```

`res.clearCookie()` on logout **must pass the same options** (minus `expires`/`maxAge`):

> Web browsers and other compliant clients will only clear the cookie if the given
> `options` is identical to those given to `res.cookie()`.
> — Express 5.x API, `res.clearCookie()`

```ts
res.clearCookie('session', sessionCookie);
```

### Read

Express 5 does **not** parse cookies into `req.cookies` on its own — that is
`cookie-parser`'s job:

> `req.cookies` … **When using cookie-parser middleware**, this property is an object that
> contains cookies sent by the request. … If the cookie has been signed, you have to use
> `req.signedCookies`.
> — Express 5.x API, `req.cookies` / `req.signedCookies`

So wire it up before the routes, with the same secret used for signing:

```ts
import cookieParser from 'cookie-parser';

app.use(cookieParser(secret)); // secret from env, never committed
app.use(createRoutes(repo));   // routes can now read req.signedCookies
```

```ts
// middleware gating /api — register before the /api routes
function requireSession(req, res, next) {
  const session = req.signedCookies?.session; // cookie-parser sets `false` if tampered
  if (!session) {
    res.status(401).json({ error: 'требуется сессия' });
    return;
  }
  res.locals.session = session; // { role, bookerName }
  next();
}
```

- **Signing is mandatory.** `{ role, bookerName }` is the authorization state; without a
  signature a client could rewrite their cookie to `role: 'admin'`. `signed: true` +
  `cookieParser(secret)` passes the value through `req.signedCookies`, and a tampered
  value arrives as `false` (see cookie-parser docs: "Signed cookies that fail signature
  validation will have the value `false`"). Note the docs' own warning: signing prevents
  *tampering*, not *reading* — do not put secrets in the payload.
- **Object payloads are JSON cookies.** `res.cookie(name, <object>, …)` serializes to
  JSON; cookie-parser transparently `JSON.parse`s it, so `req.signedCookies.session` is
  the object again.
- **New dependencies:** `cookie-parser` in `dependencies`, `@types/cookie-parser` in
  `devDependencies` (cookie-parser ships no types — see the Express cookie-parser page).
- **Layer rule:** the middleware and login/logout routes belong in `server/` and must
  import with the `.js` suffix (`./routes.js`); `server/` must not import from `src/`.
- **CSRF:** `SameSite=Lax` blocks cross-site cookie sending for state-changing requests.
  For a shared-password app this is the main defense; an explicit `Origin` check on
  POST/DELETE is a cheap extra.

## 5. Exact changes implied (for the implementing ticket)

- `src/lib/bookings/http.ts`: add `credentials: 'include'` to **both** `fetch` calls.
- `server/`: add `cookie-parser`, a login route that sets the signed httpOnly cookie, a
  logout route using `res.clearCookie`, and a `requireSession` middleware in front of
  `/api`.
- `server/app.ts`: `app.use(cookieParser(secret))` before `createRoutes(repo)`; read the
  secret from env.
- **No** `vite.config.ts` change; **no** CORS headers (same-origin in dev and prod).

## Sources

- WHATWG Fetch Standard — credentials mode definition and `includeCredentials` /
  `Set-Cookie` storage rule: <https://fetch.spec.whatwg.org/#concept-request-credentials-mode>
  and the "HTTP-network-or-cache fetch" / "Set-Cookie header" algorithms
  (source `fetch.bs`).
- MDN — `Request.credentials`: <https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials>
- MDN — Using the Fetch API → Including credentials:
  <https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch#including_credentials>
- MDN — `Set-Cookie` (HttpOnly, Domain/host-only, SameSite, Secure, prefixes):
  <https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie>
- Vite — Server Options → `server.proxy` (extends `http-proxy-3`):
  <https://vite.dev/config/server-options#server-proxy>
- http-proxy-3 — README "Options" (`changeOrigin`, `cookieDomainRewrite`,
  `cookiePathRewrite`): <https://github.com/sagemathinc/http-proxy-3#options>
- This repo's vendored proxy implementation (Vite 8.3.1, `http-proxy-3@1.23.3`):
  `calendar-of-meetings/node_modules/vite/dist/node/chunks/node.js` — `web-outgoing`
  `writeHeaders` (~line 18964) and `changeOrigin` (~line 18803).
- Express 5.x API — `res.cookie()` / `res.clearCookie()`:
  <https://expressjs.com/en/5x/api/response/#rescookie>
- Express 5.x API — `req.cookies` / `req.signedCookies`:
  <https://expressjs.com/en/5x/api/request/#reqcookies>
- Express — cookie-parser middleware:
  <https://expressjs.com/en/resources/middleware/cookie-parser.html>
