import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

// Create a new expense
export const createExpense = mutation({
  args: {
    description: v.string(),
    amount: v.number(),
    category: v.optional(v.string()),
    date: v.number(), // timestamp
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
  },
  handler: async (ctx, args) => {
    // Use centralized getCurrentUser function
    const user = await ctx.runQuery(api.users.getCurrentUser);

    // Validate expense amount
    if (args.amount <= 0) {
      throw new Error("Expense amount must be a positive number greater than zero");
    }

    // If there's a group, verify the user is a member
    if (args.groupId) {
      const group = await ctx.db.get(args.groupId);
      if (!group) {
        throw new Error("Group not found");
      }

      const isMember = group.members.some(
        (member) => member.userId === user._id
      );
      if (!isMember) {
        throw new Error("You are not a member of this group");
      }
    }

    // Validate each split and compute exact sum using integer cents to prevent floating point inaccuracies
    let sumCents = 0;
    for (const split of args.splits) {
      if (split.amount <= 0) {
        throw new Error("Split amounts must be positive numbers greater than zero");
      }
      // Round to 2 decimal places to ensure fixed precision
      const splitAmount = Math.round(split.amount * 100) / 100;
      sumCents += Math.round(splitAmount * 100);
    }

    const totalCents = Math.round(args.amount * 100);
    if (sumCents !== totalCents) {
      throw new Error(
        `Split amounts sum (₹${(sumCents / 100).toFixed(2)}) must exactly equal the total expense amount (₹${(totalCents / 100).toFixed(2)})`
      );
    }

    // Create the expense
    const expenseId = await ctx.db.insert("expenses", {
      description: args.description,
      amount: Math.round(args.amount * 100) / 100, // round to 2 decimal places
      category: args.category || "Other",
      date: args.date,
      paidByUserId: args.paidByUserId,
      splitType: args.splitType,
      splits: args.splits.map(s => ({
        userId: s.userId,
        amount: Math.round(s.amount * 100) / 100, // round to 2 decimal places
        paid: s.paid,
      })),
      groupId: args.groupId,
      notes: args.notes,
      receiptUrl: args.receiptUrl,
      currency: args.currency || "INR",
      createdBy: user._id,
    });

    return expenseId;
  },
});

// ----------- Expenses Page -----------

// Get expenses between current user and a specific person
export const getExpensesBetweenUsers = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const me = await ctx.runQuery(api.users.getCurrentUser);
    if (me._id === userId) throw new Error("Cannot query yourself");

    /* ───── 1. One-on-one expenses where either user is the payer ───── */
    // Use the compound index (`paidByUserId`,`groupId`) with groupId = undefined
    const myPaid = await ctx.db
      .query("expenses")
      .withIndex("by_user_and_group", (q) =>
        q.eq("paidByUserId", me._id).eq("groupId", undefined)
      )
      .collect();

    const theirPaid = await ctx.db
      .query("expenses")
      .withIndex("by_user_and_group", (q) =>
        q.eq("paidByUserId", userId).eq("groupId", undefined)
      )
      .collect();

    // Merge → candidate set is now just the rows either of us paid for
    const candidateExpenses = [...myPaid, ...theirPaid];

    /* ───── 2. Keep only rows where BOTH are involved (payer or split) ─ */
    const expenses = candidateExpenses.filter((e) => {
      // me is always involved (I’m the payer OR in splits – verified below)
      const meInSplits = e.splits.some((s) => s.userId === me._id);
      const themInSplits = e.splits.some((s) => s.userId === userId);

      const meInvolved = e.paidByUserId === me._id || meInSplits;
      const themInvolved = e.paidByUserId === userId || themInSplits;

      return meInvolved && themInvolved;
    });

    expenses.sort((a, b) => b.date - a.date);

    /* ───── 3. Settlements between the two of us (groupId = undefined) ─ */
    const settlements = await ctx.db
      .query("settlements")
      .filter((q) =>
        q.and(
          q.eq(q.field("groupId"), undefined),
          q.or(
            q.and(
              q.eq(q.field("paidByUserId"), me._id),
              q.eq(q.field("receivedByUserId"), userId)
            ),
            q.and(
              q.eq(q.field("paidByUserId"), userId),
              q.eq(q.field("receivedByUserId"), me._id)
            )
          )
        )
      )
      .collect();

    settlements.sort((a, b) => b.date - a.date);

    /* ───── 4. Compute running balance ──────────────────────────────── */
    let balance = 0;

    for (const e of expenses) {
      if (e.paidByUserId === me._id) {
        const split = e.splits.find((s) => s.userId === userId && !s.paid);
        if (split) balance += split.amount; // they owe me
      } else {
        const split = e.splits.find((s) => s.userId === me._id && !s.paid);
        if (split) balance -= split.amount; // I owe them
      }
    }

    for (const s of settlements) {
      if (s.paidByUserId === me._id)
        balance += s.amount; // I paid them back
      else balance -= s.amount; // they paid me back
    }

    /* ───── 5. Return payload ───────────────────────────────────────── */
    const other = await ctx.db.get(userId);
    if (!other) throw new Error("User not found");

    return {
      expenses,
      settlements,
      otherUser: {
        id: other._id,
        name: other.name,
        email: other.email,
        imageUrl: other.imageUrl,
      },
      balance,
    };
  },
});

// Delete an expense
export const deleteExpense = mutation({
  args: {
    expenseId: v.id("expenses"),
  },
  handler: async (ctx, args) => {
    // Get the current user
    const user = await ctx.runQuery(api.users.getCurrentUser);

    // Get the expense
    const expense = await ctx.db.get(args.expenseId);
    if (!expense) {
      throw new Error("Expense not found");
    }

    // Check if user is authorized to delete this expense
    // Only the creator of the expense or the payer can delete it
    if (expense.createdBy !== user._id && expense.paidByUserId !== user._id) {
      throw new Error("You don't have permission to delete this expense");
    }

    // Delete any settlements that specifically reference this expense
    // Since we can't use array.includes directly in the filter, we'll
    // fetch all settlements and then filter in memory
    const allSettlements = await ctx.db.query("settlements").collect();

    const relatedSettlements = allSettlements.filter(
      (settlement) =>
        settlement.relatedExpenseIds !== undefined &&
        settlement.relatedExpenseIds.includes(args.expenseId)
    );

    for (const settlement of relatedSettlements) {
      // Remove this expense ID from the relatedExpenseIds array
      const updatedRelatedExpenseIds = settlement.relatedExpenseIds.filter(
        (id) => id !== args.expenseId
      );

      if (updatedRelatedExpenseIds.length === 0) {
        // If this was the only related expense, delete the settlement
        await ctx.db.delete(settlement._id);
      } else {
        // Otherwise update the settlement to remove this expense ID
        await ctx.db.patch(settlement._id, {
          relatedExpenseIds: updatedRelatedExpenseIds,
        });
      }
    }

    // Delete the expense
    await ctx.db.delete(args.expenseId);

    return { success: true };
  },
});