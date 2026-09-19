/**
 * Interactive admin creator:  npm run setup
 */
const readline = require("readline");
const auth = require("../src/services/auth");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, (a) => r(a.trim())));

(async () => {
  console.log("\n=== FF LIKES — create admin account ===\n");
  const email = await ask("Admin email: ");
  const password = await ask("Password (min 8 chars): ");
  const r = auth.createAdmin({ email, password, role: "owner" });
  console.log(r.ok ? `\n✅ Admin created: ${email}\n` : `\n❌ ${r.message}\n`);
  rl.close();
  process.exit(r.ok ? 0 : 1);
})();
