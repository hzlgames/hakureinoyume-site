// login-zju clients share a cookie jar, but concurrent first fetches can each
// start an SSO login. Share only the in-flight login, keeping later retries valid.
export function serializeClientLogin<T extends { login(): Promise<unknown> }>(client: T): T {
  const login = client.login.bind(client);
  let pending: Promise<unknown> | undefined;
  client.login = () => {
    pending ??= login().finally(() => { pending = undefined; });
    return pending;
  };
  return client;
}
