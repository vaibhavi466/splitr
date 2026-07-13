"use client";

import { useState, useEffect, useMemo } from "react";
import { useUser } from "@clerk/nextjs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";

// Utility function to safely compare floats
const areClose = (a, b, tolerance = 0.01) => Math.abs(a - b) < tolerance;

export function SplitSelector({
  type,
  amount,
  participants,
  paidByUserId,
  onSplitsChange,
}) {
  const { user } = useUser();
  const [splits, setSplits] = useState([]);
  const [ratios, setRatios] = useState({});

  // Initialize ratios for participants
  useEffect(() => {
    if (participants.length > 0) {
      setRatios((prev) => {
        const next = { ...prev };
        participants.forEach((p) => {
          if (next[p.id] === undefined) {
            next[p.id] = 1; // default ratio is 1
          }
        });
        return next;
      });
    }
  }, [participants]);

  // stringified ratios to safely use in useEffect dependency array
  const ratiosString = JSON.stringify(ratios);

  // Initialize or update splits based on props and modes
  useEffect(() => {
    if (!amount || amount <= 0 || participants.length === 0) return;

    let newSplits = [];

    if (type === "equal") {
      // Divide using cents and distribute remainder to prevent float errors
      const totalCents = Math.round(amount * 100);
      const shareCents = Math.floor(totalCents / participants.length);
      let remainderCents = totalCents - shareCents * participants.length;

      newSplits = participants.map((p, index) => {
        const extraCent = index < remainderCents ? 1 : 0;
        const finalAmount = (shareCents + extraCent) / 100;
        return {
          userId: p.id,
          name: p.name,
          email: p.email,
          imageUrl: p.imageUrl,
          amount: finalAmount,
          percentage: (finalAmount / amount) * 100,
          paid: p.id === paidByUserId,
        };
      });
    } else if (type === "percentage") {
      const evenPercentage = 100 / participants.length;
      newSplits = participants.map((p) => {
        const pct = evenPercentage;
        const rawAmount = (amount * pct) / 100;
        const roundedAmount = Math.round(rawAmount * 100) / 100;
        return {
          userId: p.id,
          name: p.name,
          email: p.email,
          imageUrl: p.imageUrl,
          amount: roundedAmount,
          percentage: pct,
          paid: p.id === paidByUserId,
        };
      });
    } else if (type === "exact") {
      const evenAmount = amount / participants.length;
      newSplits = participants.map((p) => {
        const roundedAmount = Math.round(evenAmount * 100) / 100;
        return {
          userId: p.id,
          name: p.name,
          email: p.email,
          imageUrl: p.imageUrl,
          amount: roundedAmount,
          percentage: amount > 0 ? (roundedAmount / amount) * 100 : 0,
          paid: p.id === paidByUserId,
        };
      });
    } else if (type === "ratio") {
      // Arbitrary ratio splitting with cent remainder distribution
      const parsedRatios = JSON.parse(ratiosString);
      const totalRatio = participants.reduce(
        (sum, p) => sum + (parsedRatios[p.id] !== undefined ? parsedRatios[p.id] : 1),
        0
      );

      const totalCents = Math.round(amount * 100);
      let tempSplits = participants.map((p) => {
        const ratioVal = parsedRatios[p.id] !== undefined ? parsedRatios[p.id] : 1;
        const baseCents = totalRatio > 0 ? Math.floor((totalCents * ratioVal) / totalRatio) : 0;
        return {
          userId: p.id,
          name: p.name,
          email: p.email,
          imageUrl: p.imageUrl,
          ratio: ratioVal,
          baseCents,
        };
      });

      const sumCents = tempSplits.reduce((sum, s) => sum + s.baseCents, 0);
      let remainderCents = totalCents - sumCents;

      newSplits = tempSplits.map((s, index) => {
        const extraCent = index < remainderCents ? 1 : 0;
        const finalAmount = (s.baseCents + extraCent) / 100;
        return {
          userId: s.userId,
          name: s.name,
          email: s.email,
          imageUrl: s.imageUrl,
          amount: finalAmount,
          percentage: amount > 0 ? (finalAmount / amount) * 100 : 0,
          paid: s.userId === paidByUserId,
        };
      });
    }

    setSplits(newSplits);
    if (onSplitsChange) onSplitsChange(newSplits);
  }, [type, amount, participants, paidByUserId, onSplitsChange, ratiosString]);

  // Recalculate totals using useMemo
  const totalAmount = useMemo(
    () => splits.reduce((sum, s) => sum + s.amount, 0),
    [splits]
  );

  const totalPercentage = useMemo(
    () => splits.reduce((sum, s) => sum + s.percentage, 0),
    [splits]
  );

  const isAmountValid = areClose(totalAmount, amount);
  const isPercentageValid = areClose(totalPercentage, 100);

  // Update percentage for one user
  const updatePercentageSplit = (userId, newPercentage) => {
    const updated = splits.map((s) => {
      if (s.userId === userId) {
        const pct = parseFloat(newPercentage) || 0;
        const rawAmount = (amount * pct) / 100;
        return {
          ...s,
          percentage: pct,
          amount: Math.round(rawAmount * 100) / 100,
        };
      }
      return s;
    });
    setSplits(updated);
    if (onSplitsChange) onSplitsChange(updated);
  };

  // Update amount for one user
  const updateExactSplit = (userId, newAmount) => {
    const parsed = parseFloat(newAmount) || 0;
    const rounded = Math.round(parsed * 100) / 100;
    const updated = splits.map((s) =>
      s.userId === userId
        ? {
            ...s,
            amount: rounded,
            percentage: amount > 0 ? (rounded / amount) * 100 : 0,
          }
        : s
    );
    setSplits(updated);
    if (onSplitsChange) onSplitsChange(updated);
  };

  // Update ratio for one user
  const updateRatioSplit = (userId, newRatio) => {
    const parsed = parseFloat(newRatio) || 0;
    setRatios((prev) => ({
      ...prev,
      [userId]: parsed,
    }));
  };

  return (
    <div className="space-y-4 mt-4">
      {splits.map((split) => (
        <div
          key={split.userId}
          className="flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-2 min-w-[120px]">
            <Avatar className="h-7 w-7">
              <AvatarImage src={split.imageUrl} />
              <AvatarFallback>{split.name?.charAt(0) || "?"}</AvatarFallback>
            </Avatar>
            <span className="text-sm">
              {split.userId === user?.id ? "You" : split.name}
            </span>
          </div>

          {type === "equal" && (
            <div className="text-right text-sm">
              ₹{split.amount.toFixed(2)} ({split.percentage.toFixed(1)}%)
            </div>
          )}

          {type === "percentage" && (
            <div className="flex items-center gap-4 flex-1">
              <Slider
                value={[split.percentage]}
                min={0}
                max={100}
                step={1}
                onValueChange={(v) =>
                  updatePercentageSplit(split.userId, v[0])
                }
                className="flex-1"
              />
              <div className="flex gap-1 items-center min-w-[100px]">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={split.percentage.toFixed(1)}
                  onChange={(e) =>
                    updatePercentageSplit(
                      split.userId,
                      parseFloat(e.target.value) || 0
                    )
                  }
                  className="w-16 h-8"
                />
                <span className="text-sm text-muted-foreground">%</span>
                <span className="text-sm ml-1">₹{split.amount.toFixed(2)}</span>
              </div>
            </div>
          )}

          {type === "exact" && (
            <div className="flex items-center gap-2 flex-1">
              <div className="flex-1"></div>
              <div className="flex gap-1 items-center">
                <span className="text-sm text-muted-foreground">₹</span>
                <Input
                  type="number"
                  min="0"
                  max={amount * 2}
                  step="0.01"
                  value={split.amount.toFixed(2)}
                  onChange={(e) =>
                    updateExactSplit(split.userId, e.target.value)
                  }
                  className="w-24 h-8"
                />
                <span className="text-sm text-muted-foreground ml-1">
                  ({split.percentage.toFixed(1)}%)
                </span>
              </div>
            </div>
          )}

          {type === "ratio" && (
            <div className="flex items-center gap-2 flex-1">
              <div className="flex-1"></div>
              <div className="flex gap-1 items-center">
                <span className="text-sm text-muted-foreground">Ratio:</span>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  value={ratios[split.userId] !== undefined ? ratios[split.userId] : 1}
                  onChange={(e) =>
                    updateRatioSplit(split.userId, e.target.value)
                  }
                  className="w-20 h-8"
                />
                <span className="text-sm text-muted-foreground ml-1">
                  (₹{split.amount.toFixed(2)})
                </span>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Total row */}
      <div className="flex justify-between border-t pt-3 mt-3">
        <span className="font-medium">Total</span>
        <div className="text-right">
          <span
            className={`font-medium ${!isAmountValid ? "text-amber-600" : ""}`}
          >
            ₹{totalAmount.toFixed(2)}
          </span>
          {type !== "equal" && (
            <span
              className={`text-sm ml-2 ${
                !isPercentageValid ? "text-amber-600" : ""
              }`}
            >
              ({totalPercentage.toFixed(1)}%)
            </span>
          )}
        </div>
      </div>

      {/* Validation messages */}
      {type === "percentage" && !isPercentageValid && (
        <div className="text-sm text-amber-600 mt-2">
          The percentages should add up to 100%.
        </div>
      )}

      {type === "exact" && !isAmountValid && (
        <div className="text-sm text-amber-600 mt-2">
          The sum of all splits (₹{totalAmount.toFixed(2)}) should equal the
          total amount (₹{amount.toFixed(2)}).
        </div>
      )}
    </div>
  );
}
