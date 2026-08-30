import { useCallback, useEffect, useState } from "react";
import { connectCalCom, disconnectProviderConnection, listProviderConnections, testProviderConnection } from "../api/providerConnections";
import type { ProviderConnection, ProviderConnectionTest } from "../api/types";

export function useProviderConnections(input: { formatError: (error: unknown) => string }) {
  const [connections, setConnections] = useState<ProviderConnection[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [lastTest, setLastTest] = useState<ProviderConnectionTest | null>(null);
  const refresh = useCallback(async () => { try { setConnections((await listProviderConnections()).connections); } catch (caught) { setError(input.formatError(caught)); } }, [input.formatError]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function saveCalCom(accessToken: string) { setIsSaving(true); setError(""); setMessage(""); try { const existing = connections.find((item) => item.providerId === "cal-com"); if (existing) await disconnectProviderConnection(existing.id); const result = await connectCalCom(accessToken); setConnections((current) => [result.connection, ...current.filter((item) => item.providerId !== "cal-com")]); setMessage("Cal.com credential saved securely. Test it before using live appointments."); return result.connection; } catch (caught) { setError(input.formatError(caught)); return null; } finally { setIsSaving(false); } }
  async function testConnection(connectionId: string) { setIsSaving(true); setError(""); setMessage(""); try { const result = await testProviderConnection(connectionId); setLastTest(result.test); setConnections((current) => current.map((item) => item.id === result.connection.id ? result.connection : item)); setMessage(result.test.message); return result.test; } catch (caught) { setError(input.formatError(caught)); return null; } finally { setIsSaving(false); } }
  async function disconnect(connectionId: string) { setIsSaving(true); setError(""); setMessage(""); try { await disconnectProviderConnection(connectionId); setConnections((current) => current.filter((item) => item.id !== connectionId)); setLastTest(null); setMessage("Cal.com was disconnected from AI Agent Hub."); } catch (caught) { setError(input.formatError(caught)); } finally { setIsSaving(false); } }
  return { connections, isSaving, error, message, lastTest, refresh, saveCalCom, testConnection, disconnect };
}
