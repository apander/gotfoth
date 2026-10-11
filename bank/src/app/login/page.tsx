import { login } from "@/server/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  return (
    <main className="login">
      <form className="card" action={login}>
        <h1>Paper bank</h1>
        <p className="muted">Operator sign-in for question and mark-scheme review.</p>
        {query.error ? <p className="warn">That passphrase was not accepted.</p> : null}
        <label htmlFor="passphrase">Passphrase</label>
        <input id="passphrase" name="passphrase" type="password" autoComplete="current-password" required />
        <p><button type="submit">Sign in</button></p>
      </form>
    </main>
  );
}
