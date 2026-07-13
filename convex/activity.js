import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// Helper function to log activity (callable internally inside other mutations)
export async function logActivityInternal(ctx, { action, description, userId, groupId }) {
  await ctx.db.insert("activityLogs", {
    action,
    description,
    userId,
    groupId,
    timestamp: Date.now(),
  });
}

// Mutation to write a log (optional, exposes logging as a mutation if needed)
export const logActivity = mutation({
  args: {
    action: v.string(),
    description: v.string(),
    groupId: v.optional(v.id("groups")),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(api.users.getCurrentUser);
    await logActivityInternal(ctx, {
      action: args.action,
      description: args.description,
      userId: user._id,
      groupId: args.groupId,
    });
  },
});

// Query to get recent activities for a group or user
export const getActivities = query({
  args: {
    groupId: v.optional(v.id("groups")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit || 20;

    let logs = [];
    if (args.groupId) {
      logs = await ctx.db
        .query("activityLogs")
        .withIndex("by_group", (q) => q.eq("groupId", args.groupId))
        .collect();
    } else {
      logs = await ctx.db.query("activityLogs").collect();
    }

    // Sort by timestamp descending and apply limit
    logs.sort((a, b) => b.timestamp - a.timestamp);
    const recentLogs = logs.slice(0, limit);

    // Fetch user details for each log
    const enrichedLogs = await Promise.all(
      recentLogs.map(async (log) => {
        const user = await ctx.db.get(log.userId);
        return {
          ...log,
          userName: user?.name || "Unknown",
          userImageUrl: user?.imageUrl,
        };
      })
    );

    return enrichedLogs;
  },
});
