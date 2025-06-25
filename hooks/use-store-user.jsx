// hooks/use-store-user.jsx
import { useUser } from "@clerk/nextjs";
import { useConvexAuth, useMutation } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "../convex/_generated/api";

export default function useStoreUser() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { user } = useUser();
  const [userId, setUserId] = useState(null);

  const storeUser = useMutation(api.users.store);

  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const createUser = async () => {
      try {
        const id = await storeUser();  // ✅ DO NOT pass any args
        setUserId(id);
        console.log("✅ User stored with ID:", id);
      } catch (err) {
        console.error("❌ Failed to store user:", err);
      }
    };

    createUser();

    return () => setUserId(null);
  }, [isAuthenticated, storeUser, user?.id]);

  return {
    isLoading: isLoading || (isAuthenticated && userId === null),
    isAuthenticated: isAuthenticated && userId !== null,
  };
}
