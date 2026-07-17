export type ProviderReadinessCode =
  | "provider_ready"
  | "provider_disabled"
  | "provider_not_configured"
  | "provider_health_unknown"
  | "provider_unhealthy"
  | "missing_credentials"
  | "connector_expired"
  | "provider_timeout"
  | "provider_unauthorized"
  | "invalid_provider_config";

export function providerReadinessMessage(input: {
  code: ProviderReadinessCode;
  providerLabel: string;
  capabilityLabel?: string;
}) {
  switch (input.code) {
    case "provider_ready":
      return `${input.providerLabel} is ready.`;
    case "provider_disabled":
      return `${input.providerLabel} is currently turned off.`;
    case "provider_not_configured":
      return `${input.providerLabel} is not fully set up yet.`;
    case "provider_health_unknown":
      return `${input.providerLabel} has not been checked yet.`;
    case "missing_credentials":
      return `Connect ${input.providerLabel} before this agent can continue.`;
    case "connector_expired":
      return `Reconnect ${input.providerLabel} before this agent can continue.`;
    case "provider_timeout":
      return `${input.providerLabel} took too long to respond. Try again in a moment.`;
    case "provider_unauthorized":
      return `${input.providerLabel} needs to be refreshed before this agent can continue.`;
    case "invalid_provider_config":
      return `${input.providerLabel} is not fully set up yet.`;
    case "provider_unhealthy":
    default:
      return `${input.providerLabel} is temporarily unavailable. Try again later.`;
  }
}

export function providerReadinessNextStep(input: {
  code: ProviderReadinessCode;
  providerLabel: string;
}) {
  switch (input.code) {
    case "missing_credentials":
      return `Connect ${input.providerLabel}, then try again.`;
    case "connector_expired":
    case "provider_unauthorized":
      return `Reconnect ${input.providerLabel}, then try again.`;
    case "provider_disabled":
      return `Turn on ${input.providerLabel}, then try again.`;
    case "provider_not_configured":
    case "invalid_provider_config":
      return `Finish setting up ${input.providerLabel}, then try again.`;
    case "provider_timeout":
      return "Try again in a moment.";
    case "provider_health_unknown":
      return `Check ${input.providerLabel}, then try again.`;
    case "provider_unhealthy":
      return `Check ${input.providerLabel} or choose another provider.`;
    case "provider_ready":
    default:
      return undefined;
  }
}
