const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const users = [
  { name: "AliceChen", phone: "+919000000001" },
  { name: "BobSharma", phone: "+919000000002" },
  { name: "CharlieRoy", phone: "+919000000003" },
  { name: "DianaPatel", phone: "+919000000004" },
  { name: "EthanGupta", phone: "+919000000005" },
];

const cwd = path.join(__dirname, "..");

for (const user of users) {
  const argsJson = JSON.stringify({ name: user.name, phone: user.phone });
  const tmpPath = path.join(cwd, `_tmp_args_${user.phone.replace(/\+/g, "")}.json`);
  fs.writeFileSync(tmpPath, argsJson, "utf8");

  try {
    // Write a tiny helper that reads from the file
    const helperScript = `
      const args = JSON.parse(require('fs').readFileSync(${JSON.stringify(tmpPath)}, 'utf8'));
      const { ConvexHttpClient } = require('convex/browser');
      const dotenv = require('dotenv');
      dotenv.config({ path: '.env.local' });
      const url = process.env.NEXT_PUBLIC_CONVEX_URL;
      const client = new ConvexHttpClient(url);
      const api = require('./convex/_generated/api').api;
      client.mutation(api.users.createPlaceholderUser, args).then(id => { console.log('CREATED:', id); process.exit(0); }).catch(e => { console.error('ERROR:', e.message); process.exit(1); });
    `;
    const helperPath = path.join(cwd, `_tmp_helper.mjs`);
    fs.writeFileSync(helperPath, helperScript);
    
    const result = execSync(`node _tmp_helper.mjs`, {
      cwd,
      encoding: "utf8",
      timeout: 15000,
    });
    console.log(`✅ Created ${user.name}:`, result.trim());
  } catch (e) {
    console.log(`❌ Failed for ${user.name}:`, (e.stdout || e.stderr || e.message).toString().slice(0, 200));
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    try { fs.unlinkSync(path.join(cwd, "_tmp_helper.mjs")); } catch (_) {}
  }
}
