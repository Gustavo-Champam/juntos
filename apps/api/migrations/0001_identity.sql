CREATE TABLE users (
  id uuid PRIMARY KEY,
  google_subject varchar(255) NOT NULL UNIQUE,
  email varchar(254) NOT NULL,
  display_name varchar(120) NOT NULL,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_email_normalized CHECK (email = lower(email))
);

CREATE TABLE couple_spaces (
  id uuid PRIMARY KEY,
  name varchar(80) NOT NULL,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE TABLE memberships (
  space_id uuid NOT NULL REFERENCES couple_spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  role varchar(16) NOT NULL CHECK (role IN ('owner', 'partner')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sessions_hash_length CHECK (octet_length(token_hash) = 32)
);

CREATE TABLE invitations (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES couple_spaces(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  invited_email varchar(254),
  token_hash bytea NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  accepted_by uuid REFERENCES users(id),
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT invitations_email_normalized
    CHECK (invited_email IS NULL OR invited_email = lower(invited_email)),
  CONSTRAINT invitations_hash_length CHECK (octet_length(token_hash) = 32)
);

CREATE INDEX sessions_active_token_hash_idx
  ON sessions (token_hash) WHERE revoked_at IS NULL;
CREATE INDEX invitations_active_token_hash_idx
  ON invitations (token_hash) WHERE revoked_at IS NULL AND accepted_at IS NULL;
CREATE INDEX memberships_space_id_idx ON memberships (space_id);
CREATE INDEX sessions_user_id_expires_at_idx ON sessions (user_id, expires_at);
