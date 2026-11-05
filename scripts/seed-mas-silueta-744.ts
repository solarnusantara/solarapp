// Prints the PT Mas Silueta 744 kWp layout payload (JSON) to stdout.
//   npx tsx scripts/seed-mas-silueta-744.ts > tmp-mas744.json
// POST it to /api/design/projects/{id}/layout (same body PVLayout.saveDraft sends).
import { buildMasSilueta744Layout } from "../src/engine/fixtures/masSilueta744";

process.stdout.write(JSON.stringify(buildMasSilueta744Layout(), null, 2) + "\n");
