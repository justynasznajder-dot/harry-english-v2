import { loadEnvFiles } from "./load-env";
import { google } from "googleapis";
import { ensureGoogleDriveSubfolder } from "../lib/google-drive";

async function main() {
  loadEnvFiles();

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!.trim();
  const key = process.env.GOOGLE_PRIVATE_KEY!.trim().replace(/\\n/g, "\n");
  const parent = process.env.GOOGLE_DRIVE_FOLDER_ID!.trim();

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ["https://www.googleapis.com/auth/drive.file"],
  });
  const drive = google.drive({ version: "v3", auth });

  const res = await drive.files.list({
    q: `'${parent}' in parents and trashed = false`,
    fields: "files(id, name, mimeType)",
    pageSize: 50,
  });

  console.log("Parent (GOOGLE_DRIVE_FOLDER_ID):", parent);
  console.log("Contents:", JSON.stringify(res.data.files ?? [], null, 2));

  const platnosci = (res.data.files ?? []).find(
    (f) => f.name?.toLowerCase() === "platnosci" && f.mimeType === "application/vnd.google-apps.folder"
  );

  if (!platnosci?.id) {
    console.error("Nie znaleziono folderu Platnosci w rodzicu — lub brak dostępu (drive.file / udostępnienie).");
    process.exit(1);
  }

  console.log("Platnosci id:", platnosci.id);

  const name = `test-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
  const folderId = await ensureGoogleDriveSubfolder(name, platnosci.id);
  console.log(
    JSON.stringify(
      {
        ok: true,
        name,
        folderId,
        parent: "Platnosci",
        parentId: platnosci.id,
        url: `https://drive.google.com/drive/folders/${folderId}`,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
