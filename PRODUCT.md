# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Two roles in a direct-report pairing: **Employee** and **Manager**. The org shape allows
multi-pair managers (a manager with several direct reports) and middle managers who are
simultaneously someone's manager and someone's employee — design must not assume a single
fixed pair per account. Primary job: prepare for and conduct 1:1s, track goals/development/
career, document feedback and follow-up actions, and prepare for formal performance reviews.

## Product Purpose

Replace static, form-based performance reviews with an ongoing conversational experience:
Prepare → Talk → Reflect → Act → Follow Up. Success is a documented history of meaningful
1:1s, tracked goals and actions, and reviews that write themselves from real conversation
history — without adding HR overhead to daily use.

## Positioning

The trust mechanism a neighboring HRIS-style tool can't truthfully copy without giving up HR
oversight: no HR role, no HR dashboard, no automatic reporting, no ratings/rankings/scores, no
company-wide analytics. The only way information leaves the platform is an intentional,
confirmed export by the employee or manager. Coaching nudges toward specific, observable
language (holding back vague feedback like "communication needs improvement" until it's made
concrete) are rule-based pattern matching, not an LLM judging the user.

## Operating Context

1:1 meetings (in-person and async), ongoing goal and development-plan tracking, career
conversations, performance-review prep, and history/export at the end of a cycle. Slack
integration is in progress (DM delivery, Home tab links, retry/backoff on rate limits — see
`web-app/SLACK_TODO.md`) as a secondary surface into the same data, not a replacement for the
web app.

## Capabilities and Constraints

- Two parallel implementations exist today and are being kept in sync by design decision, not
  one deprecating the other:
  - `performance-pulse.html` (root) — static single-file prototype, `localStorage` only, no
    backend, no network calls.
  - `web-app/` — the live product: Next.js 16 + React 19 + Supabase (real accounts, RLS,
    Slack app integration).
- No ratings, rankings, scores, or company-wide analytics, ever — this is a hard product
  constraint, not a missing feature.
- Coaching behavior is deterministic rule-based pattern matching, never an LLM call.
- Direction is toward a multi-tenant SaaS product (eventual Slack Marketplace listing), not a
  single-org personal tool — design and onboarding should read as a real product other
  companies could adopt, not a one-off internal utility.
- Accessibility standard: none established yet (undecided — do not assume a compliance target
  such as WCAG without it being set explicitly).

## Brand Commitments

Product name: **Performance Pulse**. No confirmed visual identity (logo, palette, typography)
beyond what's implemented in the two surfaces above — treat existing UI as incumbent evidence
for refinement, not as a locked brand system.

## Evidence on Hand

Full spec at `SPEC.md` (root). Root `README.md` and `web-app/README.md` describe current
functionality. `web-app/SLACK_TODO.md` tracks in-progress Slack work. No real customer
testimonials, case studies, or press exist yet — do not fabricate them for a multi-tenant
pitch; this is still pre-customer.

## Product Principles

1. Privacy is the product — no HR visibility, no ratings, no company-wide analytics, ever.
2. Coaching over grading — nudge toward specific, observable language; deterministic rules,
   never an LLM verdict on the user.
3. Built for the real org shape — multi-pair and middle managers, not a single fixed pair.
4. Conversational, not form-based — an ongoing Prepare→Talk→Reflect→Act→Follow-Up flow
   replaces the static annual review form.
5. Product-grade from day one — being built toward multi-tenant SaaS distribution, so design
   and onboarding should hold up for a customer who isn't you.

## Accessibility & Inclusion

Not yet established. No confirmed standard or user-need to design against.
