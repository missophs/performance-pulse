// HR roster import: parses an uploaded org-chart file (Employee, Manager
// columns) and creates one pending pair per row. Gated by the same shared
// HR passcode as /api/handbook -- see that file's header comment for why
// there's a passcode instead of a real HR role. Names-only rows get a
// placeholder email so the pairing exists ahead of anyone signing in; the
// existing auto-link trigger takes it from there once a real account signs
// in with a matching email (Melissa's call, 2026-09-04).
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
  if (empCol === -1 || mgrCol === -1) {
    return Response.json({ error: "That file needs \"Employee\" and \"Manager\" column headers." }, { status: 400 });
  }

  const rows = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const employee = String(row.values[empCol] || "").trim();
    const manager = String(row.values[mgrCol] || "").trim();
    if (employee && manager) rows.push({ employee, manager });
  });

  let added = 0;
  let skipped = 0;
  const failed = [];
  for (const { employee, manager } of rows) {
    try {
      const result = await createPairFromRoster(a, placeholderEmail(employee), placeholderEmail(manager));
      if (result.skipped) skipped++;
      else added++;
    } catch (err) {
      failed.push(`${employee} / ${manager}: ${err.message || "failed"}`);
    }
  }

  return Response.json({ total: rows.length, added, skipped, failed });
}
