import { existsSync, writeFileSync } from "node:fs";
import { generateKeyPairSync } from "node:crypto";

const privatePath = "finik_private.pem";
const publicPath = "finik_public.pem";

if (existsSync(privatePath) || existsSync(publicPath)) {
  console.error("Finik key files already exist. Move them before generating a new pair.");
  process.exit(1);
}

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

writeFileSync(privatePath, privateKey, { mode: 0o600 });
writeFileSync(publicPath, publicKey);

console.log("Created finik_private.pem and finik_public.pem.");
console.log("Upload only finik_public.pem to Finik.");
console.log("Never upload or share finik_private.pem.");
