import { LoginForm } from "../../components/login-form";

export default function LoginPage() {
  return (
    <main className="page-shell">
      <div className="login-layout">
        <section className="login-hero">
          <div>
            <span className="eyebrow">FreeLine Internal Ops</span>
            <h1 className="login-title">Carrier-grade controls for a free-line beta.</h1>
            <p className="hero-copy">
              Watch abuse pressure, number inventory, and beta access in one place.
              This console is tuned for operators, not customers.
            </p>
          </div>

          <div className="hero-grid">
            <article className="hero-metric">
              <span className="muted">Abuse posture</span>
              <strong>Tiered</strong>
            </article>
            <article className="hero-metric">
              <span className="muted">Number state</span>
              <strong>Tracked</strong>
            </article>
            <article className="hero-metric">
              <span className="muted">Beta gate</span>
              <strong>Invite-only</strong>
            </article>
          </div>
        </section>

        <section className="login-card">
          <span className="eyebrow">Admin Access</span>
          <h2 className="panel-title" style={{ marginTop: 16 }}>
            Sign in
          </h2>
          <p className="muted">
            Use the separate admin credentials configured for FreeLine operations.
          </p>
          <LoginForm />
        </section>
      </div>
    </main>
  );
}
