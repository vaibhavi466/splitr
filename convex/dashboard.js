import { query } from "./_generated/server";

// Utility: fetch current user document
async function getCurrentUser(ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not authenticated");

  const user = await ctx.db
    .query("users")
    .withIndex("by_token", (q) => q.eq("tokenIdentifier", identity.subject))
    .unique();

  if (!user) throw new Error("User not found");
  return user;
}

// Get user balances
export const getUserBalances = query({
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    // 1. Fetch 1-to-1 expenses
    const expenses = (await ctx.db.query("expenses").collect()).filter(
      (e) =>
        !e.isDeleted &&
        !e.groupId &&
        (e.paidByUserId === user._id ||
          e.splits.some((s) => s.userId === user._id))
    );

    let youOwe = 0;
    let youAreOwed = 0;
    const balanceByUser = {};

    for (const e of expenses) {
      // Find the counterpart (since it's a 1-on-1 expense, there is only one other participant)
      const counterpartId = e.splits.find((s) => s.userId !== user._id)?.userId || e.paidByUserId;
      if (!counterpartId || counterpartId === user._id) continue;

      let myPaid = 0;
      if (e.payments && e.payments.length > 0) {
        const p = e.payments.find((py) => py.userId === user._id);
        if (p) myPaid = p.amount;
      } else if (e.paidByUserId === user._id) {
        myPaid = e.amount;
      }

      const mySplit = e.splits.find((s) => s.userId === user._id);
      const myShare = mySplit ? mySplit.amount : 0;

      const myNet = myPaid - myShare;
      if (myNet > 0) {
        (balanceByUser[counterpartId] ??= { owed: 0, owing: 0 }).owed += myNet;
      } else if (myNet < 0) {
        (balanceByUser[counterpartId] ??= { owed: 0, owing: 0 }).owing += Math.abs(myNet);
      }
    }

    // 1-to-1 settlements
    const settlements = (await ctx.db.query("settlements").collect()).filter(
      (s) =>
        !s.groupId &&
        (s.paidByUserId === user._id || s.receivedByUserId === user._id)
    );

    for (const s of settlements) {
      if (s.paidByUserId === user._id) {
        (balanceByUser[s.receivedByUserId] ??= { owed: 0, owing: 0 }).owing -= s.amount;
      } else {
        (balanceByUser[s.paidByUserId] ??= { owed: 0, owing: 0 }).owed -= s.amount;
      }
    }

    // 2. Fetch Group balances
    const allGroups = await ctx.db.query("groups").collect();
    const groups = allGroups.filter((g) =>
      g.members.some((m) => m.userId === user._id)
    );

    for (const group of groups) {
      // Get all active expenses for this group
      const groupExpenses = (await ctx.db
        .query("expenses")
        .withIndex("by_group", (q) => q.eq("groupId", group._id))
        .collect())
        .filter((e) => !e.isDeleted);

      const groupSettlements = await ctx.db
        .query("settlements")
        .filter((q) => q.eq(q.field("groupId"), group._id))
        .collect();

      const ids = group.members.map((m) => m.userId);
      const totals = Object.fromEntries(ids.map((id) => [id, 0]));

      // apply group expenses
      for (const exp of groupExpenses) {
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

      // apply group settlements
      for (const st of groupSettlements) {
        totals[st.paidByUserId] += st.amount;
        totals[st.receivedByUserId] -= st.amount;
      }

      // Debt simplification (graph optimization) to get simplified group debts
      const creditors = [];
      const debtors = [];
      for (const [id, net] of Object.entries(totals)) {
        const roundedNet = Math.round(net * 100) / 100;
        if (roundedNet > 0.01) {
          creditors.push({ id, amount: roundedNet });
        } else if (roundedNet < -0.01) {
          debtors.push({ id, amount: Math.abs(roundedNet) });
        }
      }

      creditors.sort((a, b) => b.amount - a.amount);
      debtors.sort((a, b) => b.amount - a.amount);

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

        if (debtor.amount < 0.01) debtIndex++;
        if (creditor.amount < 0.01) credIndex++;
      }

      // Add user's simplified group debts to balanceByUser
      ids.forEach((otherId) => {
        if (otherId === user._id) return;
        const groupOwed = simplifiedLedger[user._id][otherId] || 0;
        const groupOwing = simplifiedLedger[otherId][user._id] || 0;
        if (groupOwed > 0) {
          (balanceByUser[otherId] ??= { owed: 0, owing: 0 }).owed += groupOwed;
        }
        if (groupOwing > 0) {
          (balanceByUser[otherId] ??= { owed: 0, owing: 0 }).owing += groupOwing;
        }
      });
    }

    // 3. Compile final lists
    const youOweList = [];
    const youAreOwedByList = [];

    for (const [uid, { owed, owing }] of Object.entries(balanceByUser)) {
      const net = owed - owing;
      const roundedNet = Math.round(net * 100) / 100;
      if (Math.abs(roundedNet) < 0.01) continue;

      const counterpart = await ctx.db.get(uid);
      const base = {
        userId: uid,
        name: counterpart?.name ?? "Unknown",
        imageUrl: counterpart?.imageUrl,
        amount: Math.abs(roundedNet),
      };
      if (roundedNet > 0) {
        youAreOwed += roundedNet;
        youAreOwedByList.push(base);
      } else {
        youOwe += Math.abs(roundedNet);
        youOweList.push(base);
      }
    }

    youOweList.sort((a, b) => b.amount - a.amount);
    youAreOwedByList.sort((a, b) => b.amount - a.amount);

    // Fetch recent expenses
    const recentExpenses = (await ctx.db.query("expenses").collect())
      .filter(
        (e) =>
          !e.isDeleted &&
          (e.paidByUserId === user._id ||
            e.splits.some((s) => s.userId === user._id))
      )
      .sort((a, b) => b.date - a.date)
      .slice(0, 5);

    // Pending settlements (counterparts with non-zero balances)
    const pendingSettlements = [...youOweList, ...youAreOwedByList];

    return {
      youOwe,
      youAreOwed,
      totalBalance: youAreOwed - youOwe,
      oweDetails: {
        youOwe: youOweList,
        youAreOwedBy: youAreOwedByList,
      },
      recentExpenses,
      pendingSettlements,
    };
  },
});

export const getTotalSpent = query({
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1).getTime();

    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_date", (q) => q.gte("date", startOfYear))
      .collect();

    const userExpenses = expenses.filter(
      (expense) =>
        !expense.isDeleted &&
        (expense.paidByUserId === user._id ||
          expense.splits.some((split) => split.userId === user._id))
    );

    let totalSpent = 0;
    userExpenses.forEach((expense) => {
      const userSplit = expense.splits.find(
        (split) => split.userId === user._id
      );
      if (userSplit) totalSpent += userSplit.amount;
    });

    return totalSpent;
  },
});

export const getMonthlySpending = query({
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    const currentYear = new Date().getFullYear();
    const startOfYear = new Date(currentYear, 0, 1).getTime();

    const expenses = await ctx.db
      .query("expenses")
      .withIndex("by_date", (q) => q.gte("date", startOfYear))
      .collect();

    const userExpenses = expenses.filter(
      (expense) =>
        !expense.isDeleted &&
        (expense.paidByUserId === user._id ||
          expense.splits.some((split) => split.userId === user._id))
    );

    const monthlyTotals = {};
    for (let i = 0; i < 12; i++) {
      const monthDate = new Date(currentYear, i, 1);
      monthlyTotals[monthDate.getTime()] = 0;
    }

    userExpenses.forEach((expense) => {
      const date = new Date(expense.date);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1).getTime();
      const userSplit = expense.splits.find((split) => split.userId === user._id);
      if (userSplit) {
        monthlyTotals[monthStart] += userSplit.amount;
      }
    });

    const result = Object.entries(monthlyTotals).map(([month, total]) => ({
      month: parseInt(month),
      total,
    }));

    result.sort((a, b) => a.month - b.month);
    return result;
  },
});

export const getUserGroups = query({
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);

    const allGroups = await ctx.db.query("groups").collect();
    const groups = allGroups.filter((group) =>
      !group.isArchived &&
      group.members.some((m) => m.userId === user._id)
    );

    const enhancedGroups = await Promise.all(
      groups.map(async (group) => {
        const expenses = (await ctx.db
          .query("expenses")
          .withIndex("by_group", (q) => q.eq("groupId", group._id))
          .collect())
          .filter((e) => !e.isDeleted);

        let balance = 0;
        for (const expense of expenses) {
          let myPaid = 0;
          if (expense.payments && expense.payments.length > 0) {
            const p = expense.payments.find((py) => py.userId === user._id);
            if (p) myPaid = p.amount;
          } else if (expense.paidByUserId === user._id) {
            myPaid = expense.amount;
          }

          const mySplit = expense.splits.find((s) => s.userId === user._id);
          const myShare = mySplit ? mySplit.amount : 0;

          balance += (myPaid - myShare);
        }

        const settlements = await ctx.db
          .query("settlements")
          .filter((q) =>
            q.and(
              q.eq(q.field("groupId"), group._id),
              q.or(
                q.eq(q.field("paidByUserId"), user._id),
                q.eq(q.field("receivedByUserId"), user._id)
              )
            )
          )
          .collect();

        settlements.forEach((settlement) => {
          if (settlement.paidByUserId === user._id) {
            balance += settlement.amount;
          } else {
            balance -= settlement.amount;
          }
        });

        return {
          ...group,
          id: group._id,
          balance,
        };
      })
    );

    return enhancedGroups;
  },
});
