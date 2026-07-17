import { useCallback, useState } from "react";
import { disconnectConnector, listConnectedAccounts, startConnector } from "../api/connectors";
import type { ConnectedAccount } from "../api/types";

export function useConnectors(input: { formatError: (error: unknown) => string }) {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refreshConnectors = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await listConnectedAccounts();
      setAccounts(result.accounts);
      return true;
    } catch (refreshError) {
      setError(input.formatError(refreshError));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [input]);

  async function connectGoogle() {
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await startConnector("google");
      if (result.status === "ready" && result.authorizationUrl) {
        window.location.assign(result.authorizationUrl);
        return;
      }
      setMessage(result.message);
    } catch (connectError) {
      setError(input.formatError(connectError));
    } finally {
      setIsSaving(false);
    }
  }

  async function disconnectAccount(accountId: string) {
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      await disconnectConnector(accountId);
      setMessage("Account disconnected.");
      await refreshConnectors();
    } catch (disconnectError) {
      setError(input.formatError(disconnectError));
    } finally {
      setIsSaving(false);
    }
  }

  return {
    accounts,
    connectGoogle,
    disconnectAccount,
    error,
    isLoading,
    isSaving,
    message,
    refreshConnectors,
    setMessage
  };
}
