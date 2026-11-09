import { cose, isoBase64URL, isoCBOR } from "@simplewebauthn/server/helpers";

/**
 * A passkey device in software, for tests: it answers Better Auth's
 * registration and sign-in challenges the way a phone or a laptop would,
 * with a P-256 key and "none" attestation.
 */
export async function softPasskey(
  origin = "http://localhost",
  rpID = new URL(origin).hostname
) {
  const keys = (await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  )) as CryptoKeyPair;
  const jwk = (await crypto.subtle.exportKey(
    "jwk",
    keys.publicKey
  )) as JsonWebKey;
  const credentialId = crypto.getRandomValues(new Uint8Array(16));
  const id = isoBase64URL.fromBuffer(credentialId);
  const rpIdHash = await sha256(new TextEncoder().encode(rpID));
  let signCount = 0;
  let userHandle: string | undefined;

  const clientData = (type: string, challenge: string) =>
    new Uint8Array(
      new TextEncoder().encode(
        JSON.stringify({ type, challenge, origin, crossOrigin: false })
      )
    );

  return {
    id,
    /** The answer to /passkey/generate-register-options. */
    async register(options: { challenge: string; user: { id: string } }) {
      userHandle = options.user.id;
      const publicKey = isoCBOR.encode(
        new Map<number, number | Uint8Array>([
          [cose.COSEKEYS.kty, cose.COSEKTY.EC2],
          [cose.COSEKEYS.alg, cose.COSEALG.ES256],
          [cose.COSEKEYS.crv, cose.COSECRV.P256],
          [cose.COSEKEYS.x, isoBase64URL.toBuffer(jwk.x ?? "")],
          [cose.COSEKEYS.y, isoBase64URL.toBuffer(jwk.y ?? "")],
        ])
      );
      const authData = concat(
        rpIdHash,
        // User present, user verified, attested credential data included.
        Uint8Array.of(0x45),
        uint32(signCount),
        new Uint8Array(16),
        Uint8Array.of(0, credentialId.length),
        credentialId,
        publicKey
      );
      const attestationObject = isoCBOR.encode(
        new Map<string, CBORValue>([
          ["fmt", "none"],
          ["attStmt", new Map()],
          ["authData", authData],
        ])
      );
      return {
        id,
        rawId: id,
        type: "public-key",
        response: {
          clientDataJSON: isoBase64URL.fromBuffer(
            clientData("webauthn.create", options.challenge)
          ),
          attestationObject: isoBase64URL.fromBuffer(attestationObject),
          transports: ["internal"],
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },
    /** The answer to /passkey/generate-authenticate-options. */
    async authenticate(options: { challenge: string }) {
      signCount += 1;
      // User present and verified.
      const authData = concat(rpIdHash, Uint8Array.of(0x05), uint32(signCount));
      const clientDataJSON = clientData("webauthn.get", options.challenge);
      const signed = concat(authData, await sha256(clientDataJSON));
      const raw = new Uint8Array(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          keys.privateKey,
          signed as Uint8Array<ArrayBuffer>
        )
      );
      return {
        id,
        rawId: id,
        type: "public-key",
        response: {
          clientDataJSON: isoBase64URL.fromBuffer(clientDataJSON),
          authenticatorData: isoBase64URL.fromBuffer(authData),
          signature: isoBase64URL.fromBuffer(derSignature(raw)),
          userHandle,
        },
        clientExtensionResults: {},
        authenticatorAttachment: "platform",
      };
    },
  };
}

async function sha256(data: Uint8Array) {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>)
  );
}

type CBORValue = Parameters<typeof isoCBOR.encode>[0];

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function uint32(value: number) {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, value);
  return out;
}

/** Web Crypto signs as r‖s; WebAuthn wants the ASN.1 DER form. */
function derSignature(raw: Uint8Array) {
  const integer = (bytes: Uint8Array) => {
    let start = 0;
    while (start < bytes.length - 1 && bytes[start] === 0) start++;
    const trimmed = bytes.slice(start);
    const body =
      (trimmed[0] ?? 0) & 0x80 ? concat(Uint8Array.of(0), trimmed) : trimmed;
    return concat(Uint8Array.of(0x02, body.length), body);
  };
  const body = concat(integer(raw.slice(0, 32)), integer(raw.slice(32)));
  return concat(Uint8Array.of(0x30, body.length), body);
}
