// HR roster import: parses an uploaded org-chart file (Employee, Manager,
// optional Email columns) and creates one pending pair per row. Gated by
// the same shared HR passcode as /api/handbook -- see that file's header
// comment for why there's a passcode instead of a real HR role. A row's
// real email (if the file has one) is used so a matching real account
// links immediately; a name with no email on any of its rows still gets a
// placeholder so the pairing exists ahead of anyone signing in -- the
// existing auto-link trigger takes it from there once a real account signs
// in with a matching email (Melissa's call, 2026-09-04; email-column
// support and no-manager rows added 2026-09-05).
import { createClient } from "@supabase/supabase-js";
import ExcelJS from "exceljs";
import { getHrPasscode, createPairFromRoster } from "@/lib/data";

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
}

async function checkPasscode(a, passcode) {
  const real = await getHrPasscode(a);
  return Boolean(real) && passcode === real;
}

function placeholderEmail(name) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
  return `${slug}@placeholder.test`;
}

export async function POST(req) {
  const a = admin();
  const form = await req.formData();
  if (!(await checkPasscode(a, form.get("passcode")))) {
    return Response.json({ error: "Wrong passcode." }, { status: 401 });
  }
  const file = form.get("file");
  if (!file) return Response.json({ error: "No file." }, { status: 400 });

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return Response.json({ error: "Couldn't read that file — is it a .xlsx file?" }, { status: 400 });
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return Response.json({ error: "That file has no sheet." }, { status: 400 });

  const headerRow = sheet.getRow(1);
  const header = [];
  for (let i = 1; i <= headerRow.cellCount; i++) header[i] = (headerRow.getCell(i).text || "").trim().toLowerCase();
  const empCol = header.findIndex((h) => h === "employee");
  const mgrCol = header.findIndex((h) => h === "manager");
  const emailCol = header.findIndex((h) => h === "email");
  if (empCol === -1 || mgrCol === -1) {
    return Response.json({ error: "That file needs \"Employee\" and \"Manager\" column headers." }, { status: 400 });
  }

  // Two passes: first collect every name's real email (if the file has an
  // Email column) so a manager referenced by name on someone else's row
  // still resolves to their real address, not a placeholder -- including a
  // no-manager row (the top of the org chart), which never forms a pair of
  // its own but still needs to be in this map for their reports' rows.
  // `.text` (not `.value`) is ExcelJS's own display-string getter -- it
  // already unwraps a hyperlink cell's {text, hyperlink}, a formula cell's
  // {formula, result}, and rich text, so cells stay correct even if Excel
  // auto-linked a typed email address (found live: a hand-rolled version of
  // this unwrapping missed a rich-text-display-inside-a-hyperlink case and
  // silently produced an empty string, 2026-09-05).
  const norm = (s) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const allRows = [];
  const nameToEmail = new Map();
  // Two different employees sharing a (normalized) name would otherwise
  // silently cross-assign: whichever row's email Map.set() ran last wins the
  // shared key, and anyone who references that name as a manager gets
  // paired to whichever email happened to win -- found in review 2026-09-05.
  // Surface the collision instead of resolving it silently.
  const nameCollisions = new Set();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const employee = (row.getCell(empCol).text || "").trim();
    const manager = (row.getCell(mgrCol).text || "").trim();
    const email = emailCol === -1 ? "" : (row.getCell(emailCol).text || "").trim();
    if (!employee) return;
    if (email) {
      const key = norm(employee);
      if (nameToEmail.has(key) && nameToEmail.get(key) !== email) nameCollisions.add(employee);
      nameToEmail.set(key, email);
    }
    allRows.push({ employee, manager });
  });

  const rows = allRows.filter((r) => r.manager);
  const emailFor = (name) => nameToEmail.get(norm(name)) || placeholderEmail(name);

  // A manager name that doesn't match ANY name in the Employee column is
  // almost always a typo (a stray character from copy/paste or retyping a
  // cell) rather than someone genuinely missing from the sheet -- caught
  // live when "Melissa Weiss" was actually stored as "mmelissa Weiss" from
  // a rich-text editing artifact invisible at normal zoom, so every row
  // that referenced her as manager silently got a dead-end placeholder
  // forever instead of a clear error, 2026-09-05. Surface it instead of
  // letting it fail silently.
  const employeeNames = new Set(allRows.map((r) => norm(r.employee)));
  const unmatchedManagers = [...new Set(rows.map((r) => r.manager))].filter((m) => !employeeNames.has(norm(m)));

  let added = 0;
  let corrected = 0;
  let skipped = 0;
  const failed = [];
  for (const { employee, manager } of rows) {
    try {
      const result = await createPairFromRoster(a, emailFor(employee), emailFor(manager), placeholderEmail(manager), employee);
      if (result.updated) corrected++;
      else if (result.skipped) skipped++;
      else added++;
    } catch (err) {
      failed.push(`${employee} / ${manager}: ${err.message || "failed"}`);
    }
  }

  return Response.json({ total: rows.length, added, corrected, skipped, failed, unmatchedManagers, nameCollisions: [...nameCollisions] });
}
