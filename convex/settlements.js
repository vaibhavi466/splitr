import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import { logActivityInternal } from "./activity";

/* ============================================================================
 *  MUTATION: createSettlement
 * -------------------------------------------------------------------------- */

export const createSettlement = mutation({
  args: {
    amount: v.number(), // must be > 0
    note: v.optional(v.string()),
    paidByUserId: v.id("users"),
    receivedByUserId: v.id("users"),
    groupId: v.optional(v.id("groups")), // null when settling one‑to‑one
    relatedExpenseIds: v.optional(v.array(v.id("expenses"))),
  },
  handler: async (ctx, args) => {
    // Use centralized getCurrentUser function
    const caller = await ctx.runQuery(api.users.getCurrentUser);

    /* ── basic validation ────────────────────────────────────────────────── */
    if (args.amount <= 0) throw new Error("Amount must be positive");
    if (args.paidByUserId === args.receivedByUserId) {
      throw new Error("Payer and receiver cannot be the same user");
    }
    if (
      caller._id !== args.paidByUserId &&
      caller._id !== args.receivedByUserId
    ) {
      throw new Error("You must be either the payer or the receiver");
    }

    /* ── group check (if provided) ───────────────────────────────────────── */
    if (args.groupId) {
      const group = await ctx.db.get(args.groupId);
      if (!group) throw new Error("Group not found");

      const isMember = (uid) => group.members.some((m) => m.userId === uid);
      if (!isMember(args.paidByUserId) || !isMember(args.receivedByUserId)) {
        throw new Error("Both parties must be members of the group");
      }
    }

    /* ── insert ──────────────────────────────────────────────────────────── */
    const payer = await ctx.db.get(args.paidByUserId);
    const receiver = await ctx.db.get(args.receivedByUserId);
    const payerName = payer?.name || "Someone";
    const receiverName = receiver?.name || "Someone";

    const settlementId = await ctx.db.insert("settlements", {
      amount: args.amount,
      note: args.note,
      date: Date.now(), // server‑side timestamp
      paidByUserId: args.paidByUserId,
      receivedByUserId: args.receivedByUserId,
      groupId: args.groupId,
      relatedExpenseIds: args.relatedExpenseIds,
      createdBy: caller._id,
    });

    await logActivityInternal(ctx, {
      action: "settlement_created",
      description: `${payerName} settled with ${receiverName}: paid ₹${args.amount.toFixed(2)}`,
      userId: caller._id,
      groupId: args.groupId,
    });

    return settlementId;
  },
});

/* ============================================================================
 *  QUERY: getSettlementData
 *  Returns the balances relevant for a page routed as:
 *      /settlements/[entityType]/[entityId]
 *  where entityType ∈ {"user","group"}
 * -------------------------------------------------------------------------- */

export const getSettlementData = query({
  args: {
    entityType: v.string(), // "user"  | "group"
    entityId: v.string(), // Convex _id (string form) of the user or group
  },
  handler: async (ctx, args) => {
    // Use centralized getCurrentUser function
    const me = await ctx.runQuery(api.users.getCurrentUser);

    if (args.entityType === "user") {
      /* ─────────────────────────────────────────────── user page */
      const other = await ctx.db.get(args.entityId);
      if (!other) throw new Error("User not found");

      // ---------- gather expenses where either of us paid or appears in splits
      const myExpenses = (await ctx.db
        .query("expenses")
        .withIndex("by_user_and_group", (q) =>
          q.eq("paidByUserId", me._id).eq("groupId", undefined)
        )
        .collect())
        .filter((e) => !e.isDeleted);

      const otherUserExpenses = (await ctx.db
        .query("expenses")
        .withIndex("by_user_and_group", (q) =>
          q.eq("paidByUserId", other._id).eq("groupId", undefined)
        )
        .collect())
        .filter((e) => !e.isDeleted);

      const expenses = [...myExpenses, ...otherUserExpenses];

      let owed = 0; // they owe me
      let owing = 0; // I owe them

      for (const exp of expenses) {
        const involvesMe =
          exp.paidByUserId === me._id ||
          exp.splits.some((s) => s.userId === me._id);
        const involvesThem =
          exp.paidByUserId === other._id ||
          exp.splits.some((s) => s.userId === other._id);
        if (!involvesMe || !involvesThem) continue;

        // case 1: I paid
        if (exp.paidByUserId === me._id) {
          const split = exp.splits.find(
            (s) => s.userId === other._id && !s.paid
          );
          if (split) owed += split.amount;
        }

        // case 2: They paid
        if (exp.paidByUserId === other._id) {
          const split = exp.splits.find((s) => s.userId === me._id && !s.paid);
          if (split) owing += split.amount;
        }
      }

      const mySettlements = await ctx.db
        .query("settlements")
        .withIndex("by_user_and_group", (q) =>
          q.eq("paidByUserId", me._id).eq("groupId", undefined)
        )
        .collect();

      const otherUserSettlements = await ctx.db
        .query("settlements")
        .withIndex("by_user_and_group", (q) =>
          q.eq("paidByUserId", other._id).eq("groupId", undefined)
        )
        .collect();

      const settlements = [...mySettlements, ...otherUserSettlements];

      for (const st of settlements) {
        if (st.paidByUserId === me._id) {
          // I paid them ⇒ my owing goes down
          owing = Math.max(0, owing - st.amount);
        } else {
          // They paid me ⇒ their owing goes down
          owed = Math.max(0, owed - st.amount);
        }
      }

      return {
        type: "user",
        counterpart: {
          userId: other._id,
          name: other.name,
          email: other.email,
          imageUrl: other.imageUrl,
        },
        youAreOwed: owed,
        youOwe: owing,
        netBalance: owed - owing, // + => you should receive, − => you should pay
      };
    } else if (args.entityType === "group") {
      /* ──────────────────────────────────────────────────────── group page */
      const group = await ctx.db.get(args.entityId);
      if (!group) throw new Error("Group not found");

      const isMember = group.members.some((m) => m.userId === me._id);
      if (!isMember) throw new Error("You are not a member of this group");

      // ---------- expenses for this group
      const expenses = (await ctx.db
        .query("expenses")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .collect())
        .filter((e) => !e.isDeleted);

      const ids = group.members.map((m) => m.userId);

      // ---------- initialise per‑member net totals
      const totals = Object.fromEntries(ids.map((id) => [id, 0]));

      // ---------- apply expenses
      for (const exp of expenses) {
        if (exp.payments && exp.payments.length > 0) {
          exp.payments.forEach((p) => {
            totals[p.userId] += p.amount;
          });
        } else {
          totals[exp.paidByUserId] += exp.amount;
        }

        exp.splits.forEach((s) => {
          totals[s.userId] -= s.amount;
        });
      }

      // ---------- apply settlements within the group
      const settlements = await ctx.db
        .query("settlements")
        .filter((q) => q.eq(q.field("groupId"), group._id))
        .collect();

      for (const st of settlements) {
        totals[st.paidByUserId] += st.amount;
        totals[st.receivedByUserId] -= st.amount;
      }

      // ---------- Debt Simplification (Graph Optimization)
      const creditors = []; // { id, amount }
      const debtors = []; // { id, amount }

      for (const [id, net] of Object.entries(totals)) {
        const roundedNet = Math.round(net * 100) / 100;
        if (roundedNet > 0.01) {
          creditors.push({ id, amount: roundedNet });
        } else if (roundedNet < -0.01) {
          debtors.push({ id, amount: Math.abs(roundedNet) });
        }
      }

      // Sort descending to settle largest first
      creditors.sort((a, b) => b.amount - a.amount);
      debtors.sort((a, b) => b.amount - a.amount);

      // Initialize simplified pairwise ledger
      const simplifiedLedger = {};
      ids.forEach((a) => {
        simplifiedLedger[a] = {};
        ids.forEach((b) => {
          if (a !== b) simplifiedLedger[a][b] = 0;
        });
      });

      let debtIndex = 0;
      let credIndex = 0;

      while (debtIndex < debtors.length && credIndex < creditors.length) {
        const debtor = debtors[debtIndex];
        const creditor = creditors[credIndex];

        const amountToSettle = Math.min(debtor.amount, creditor.amount);

        simplifiedLedger[debtor.id][creditor.id] = Math.round(amountToSettle * 100) / 100;

        debtor.amount -= amountToSettle;
        creditor.amount -= amountToSettle;

        if (debtor.amount < 0.01) {
          debtIndex++;
        }
        if (creditor.amount < 0.01) {
          credIndex++;
        }
      }

      // Shape the balances matching the query's output format
      const balances = {};
      group.members.forEach((m) => {
        if (m.userId !== me._id) {
          balances[m.userId] = {
            owed: simplifiedLedger[me._id][m.userId] || 0,
            owing: simplifiedLedger[m.userId][me._id] || 0,
          };
        }
      });

      // ---------- shape result list
      const members = await Promise.all(
        Object.keys(balances).map((id) => ctx.db.get(id))
      );

      const list = Object.keys(balances).map((uid) => {
        const m = members.find((u) => u && u._id === uid);
        const { owed, owing } = balances[uid];
        return {
          userId: uid,
          name: m?.name || "Unknown",
          imageUrl: m?.imageUrl,
          youAreOwed: owed,
          youOwe: owing,
          netBalance: owed - owing,
        };
      });

      return {
        type: "group",
        group: {
          id: group._id,
          name: group.name,
          description: group.description,
        },
        balances: list,
      };
    }

    /* ── unsupported entityType ──────────────────────────────────────────── */
    throw new Error("Invalid entityType; expected 'user' or 'group'");
  },
});