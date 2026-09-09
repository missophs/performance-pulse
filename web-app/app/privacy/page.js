export const metadata = { title: "Privacy — Performance Pulse" };

export default function PrivacyPage() {
  return (
    <div className="auth-shell">
      <div className="card" style={{ width: "100%", maxWidth: 640 }}>
        <div className="auth-logo">
          <div className="logo">PP</div>
          <div>
            <strong>Performance Pulse</strong>
            <small>Private manager-employee app</small>
          </div>
        </div>

        <h2 style={{ marginTop: 20 }}>Privacy</h2>
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Last updated September 8, 2026. Performance Pulse is a pilot tool for
          one-on-one conversations between a manager and their direct report.
          This page describes what it actually does with your data — plainly,
          not as a legal document.
        </p>

        <h3 style={{ marginTop: 20 }}>What we collect</h3>
        <p style={{ fontSize: 13 }}>
          Your name and email address, and whatever you or your manager/employee
          enter into the app: 1:1 topics, goals, development plans, actions,
          feedback, and meeting notes. HR can also upload a company org chart
          (names, emails, and reporting lines) to set up pairings in advance —
          if that happens before you&apos;ve signed in yourself, your name and
          email may already be on file when you first sign in, so your account
          links to the right manager automatically.
        </p>

        <h3 style={{ marginTop: 20 }}>Where it lives</h3>
        <p style={{ fontSize: 13 }}>
          In a hosted database (Supabase). A daily backup copies that data into
          a private repository only the app&apos;s admin can access — it is
          never made public.
        </p>

        <h3 style={{ marginTop: 20 }}>Who can see it</h3>
        <p style={{ fontSize: 13 }}>
          Only the manager and employee in a pairing can see that pairing&apos;s
          conversations. Nobody else — including HR — has general access to
          individual 1:1 content.
        </p>

        <h3 style={{ marginTop: 20 }}>Signing in</h3>
        <p style={{ fontSize: 13 }}>
          You sign in with Google. We only ask for your name, email address,
          and profile picture — enough to identify you. We don&apos;t access
          your email, files, calendar, or anything else in your Google
          account. Only people already added by HR (on the company roster or
          an existing pairing) can sign in — Google accounts not already
          provisioned are turned away at sign-in.
        </p>

        <h3 style={{ marginTop: 20 }}>What we don&apos;t do</h3>
        <p style={{ fontSize: 13 }}>
          We don&apos;t sell or share your data with third parties, and we
          don&apos;t use it for advertising.
        </p>

        <h3 style={{ marginTop: 20 }}>Questions or deletion requests</h3>
        <p style={{ fontSize: 13 }}>
          Contact melissaw212@gmail.com.
        </p>
      </div>
    </div>
  );
}
