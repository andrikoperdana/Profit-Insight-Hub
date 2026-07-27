/**
 * Tests for the landing-page host allowlist (Host header injection / XSS).
 * Run with: node serve.test.js
 *
 * Spawns serve.js on a random port with a fixed ALLOWED_HOSTS and probes it
 * with malicious and legitimate Host / X-Forwarded-Host headers.
 */
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const PORT = 4100 + Math.floor(Math.random() * 500);
const ALLOWED = "app.example.com,app.example.com:8443";

function request(headers) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: PORT, path: "/", headers },
      (res) => {
        let body = "";
        res.on("data", (c) => (body += c));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

async function main() {
  const server = spawn("node", [path.join(__dirname, "serve.js")], {
    env: { ...process.env, PORT: String(PORT), ALLOWED_HOSTS: ALLOWED,
      REPLIT_DOMAINS: "", REPLIT_DEV_DOMAIN: "", REPLIT_EXPO_DEV_DOMAIN: "" },
    stdio: "ignore",
  });
  await new Promise((r) => setTimeout(r, 800));

  let failures = 0;
  const check = (name, cond) => {
    console.log(`${cond ? "PASS" : "FAIL"}: ${name}`);
    if (!cond) failures++;
  };

  try {
    // XSS payload in Host → rejected
    let r = await request({ Host: 'evil.com/"><script>alert(1)</script>' });
    check("XSS payload in Host rejected with 400", r.status === 400);

    // Syntactically valid but non-allowlisted host → rejected
    r = await request({ Host: "evil.com" });
    check("Non-allowlisted valid host rejected with 400", r.status === 400);

    // Non-allowlisted X-Forwarded-Host with allowed Host → falls back to Host
    r = await request({ Host: "app.example.com", "X-Forwarded-Host": "evil.com" });
    check(
      "Bad X-Forwarded-Host falls back to allowed Host",
      r.status === 200 && r.body.includes("exps://app.example.com") && !r.body.includes("evil.com"),
    );

    // Allowed host renders normally
    r = await request({ Host: "app.example.com" });
    check("Allowed host serves landing page", r.status === 200 && r.body.includes("exps://app.example.com"));

    // Allowed host with explicit allowlisted port
    r = await request({ Host: "app.example.com:8443" });
    check("Allowed host:port serves landing page", r.status === 200 && r.body.includes("exps://app.example.com:8443"));

    // Case-insensitive normalization
    r = await request({ Host: "APP.Example.COM" });
    check("Host compare is case-insensitive", r.status === 200 && r.body.includes("exps://app.example.com"));
  } finally {
    server.kill();
  }

  if (failures > 0) {
    console.error(`${failures} test(s) failed`);
    process.exit(1);
  }
  console.log("All tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
