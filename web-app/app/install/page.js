// Public landing page for a brand-new company installing the Slack app for
// the first time -- unlike app/(dashboard)/slack/page.js's install button,
// this page needs no website account and no existing pairing, since a cold
// company has neither yet. Everything after this click (company creation,
// the first pairing) happens inside Slack itself (2026-09-18).
export const metadata = {
  title: "Install Performance Pulse for Slack",
  description: "Add Performance Pulse to your Slack workspace.",
};

export default function InstallPage() {
  return (
    <div className="auth-shell">
      <div className="card auth-card">
        <div className="auth-logo">
          <div className="logo">PP</div>
          <div>
            <strong>Performance Pulse</strong>
            <small>Private manager-employee 1:1 tool, in Slack</small>
          </div>
        </div>

        <p className="card-note" style={{ marginTop: 16 }}>
          Click below to add Performance Pulse to your own Slack workspace. You&rsquo;ll be asked to sign in to Slack and
          approve it there &mdash; no separate account on this site is needed.
        </p>

        <div className="btn-row" style={{ marginTop: 16 }}>
          <a className="btn" href="/api/slack/install">Add to Slack</a>
        </div>

        <div className="privacy-note" style={{ marginTop: 20 }}>
          <strong>Human review, always.</strong>
          Performance Pulse never uses AI to write, score, or decide anything about a person&rsquo;s performance. See our{" "}
          <a href="/privacy">privacy policy</a> for details.
        </div>
      </div>
    </div>
  );
}
