CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE users (
    id            uuid PRIMARY KEY,
    email         varchar(320) NOT NULL,
    password_hash varchar(100) NOT NULL,
    display_name  varchar(80)  NOT NULL,
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));

CREATE TABLE refresh_tokens (
    id          uuid PRIMARY KEY,
    user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  varchar(64) NOT NULL UNIQUE, -- sha-256 hex; raw token only lives in the cookie
    expires_at  timestamptz NOT NULL,
    revoked_at  timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);

-- Every graph node (reel, GitHub star, topic) for every user.
CREATE TABLE nodes (
    id                uuid PRIMARY KEY,
    user_id           uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind              varchar(16)   NOT NULL,
    source_key        varchar(512)  NOT NULL,
    title             varchar(300)  NOT NULL,
    summary           text          NOT NULL DEFAULT '',
    url               varchar(2000),
    status            varchar(16)   NOT NULL,
    error_code        varchar(64),
    error_message     varchar(1000),
    data              jsonb         NOT NULL DEFAULT '{}'::jsonb,
    embedding         vector(384),
    ingest_token_hash varchar(64),
    ingest_started_at timestamptz,
    created_at        timestamptz   NOT NULL DEFAULT now(),
    updated_at        timestamptz   NOT NULL DEFAULT now(),
    CONSTRAINT nodes_user_source_uq UNIQUE (user_id, source_key)
);
CREATE INDEX nodes_user_kind_idx ON nodes (user_id, kind);
CREATE INDEX nodes_user_status_idx ON nodes (user_id, status);
-- No ANN index yet: per-user exact scans are correct and fast at personal scale.
-- TODO(scale): HNSW + `SET hnsw.iterative_scan = relaxed_order` once users have 10k+ nodes.

-- Structural edges (reel -> topic). Similarity edges are computed on read.
CREATE TABLE edges (
    user_id uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    src     uuid        NOT NULL REFERENCES nodes (id) ON DELETE CASCADE,
    dst     uuid        NOT NULL REFERENCES nodes (id) ON DELETE CASCADE,
    kind    varchar(16) NOT NULL,
    weight  real        NOT NULL DEFAULT 1,
    PRIMARY KEY (src, dst, kind)
);
CREATE INDEX edges_user_idx ON edges (user_id);
CREATE INDEX edges_dst_idx ON edges (dst);
