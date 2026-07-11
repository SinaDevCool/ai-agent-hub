import { useCallback, useState } from "react";
import {
  approveCreatorAccessRequest,
  denyCreatorAccessRequest,
  getMyCreatorAccess,
  listCreatorAccessRequests,
  requestCreatorAccess
} from "../api/creatorAccess";
import type { CreatorAccessRequest } from "../api/types";

function removeRequest(requests: CreatorAccessRequest[], requestId: string) {
  return requests.filter((request) => request.id !== requestId);
}

export function useCreatorAccess(input: { formatError: (error: unknown) => string }) {
  const [request, setRequest] = useState<CreatorAccessRequest | null>(null);
  const [requests, setRequests] = useState<CreatorAccessRequest[]>([]);
  const [reason, setReason] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const refreshMyCreatorAccess = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await getMyCreatorAccess();
      setRequest(result.request);
    } catch (refreshError) {
      setRequest(null);
      setError(input.formatError(refreshError));
    } finally {
      setIsLoading(false);
    }
  }, [input]);

  const refreshCreatorAccessRequests = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const result = await listCreatorAccessRequests();
      setRequests(result.requests.filter((item) => item.status === "pending"));
    } catch (refreshError) {
      setRequests([]);
      setError(input.formatError(refreshError));
    } finally {
      setIsLoading(false);
    }
  }, [input]);

  async function submitCreatorAccessRequest() {
    setIsSaving(true);
    setError("");
    try {
      const result = await requestCreatorAccess(reason);
      setRequest(result.request);
      setReason("");
      return result.request;
    } catch (submitError) {
      setError(input.formatError(submitError));
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function approveCreatorAccess(requestId: string) {
    setIsSaving(true);
    setError("");
    try {
      const result = await approveCreatorAccessRequest(requestId);
      setRequests((current) => removeRequest(current, requestId));
      return result.request;
    } catch (approveError) {
      setError(input.formatError(approveError));
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  async function denyCreatorAccess(requestId: string, note: string) {
    setIsSaving(true);
    setError("");
    try {
      const result = await denyCreatorAccessRequest(requestId, note);
      setRequests((current) => removeRequest(current, requestId));
      return result.request;
    } catch (denyError) {
      setError(input.formatError(denyError));
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  return {
    request,
    requests,
    reason,
    isLoading,
    isSaving,
    error,
    setReason,
    refreshMyCreatorAccess,
    refreshCreatorAccessRequests,
    submitCreatorAccessRequest,
    approveCreatorAccess,
    denyCreatorAccess
  };
}
