import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Seed multiple test/placeholder users at once.
 * Useful for testing multi-member group creation.
 */
export const seedTestUsers = mutation({
  args: {
    users: v.array(
      v.object({
        name: v.string(),
        phone: v.string(),
        email: v.optional(v.string()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const results = [];
    for (const user of args.users) {
      // Check if exists by phone
      const existing = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phone", user.phone))
        .first();

      if (existing) {
        results.push({ name: user.name, id: existing._id, status: "existing" });
        continue;
      }

      const id = await ctx.db.insert("users", {
        name: user.name,
        phone: user.phone,
        email: user.email,
        isPlaceholder: true,
        tokenIdentifier: `placeholder_${user.phone}`,
      });

      results.push({ name: user.name, id, status: "created" });
    }
    return results;
  },
});

/**
 * Seed a test group with given member IDs directly (bypasses auth, for testing only).
 */
export const seedTestGroup = mutation({
  args: {
    name: v.string(),
    memberIds: v.array(v.id("users")),
    createdByUserId: v.id("users"),
  },
  handler: async (ctx, args) => {
    // Validate all member IDs exist
    for (const id of args.memberIds) {
      const user = await ctx.db.get(id);
      if (!user) throw new Error(`User ${id} not found`);
    }

    const allMemberIds = new Set([args.createdByUserId, ...args.memberIds]);

    const groupId = await ctx.db.insert("groups", {
      name: args.name,
      description: "Test group with 5 members",
      createdBy: args.createdByUserId,
      currency: "INR",
      createdAt: Date.now(),
      members: [...allMemberIds].map((id) => ({
        userId: id,
        role: id === args.createdByUserId ? "admin" : "member",
        joinedAt: Date.now(),
      })),
    });

    return { groupId, memberCount: allMemberIds.size };
  },
});

/**
 * Get all users (for verification)
 */
export const getAllUsers = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.map((u) => ({ id: u._id, name: u.name, email: u.email, isPlaceholder: u.isPlaceholder }));
  },
});
