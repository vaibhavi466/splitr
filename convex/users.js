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

    // Look for matching placeholder user by phone or email
    let placeholderUser = null;
    if (identity.phoneNumber) {
      placeholderUser = await ctx.db
        .query("users")
        .withIndex("by_phone", (q) => q.eq("phone", identity.phoneNumber))
        .filter((q) => q.eq(q.field("isPlaceholder"), true))
        .first();
    }
    if (!placeholderUser && email) {
      placeholderUser = await ctx.db
        .query("users")
        .withIndex("by_email", (q) => q.eq("email", email))
        .filter((q) => q.eq(q.field("isPlaceholder"), true))
        .first();
    }

    if (placeholderUser) {
      console.log("Merging placeholder user:", placeholderUser._id);
      await ctx.db.patch(placeholderUser._id, {
        tokenIdentifier: subject,
        email: email || placeholderUser.email,
        name: name || placeholderUser.name,
        imageUrl: picture || placeholderUser.imageUrl,
        isPlaceholder: false, // no longer a placeholder
      });
      return placeholderUser._id;
    }

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
      phone: identity.phoneNumber,
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

// ──────────────── 4. Create placeholder user (unregistered) ────────────────
export const createPlaceholderUser = mutation({
  args: {
    name: v.string(),
    phone: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if user already exists by phone
    const existing = await ctx.db
      .query("users")
      .withIndex("by_phone", (q) => q.eq("phone", args.phone))
      .first();

    if (existing) {
      return existing._id;
    }

    const newPlaceholderId = await ctx.db.insert("users", {
      name: args.name,
      phone: args.phone,
      isPlaceholder: true,
    });

    console.log("Placeholder user created:", newPlaceholderId);
    return newPlaceholderId;
  },
});
