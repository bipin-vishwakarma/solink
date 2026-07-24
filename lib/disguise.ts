// Boss Mode disguise engine.
//
// Turns a chat message into a plausible-looking line of source code. The generated code
// does NOT contain the real message text — the plaintext is held only in memory and shown
// only when the user taps to reveal. The mask is deterministic per message id, so a message
// always renders as the same "code" instead of reshuffling on every re-render.

export type TokenKind =
  | "kw"
  | "fn"
  | "str"
  | "num"
  | "comment"
  | "type"
  | "var"
  | "punct"
  | "plain";

export interface Token {
  kind: TokenKind;
  value: string;
}

// ---------- deterministic pseudo-randomness (seeded by message id) ----------

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function makeRng(seed: number): () => number {
  let state = seed || 1;
  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

// ---------- vocabulary that makes generated lines feel real ----------

const NOUNS = [
  "payload", "session", "config", "buffer", "request", "response", "token",
  "context", "handler", "result", "record", "cursor", "channel", "socket",
  "packet", "state", "cache", "queue", "worker", "stream", "schema", "node",
];
const VERBS = [
  "handle", "process", "resolve", "validate", "parse", "encode", "decode",
  "fetch", "commit", "flush", "sync", "dispatch", "normalize", "hydrate",
  "serialize", "connect", "register", "emit", "transform", "map",
];
const TYPES = ["Buffer", "Promise", "Map", "Record", "Uint8Array", "Response", "Config", "Result"];
const MODULES = ["crypto", "net", "fs/promises", "./utils", "./store", "events", "stream"];
const PROPS = ["id", "length", "status", "size", "offset", "count", "flags", "kind"];

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------- line templates ----------
// Each returns an array of tokens. Templates take an rng for variety.

type Template = (rng: () => number) => Token[];

const T = {
  kw: (v: string): Token => ({ kind: "kw", value: v }),
  fn: (v: string): Token => ({ kind: "fn", value: v }),
  str: (v: string): Token => ({ kind: "str", value: v }),
  num: (v: string): Token => ({ kind: "num", value: v }),
  ty: (v: string): Token => ({ kind: "type", value: v }),
  vr: (v: string): Token => ({ kind: "var", value: v }),
  p: (v: string): Token => ({ kind: "punct", value: v }),
  x: (v: string): Token => ({ kind: "plain", value: v }),
  comment: (v: string): Token => ({ kind: "comment", value: v }),
};

const TEMPLATES: Template[] = [
  (r) => {
    const v = pick(r, VERBS) + cap(pick(r, NOUNS));
    return [T.kw("const"), T.x(" "), T.vr(v), T.x(" "), T.p("="), T.x(" "),
      T.kw("await"), T.x(" "), T.fn(pick(r, VERBS)), T.p("("), T.vr(pick(r, NOUNS)), T.p(");")];
  },
  (r) => [
    T.kw("function"), T.x(" "), T.fn(pick(r, VERBS) + cap(pick(r, NOUNS))),
    T.p("("), T.vr(pick(r, NOUNS)), T.p(":"), T.x(" "), T.ty(pick(r, TYPES)), T.p(")"), T.x(" "), T.p("{"),
  ],
  (r) => [
    T.kw("return"), T.x(" "), T.fn(pick(r, VERBS)), T.p("("),
    T.vr(pick(r, NOUNS)), T.p("."), T.vr(pick(r, PROPS)), T.p(");"),
  ],
  (r) => [
    T.kw("import"), T.x(" "), T.p("{"), T.x(" "), T.vr(pick(r, VERBS)), T.p(","), T.x(" "),
    T.vr(pick(r, VERBS)), T.x(" "), T.p("}"), T.x(" "), T.kw("from"), T.x(" "),
    T.str(`"${pick(r, MODULES)}"`), T.p(";"),
  ],
  (r) => [
    T.kw("if"), T.x(" "), T.p("("), T.p("!"), T.vr(pick(r, NOUNS)), T.p("."),
    T.vr(pick(r, PROPS)), T.p(")"), T.x(" "), T.kw("throw"), T.x(" "), T.kw("new"), T.x(" "),
    T.ty("Error"), T.p("("), T.str(`"invalid ${pick(r, NOUNS)}"`), T.p(");"),
  ],
  (r) => [
    T.kw("const"), T.x(" "), T.vr(pick(r, NOUNS)), T.x(" "), T.p("="), T.x(" "),
    T.kw("new"), T.x(" "), T.ty(pick(r, TYPES)), T.p("("), T.num(String(Math.floor(r() * 4096))), T.p(");"),
  ],
  (r) => [
    T.vr(pick(r, NOUNS)), T.p("."), T.fn("on"), T.p("("), T.str(`"${pick(r, VERBS)}"`),
    T.p(","), T.x(" "), T.p("("), T.vr(pick(r, PROPS)), T.p(")"), T.x(" "), T.p("=>"), T.x(" "),
    T.fn(pick(r, VERBS)), T.p("("), T.vr(pick(r, PROPS)), T.p("));"),
  ],
  (r) => [
    T.kw("export"), T.x(" "), T.kw("const"), T.x(" "), T.vr(pick(r, NOUNS).toUpperCase()),
    T.x(" "), T.p("="), T.x(" "), T.num("0x" + Math.floor(r() * 65535).toString(16)), T.p(";"),
  ],
  (r) => [
    T.comment(`// TODO: ${pick(r, VERBS)} ${pick(r, NOUNS)} before ${pick(r, VERBS)}`),
  ],
  (r) => [
    T.kw("await"), T.x(" "), T.vr(pick(r, NOUNS)), T.p("."), T.fn(pick(r, VERBS)),
    T.p("("), T.p("{"), T.x(" "), T.vr(pick(r, PROPS)), T.p(":"), T.x(" "),
    T.kw("true"), T.x(" "), T.p("}"), T.p(");"),
  ],
  (r) => [
    T.kw("let"), T.x(" "), T.p("["), T.vr(pick(r, NOUNS)), T.p(","), T.x(" "),
    T.vr(pick(r, NOUNS)), T.p("]"), T.x(" "), T.p("="), T.x(" "), T.kw("await"), T.x(" "),
    T.ty("Promise"), T.p("."), T.fn("all"), T.p("("), T.vr(pick(r, NOUNS)), T.p(");"),
  ],
  (r) => [
    T.vr("console"), T.p("."), T.fn("log"), T.p("("),
    T.str(`"[${pick(r, NOUNS)}]"`), T.p(","), T.x(" "), T.vr(pick(r, NOUNS)), T.p("."),
    T.vr(pick(r, PROPS)), T.p(");"),
  ],
];

/**
 * Render a message id into a stable list of syntax tokens (the "code" mask).
 * The real text is never embedded here.
 */
export function codeFor(id: string): Token[] {
  const rng = makeRng(hashString(id));
  const template = TEMPLATES[hashString(id) % TEMPLATES.length];
  return template(rng);
}

/** A fake but plausible filename for a message, used for IDE tabs / file tree. */
export function fileNameFor(id: string): string {
  const rng = makeRng(hashString(id + "file"));
  const bases = ["handler", "session", "router", "crypto", "store", "socket", "worker", "codec"];
  const exts = ["ts", "tsx", "js"];
  return `${pick(rng, bases)}.${pick(rng, exts)}`;
}
