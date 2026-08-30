import { useCallback, useState } from "react";
import { getCurrentUser } from "../api/me";
import type { CurrentUser, CurrentUserCapabilities } from "../api/types";

const defaultCapabilities: CurrentUserCapabilities = {
  canCreateMarketplaceAgents: false,
  canModerateMarketplace: false
};

export function useCurrentUser(input: { formatError: (error: unknown) => string }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [capabilities, setCapabilities] = useState<CurrentUserCapabilities>(defaultCapabilities);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const refreshCurrentUser = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await getCurrentUser();
      setUser(result.user ?? null);
      // Treat capabilities as untrusted API data. Older or misconfigured API
      // endpoints may omit this object; startup must remain fail-closed rather
      // than crashing while reading an authorization flag.
      setCapabilities({
        ...defaultCapabilities,
        ...(result.capabilities ?? {})
      });
    } catch (refreshError) {
      setUser(null);
      setCapabilities(defaultCapabilities);
      setError(input.formatError(refreshError));
    } finally {
      setIsLoading(false);
    }
  }, [input]);

  return {
    user,
    capabilities,
    isLoading,
    error,
    refreshCurrentUser
  };
}
