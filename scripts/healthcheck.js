/** Quick self check:  npm run healthcheck */
const { config } = require("../src/config");
const client = require("../src/telegram/client");
const provider = require("../src/services/likes-api");
const store = require("../src/db/store");

(async () => {
  console.log("\n=== FF LIKES health check ===\n");
  const db = store.load();
  console.log(`port            : ${config.port}`);
  console.log(`admins          : ${db.admins.length}`);
  console.log(`codes           : ${db.coupons.length}`);
  console.log(`deliveries       : ${db.sends.length}`);
  console.log(`likes api        : ${JSON.stringify(provider.apiStatus())}`);
  if (config.telegram.enabled) {
    const tg = await client.selfTest();
    for (const s of tg.steps) console.log(`telegram ${s.ok ? "OK " : "FAIL"} ${s.name}: ${s.info}`);
  } else {
    console.log("telegram       : disabled");
  }
  console.log("");
  process.exit(0);
})();
