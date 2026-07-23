import { loadEnvFiles } from "./load-env";
import { ensureGoogleDriveSubfolder, isGoogleDriveConfigured } from "../lib/google-drive";

async function main() {
  loadEnvFiles();

  if (!isGoogleDriveConfigured()) {
    console.error("Google Drive nie skonfigurowany — sprawdź GOOGLE_* w .env.local");
    process.exit(1);
  }

  const name = `test-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}`;
  const folderId = await ensureGoogleDriveSubfolder(name);

  console.log(
    JSON.stringify(
      {
        ok: true,
        name,
        folderId,
        parentFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID?.trim(),
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
