import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    name: v.string(),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    tokenIdentifier: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    isPlaceholder: v.optional(v.boolean()),
  })
  .index("by_token", ["tokenIdentifier"])
  .index("by_email", ["email"])
  .index("by_phone", ["phone"])
  .searchIndex("search_name", { searchField: "name" })
  .searchIndex("search_email", { searchField: "email" }),

  expenses:defineTable({
    description: v.string(),
    amount: v.number(),
    category: v.optional(v.string()),
    date: v.number(),
    paidByUserId: v.id("users"),
    splitType: v.string(), // "equal", "percentage", "exact", "ratio"
    splits: v.array(
      v.object({
        userId: v.id("users"),
        amount: v.number(),
        paid: v.boolean(),
      })
    ),
    groupId: v.optional(v.id("groups")),
    notes: v.optional(v.string()),
    receiptUrl: v.optional(v.string()),
    currency: v.optional(v.string()),
    isDeleted: v.optional(v.boolean()),
    supersededBy: v.optional(v.id("expenses")),
    reversesExpenseId: v.optional(v.id("expenses")),
    payments: v.optional(
      v.array(
        v.object({
          userId: v.id("users"),
          amount: v.number(),
        })
      )
    ),
    createdBy: v.id("users"),
  })
    .index("by_group",["groupId"])
    .index("by_user_and_group",["paidByUserId","groupId"])
    .index("by_date", ["date"]),

  groups: defineTable({
    name: v.string(),
    description: v.optional(v.string()),
    createdBy: v.id("users"),
    currency: v.optional(v.string()),
    createdAt: v.optional(v.number()),
    isArchived: v.optional(v.boolean()),
    members: v.array(
      v.object({
        userId: v.id("users"),
        role: v.string(),
        joinedAt: v.number(),
      })
    ),
  }),

  settlements: defineTable({
    amount: v.number(),
    note: v.optional(v.string()),
    date: v.number(),
    paidByUserId: v.id("users"),
    receivedByUserId: v.id("users"),
    groupId: v.optional(v.id("groups")),
    relatedExpenseIds: v.optional(v.array(v.id("expenses"))),
    createdBy: v.id("users"),
  })
    .index("by_group",["groupId"])
    .index("by_user_and_group",["paidByUserId","groupId"])
    .index("by_receiver_and_group",["receivedByUserId","groupId"])
    .index("by_date", ["date"]),

  activityLogs: defineTable({
    action: v.string(), // "expense_created", "expense_edited", "expense_deleted", "settlement_created"
    description: v.string(),
    userId: v.id("users"),
    groupId: v.optional(v.id("groups")),
    timestamp: v.number(),
  })
    .index("by_group", ["groupId"])
    .index("by_user", ["userId"])
    .index("by_timestamp", ["timestamp"]),

});