// Minimal local reverse proxy used only when the app is exposed through a Cloudflare
// tunnel without Caddy in front: forwards to the app and adds `no-transform` so
// Cloudflare never rewrites HTML (Email Obfuscation would break CSP + hydration).
import http from "node:http";
const target = { host: "127.0.0.1", port: Number(process.env.UPSTREAM_PORT ?? 3201) };
http.createServer((req, res) => {
  const up = http.request({ ...target, method: req.method, path: req.url, headers: req.headers }, (r) => {
    const h = { ...r.headers };
    const cc = String(h["cache-control"] ?? "");
    h["cache-control"] = cc ? (cc.includes("no-transform") ? cc : `${cc}, no-transform`) : "no-transform";
    res.writeHead(r.statusCode ?? 502, h);
    r.pipe(res);
  });
  up.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end("upstream unavailable"); });
  req.pipe(up);
}).listen(Number(process.env.PORT ?? 3200), "127.0.0.1");
