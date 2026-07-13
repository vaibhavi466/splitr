// ESM script to create a 5-member test group via Convex HTTP API
// Run: node scripts/seed_users_http.mjs

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const envContent = fs.readFileSync(envPath, "utf8");
const convexUrl = envContent.match(/NEXT_PUBLIC_CONVEX_URL=(.+)/)[1].trim();
console.log("Convex URL:", convexUrl);

// Vaibhavi's primary user ID (from `npx convex data users`)
const VAIBHAVI_ID = "j570acqeeby6c0j4pypgc5qhsx7j1k8a";

// 5 test placeholder users created earlier
const testUserIds = [
  "j57c4k1h9h5kk9vt7baevc2p518aebzp", // Alice Chen
  "j57bqb4agaxq416rey96mbtkfx8afhq1", // Bob Sharma
  "j577cn8n7eqpa4r9k5nbhkx4an8af92s", // Charlie Roy
  "j57dbyq320pmhspajd9mc07rbs8aefww", // Diana Patel
  "j57eea0gc6mfmp16fkmrc0z9en8afggn", // Ethan Gupta
];

console.log("\n=== TEST: Creating 5-Member Group via seedTestGroup mutation ===");
const res = await fetch(`${convexUrl}/api/mutation`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    path: "seed_test_users:seedTestGroup",
    args: {
      name: "Team Outing (5 Members Test)",
      memberIds: testUserIds,
      createdByUserId: VAIBHAVI_ID,
    },
    format: "json",
  }),
});

const result = await res.json();
console.log("Status:", res.status);
console.log("Result:", JSON.stringify(result, null, 2));

if (result.status === "success") {
  const { groupId, memberCount } = result.value;
  console.log(`\n✅ Group created! ID: ${groupId}, Total members: ${memberCount}`);

  // Verify by fetching the group
  console.log("\n=== TEST: Verify group via getGroupOrMembers query ===");
  const verRes = await fetch(`${convexUrl}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      path: "groups:getGroupOrMembers",
      args: { groupId },
      format: "json",
    }),
  });
  const verResult = await verRes.json();
  console.log("Status:", verRes.status);
  if (verResult.status === "success") {
    const g = verResult.value?.selectedGroup;
    console.log(`Group Name: ${g?.name}`);
    console.log(`Member Count: ${g?.members?.length}`);
    console.log("Members:", g?.members?.map(m => m.name).join(", "));
  } else {
    // getGroupOrMembers requires auth - expected to fail without auth token
    console.log("Note: getGroupOrMembers requires auth (expected for UI-only access)");
    console.log("Raw:", JSON.stringify(verResult, null, 2));
  }
} else {
  console.log("❌ Group creation failed:", JSON.stringify(result, null, 2));
}
