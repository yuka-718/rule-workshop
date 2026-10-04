export const MAX_CODE_BYTES = 8192;
export const MAX_HASH_LENGTH = 24000;
export function validateShare(value) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(",") !== "code,hints,v"
  )
    throw new Error("共有データの形式が正しくありません。");
  if (value.v !== 1)
    throw new Error("この共有URLのバージョンには対応していません。");
  if (
    typeof value.code !== "string" ||
    !value.code.trim() ||
    new TextEncoder().encode(value.code).length > MAX_CODE_BYTES
  )
    throw new Error("共有ルールが空、または8,192バイトを超えています。");
  if (
    !Array.isArray(value.hints) ||
    value.hints.length !== 9 ||
    !value.hints.every((v) => v === null || v === "red" || v === "blue")
  )
    throw new Error("共有ヒントが正しくありません。");
  return { v: 1, code: value.code, hints: [...value.hints] };
}
export function encodeShare(code, hints) {
  const bytes = new TextEncoder().encode(
    JSON.stringify(validateShare({ v: 1, code, hints })),
  );
  const hash =
    "#p=" +
    btoa(String.fromCharCode(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, "");
  if (hash.length > MAX_HASH_LENGTH)
    throw new Error("共有URLが長すぎます。ルールを短くしてください。");
  return hash;
}
export function decodeShare(hash) {
  if (hash.length > MAX_HASH_LENGTH) throw new Error("共有URLが大きすぎます。");
  if (!/^#p=[A-Za-z0-9_-]+$/.test(hash))
    throw new Error("共有URLが壊れています。URL全体をコピーしてください。");
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(
        atob(hash.slice(3).replaceAll("-", "+").replaceAll("_", "/")),
        (c) => c.charCodeAt(0),
      ),
    );
    return validateShare(JSON.parse(text));
  } catch (error) {
    if (
      error.message?.startsWith("共有") ||
      error.message?.startsWith("この共有")
    )
      throw error;
    throw new Error("共有URLのデータを読み取れませんでした。");
  }
}
