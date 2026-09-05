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

  const header = (sheet.getRow(1).values || []).map((v) => String(v || "").trim().toLowerCase());
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
  const allRows = [];
  const nameToEmail = new Map();
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const employee = String(row.values[empCol] || "").trim();
    const manager = String(row.values[mgrCol] || "").trim();
    const email = emailCol === -1 ? "" : String(row.values[emailCol] || "").trim();
    if (!employee) return;
    if (email) nameToEmail.set(employee, email);
    allRows.push({ employee, manager });
  });

  const rows = allRows.filter((r) => r.manager);
  const emailFor = (name) => nameToEmail.get(name) || placeholderEmail(name);

  let added = 0;
  let skipped = 0;
  const failed = [];
  for (const { employee, manager } of rows) {
    try {
      const result = await createPairFromRoster(a, emailFor(employee), emailFor(manager));
      if (result.skipped) skipped++;
      else added++;
    } catch (err) {
      failed.push(`${employee} / ${manager}: ${err.message || "failed"}`);
    }
  }

  return Response.json({ total: rows.length, added, skipped, failed });
}
