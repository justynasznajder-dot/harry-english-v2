import fs from "node:fs";
import path from "node:path";

function loadEnvFile(fileName: string): void {
  const envPath = path.join(process.cwd(), fileName);
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 0) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

async function main(): Promise<void> {
  loadEnvFile(".env.local");
  loadEnvFile(".env");
  const { sendProposalEmail } = await import("../lib/email");

  await sendProposalEmail(
    "justyna.sznajder@gmail.com",
    "Justyna Sznajder",
    {
      groupName: "Grupa A1 (test wysylki)",
      locationName: "Warszawa - Centrum",
      schedule: "Wtorek 17:00-17:45",
      childFirstName: "Ania",
      childLastName: "Sznajder",
    },
    {
      loginEmail: "justyna.sznajder@gmail.com",
      tempPassword: "srpp-9729",
    }
  );

  console.log("TEST_EMAIL_SENT");
}

void main();
