-- Private libraries are scoped to the identity supplied by Sites, never client input.
CREATE TABLE lumen_heads (
  owner TEXT PRIMARY KEY NOT NULL,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- Base64 chunks keep every D1 value below 64 KiB, including Unicode lecture text.
CREATE TABLE lumen_chunks (
  owner TEXT NOT NULL,
  revision INTEGER NOT NULL,
  part INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (owner, revision, part),
  FOREIGN KEY (owner) REFERENCES lumen_heads(owner)
);
