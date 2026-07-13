import { query } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";

export const getGroupOrMembers = query({
  args: {
    groupId: v.optional(v.id("groups")), // Optional - if provided, will return details for just this group
  },
  handler: async (ctx, args) => {
    // Use centralized getCurrentUser function
    const currentUser = await ctx.runQuery(api.users.getCurrentUser);

    // Get all groups where the user is a member
    const allGroups = await ctx.db.query("groups").collect();
    const userGroups = allGroups.filter((group) =>
      group.members.some((member) => member.userId === currentUser._id)
    );

    // If a specific group ID is provided, only return details for that group
    if (args.groupId) {
      const selectedGroup = userGroups.find(
        (group) => group._id === args.groupId
      );

      if (!selectedGroup) {
        throw new Error("Group not found or you're not a member");
      }

      // Get all user details for this group's members
      const memberDetails = await Promise.all(
        selectedGroup.members.map(async (member) => {
          const user = await ctx.db.get(member.userId);
          if (!user) return null;

          return {
            id: user._id,
            name: user.name,
            email: user.email,
            imageUrl: user.imageUrl,
            role: member.role,
          };
        })
      );

      // Filter out any null values (in case a user was deleted)
      const validMembers = memberDetails.filter((member) => member !== null);

      // Return selected group with member details
      return {
        selectedGroup: {
          id: selectedGroup._id,
          name: selectedGroup.name,
          description: selectedGroup.description,
          createdBy: selectedGroup.createdBy,
          members: validMembers,
        },
        groups: userGroups.map((group) => ({
          id: group._id,
          name: group.name,
          description: group.description,
          memberCount: group.members.length,
        })),
      };
    } else {
      // Just return the list of groups without member details
      return {
        selectedGroup: null,
        groups: userGroups.map((group) => ({
          id: group._id,
          name: group.name,
          description: group.description,
          memberCount: group.members.length,
        })),
      };
    }
  },
});

// Get expenses for a specific group
export const getGroupExpenses = query({
  args: { groupId: v.id("groups") },
  handler: async (ctx, { groupId }) => {
    // Use centralized getCurrentUser function
    const currentUser = await ctx.runQuery(api.users.getCurrentUser);

    const group = await ctx.db.get(groupId);
    if (!group) throw new Error("Group not found");

    if (!group.members.some((m) => m.userId === currentUser._id))
      throw new Error("You are not a member of this group");

    const expenses = (await ctx.db
      .query("expenses")
      .withIndex("by_group", (q) => q.eq("groupId", groupId))
      .collect())
      .filter((e) => !e.isDeleted);

    const settlements = await ctx.db
      .query("settlements")
      .filter((q) => q.eq(q.field("groupId"), groupId))
      .collect();

    /* ----------  member map ---------- */
    const memberDetails = await Promise.all(
      group.members.map(async (m) => {
        const u = await ctx.db.get(m.userId);
        return { id: u._id, name: u.name, imageUrl: u.imageUrl, role: m.role };
      })
    );
    const ids = memberDetails.map((m) => m.id);

    /* ----------  ledgers ---------- */
    // total net balance
    const totals = Object.fromEntries(ids.map((id) => [id, 0]));

    /* ----------  apply expenses ---------- */
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

    /* ----------  apply settlements ---------- */
    for (const s of settlements) {
      totals[s.paidByUserId] += s.amount;
      totals[s.receivedByUserId] -= s.amount;
    }

    /* ----------  Debt Simplification (Graph Optimization) ---------- */
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

    // Sort descending to settle largest first (greedy approach)
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

    /* ----------  shape the response ---------- */
    const balances = memberDetails.map((m) => ({
      ...m,
      totalBalance: totals[m.id],
      owes: Object.entries(simplifiedLedger[m.id])
        .filter(([, v]) => v > 0)
        .map(([to, amount]) => ({ to, amount })),
      owedBy: ids
        .filter((other) => simplifiedLedger[other][m.id] > 0)
        .map((other) => ({ from: other, amount: simplifiedLedger[other][m.id] })),
    }));

    const userLookupMap = {};
    memberDetails.forEach((member) => {
      userLookupMap[member.id] = member;
    });

    return {
      group: {
        id: group._id,
        name: group.name,
        description: group.description,
      },
      members: memberDetails,
      expenses,
      settlements,
      balances,
      userLookupMap,
    };
  },
});