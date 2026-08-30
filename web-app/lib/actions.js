"use server";

import { cookies } from "next/headers";

// Which of an account's multiple pairs is "current" — read by
// app/(dashboard)/layout.js, set here from the switcher in AppShell and
// from OnboardingForm after creating a new pairing.
const PAIR_COOKIE = "pp_pair_id";

export async function setCurrentPair(pairId) {
  const cookieStore = await cookies();
  cookieStore.set(PAIR_COOKIE, pairId, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
  });
}
