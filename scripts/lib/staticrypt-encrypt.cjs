"use strict";

// StatiCrypt 3.5.4 turns every ciphertext byte into its own JavaScript string.
// A full week cap (6 weeks x 80 photos, plus the allowed videos) is over 200MB
// of HTML. The old per-byte hex loop peaks above the 8GB heap Actions can spare.
// This preload only replaces that hex step. AES, HMAC, and the password hash stay
// the same, so the page still opens with the existing password.

const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");

const ENGINE_SUFFIX = `${path.sep}staticrypt${path.sep}lib${path.sep}cryptoEngine.js`;
const HEX_NEEDLE = `    stringify: function (bytes) {
        const hexBytes = [];

        for (let i = 0; i < bytes.length; ++i) {
            let byteString = bytes[i].toString(16);
            if (byteString.length < 2) {
                byteString = "0" + byteString;
            }
            hexBytes.push(byteString);
        }
        return hexBytes.join("");
    },`;

function encodeHex(bytes) {
  const alphabet = "0123456789abcdef";
  const decoder = new TextDecoder();
  const chunkBytes = 65536;
  const parts = new Array(Math.ceil(bytes.length / chunkBytes));
  for (let part = 0, offset = 0; offset < bytes.length; part += 1, offset += chunkBytes) {
    const end = Math.min(bytes.length, offset + chunkBytes);
    const hex = new Uint8Array((end - offset) * 2);
    for (let i = offset, j = 0; i < end; i += 1, j += 2) {
      const byte = bytes[i];
      hex[j] = alphabet.charCodeAt(byte >> 4);
      hex[j + 1] = alphabet.charCodeAt(byte & 15);
    }
    parts[part] = decoder.decode(hex);
  }
  return parts.join("");
}

function patchCryptoEngineSource(source) {
  const normalized = source.replace(/\r\n/g, "\n");
  if (!normalized.includes(HEX_NEEDLE)) {
    return normalized.includes("function encodeHex(bytes)") ? normalized : null;
  }
  const patched = normalized.replace(
    HEX_NEEDLE,
    `    stringify: function (bytes) {
        return encodeHex(bytes);
    },`,
  );
  return `${encodeHex.toString()}\n${patched}`;
}

function installCryptoEngineHook() {
  const current = Module._extensions[".js"];
  if (current.fctChunkedHex) return;
  function compile(module, filename) {
    if (!filename.endsWith(ENGINE_SUFFIX)) return current(module, filename);
    const patched = patchCryptoEngineSource(fs.readFileSync(filename, "utf8"));
    if (!patched) {
      throw new Error("StatiCrypt 加密程式同預期唔同，未能改用慳記憶體嘅 hex。今次不會發佈。");
    }
    module._compile(patched, filename);
  }
  compile.fctChunkedHex = true;
  Module._extensions[".js"] = compile;
}

installCryptoEngineHook();

module.exports = { encodeHex, patchCryptoEngineSource };
