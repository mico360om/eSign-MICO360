import fs from "fs";
import path from "path";
import crypto from "crypto";
import forge from "node-forge";
import { env } from "../config/env";

const certDir = () => path.join(env.storageDir, "certs");
const p12Path = () => path.join(certDir(), "signing.p12");
const passPath = () => path.join(certDir(), "passphrase");

export interface SigningCert {
  p12: Buffer;
  passphrase: string;
}

/**
 * Return the server's signing certificate, generating a self-signed one on
 * first use. Self-signed proves tamper-evidence (any edit breaks the signature)
 * but is not chain-trusted — swap in a CA/eIDAS-issued .p12 for legal trust by
 * replacing storage/certs/signing.p12 and storage/certs/passphrase.
 */
export function ensureSigningCert(): SigningCert {
  fs.mkdirSync(certDir(), { recursive: true });
  if (fs.existsSync(p12Path()) && fs.existsSync(passPath())) {
    return { p12: fs.readFileSync(p12Path()), passphrase: fs.readFileSync(passPath(), "utf8").trim() };
  }

  const passphrase = crypto.randomBytes(16).toString("hex");
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01" + crypto.randomBytes(8).toString("hex");
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 10);

  const attrs = [
    { name: "commonName", value: "eSign MICO360 Signing Authority" },
    { name: "organizationName", value: "MICO360" },
    { shortName: "OU", value: "Document Approvals" },
  ];
  cert.setSubject(attrs);
  cert.setIssuer(attrs); // self-signed
  cert.setExtensions([
    { name: "basicConstraints", cA: false },
    { name: "keyUsage", digitalSignature: true, nonRepudiation: true },
    { name: "extKeyUsage", emailProtection: true },
  ]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, { algorithm: "3des" });
  const der = forge.asn1.toDer(p12Asn1).getBytes();
  const p12 = Buffer.from(der, "binary");

  fs.writeFileSync(p12Path(), p12);
  fs.writeFileSync(passPath(), passphrase, "utf8");
  return { p12, passphrase };
}
