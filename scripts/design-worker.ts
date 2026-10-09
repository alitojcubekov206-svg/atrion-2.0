import {db} from "../src/backend/db";
import {runDesignJob} from "../src/backend/interior/worker";
let stopping = false;
process.on("SIGINT", () => {stopping = true;});
process.on("SIGTERM", () => {stopping = true;});
async function main() {
  console.info("Interior design worker started");
  while (!stopping) {
    try {if (await runDesignJob()) continue;}
    catch (error) {console.error("Design worker unavailable", {kind: error instanceof Error ? error.name : "UnknownError"});}
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  await db.$disconnect();
}
void main();
