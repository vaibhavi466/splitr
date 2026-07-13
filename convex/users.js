import { mutation, query } from "./_generated/server"; 
import { v } from "convex/values";

// ──────────────── 1. Store new user (if not exists) ────────────────
export const store = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      console.log("No identity found");
      throw new Error("Called storeUser without authentication");
    }

    const { subject, email, name, picture } = identity;
    console.log("Identity:", { subject, email, name, picture });

    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) => q.eq("tokenIdentifier", subject))
      .unique();

    if (existingUser) {
      console.log("User already exists");
      return existingUser._id;
    }

    const newUserId = await ctx.db.insert("users", {
      tokenIdentifier: subject,
      email,
      name,
      imageUrl: picture,
    });

    console.log("New user inserted:", newUserId);
    return newUserId;
  },
});

// ──────────────── 2. Get current authenticated user ────────────────
export const getCurrentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.subject)
      )
      .first();

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  },
});

// ──────────────── 3. Search users by name/email (exclude self) ────────────────
export const searchUsers = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const currentUser = await ctx.db
      .query("users")
      .withIndex("by_token", (q) =>
        q.eq("tokenIdentifier", identity.subject)
      )
      .first();

    if (!currentUser) throw new Error("User not found");

    if (args.query.length < 2) return [];

    const allUsers = await ctx.db.query("users").collect();

    const seenEmails = new Set();
    const results = [];

    for (const u of allUsers) {
      if (u._id === currentUser._id) continue;

      const nameMatch = u.name?.toLowerCase().includes(args.query.toLowerCase());
      const emailMatch = u.email?.toLowerCase().includes(args.query.toLowerCase());

      if (nameMatch || emailMatch) {
        if (!seenEmails.has(u.email)) {
          seenEmails.add(u.email);
          results.push({
            id: u._id,
            name: u.name,
            email: u.email,
            imageUrl: u.imageUrl,
          });
        }
      }
    }

    return results;
  },
});
