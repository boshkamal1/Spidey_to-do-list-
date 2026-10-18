import { readFile, writeFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";

const privateKeyPath = new URL("./vapid-private.jwk", import.meta.url);
let privateJwk;

try {
  privateJwk = JSON.parse(await readFile(privateKeyPath, "utf8"));
  if (privateJwk.kty !== "EC" || privateJwk.crv !== "P-256" || !privateJwk.d || !privateJwk.x || !privateJwk.y) {
    throw new Error("The existing private key file is invalid. Remove it and generate a new pair before enabling push.");
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  privateJwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
  await writeFile(privateKeyPath, JSON.stringify(privateJwk), { encoding: "utf8", flag: "wx" });
}

const publicKey = await webcrypto.subtle.importKey("jwk", {
  kty: "EC",
  crv: "P-256",
  x: privateJwk.x,
  y: privateJwk.y,
  ext: true
}, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
const rawPublicKey = new Uint8Array(await webcrypto.subtle.exportKey("raw", publicKey));
console.log(`Web Push public key: ${Buffer.from(rawPublicKey).toString("base64url")}`);
console.log("The matching private key is saved in vapid-private.jwk. Keep it out of Git and chats.");
