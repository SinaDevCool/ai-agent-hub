type FetchLike = typeof fetch;

let oauthFetchImpl: FetchLike = fetch;

export function setProviderOAuthFetchForTest(nextFetch: FetchLike) {
  oauthFetchImpl = nextFetch;
}

export function resetProviderOAuthFetchForTest() {
  oauthFetchImpl = fetch;
}

export function providerOAuthFetch(input: Parameters<FetchLike>[0], init?: Parameters<FetchLike>[1]) {
  return oauthFetchImpl(input, init);
}
