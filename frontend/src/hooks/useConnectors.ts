import { useCallback, useState } from "react";
import { disconnectConnector, listConnectedAccounts, startConnector } from "../api/connectors";
import type { ConnectedAccount } from "../api/types";
import { openExternalUrl } from "../lib/localAiBridge";

export function useConnectors(input: { formatError: (error: unknown) => string }) {
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isServiceAvailable, setIsServiceAvailable] = useState<boolean | null>(null);

  const refreshConnectors = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await listConnectedAccounts();
      setAccounts(result.accounts ?? []);
      setIsServiceAvailable(true);
      return true;
    } catch (refreshError) {
      setIsServiceAvailable(false);
      setError(input.formatError(refreshError));
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [input]);

  async function connect(provider: "google" | "microsoft") {
    if (isServiceAvailable !== true) {
      setError("The agent service is offline. Start or reconnect the backend, then select Check connection before connecting an account.");
      return;
    }
    setIsSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await startConnector(provider);
      if (result.status === "ready" && result.authorizationUrl) {
        await openExternalUrl(result.authorizationUrl);
        setMessage(`Finish connecting ${provider === "google" ? "Google" : "Microsoft"} in the browser, then return here and select Check connection.`);
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
    connectGoogle: () => connect("google"),
    connectMicrosoft: () => connect("microsoft"),
    disconnectAccount,
    error,
    isLoading,
    isSaving,
    isServiceAvailable,
    message,
    refreshConnectors,
    setMessage
  };
}
