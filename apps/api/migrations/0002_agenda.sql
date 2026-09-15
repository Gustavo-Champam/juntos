CREATE TABLE agenda_state (
  space_id uuid PRIMARY KEY REFERENCES couple_spaces(id),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);

CREATE TABLE agenda_events (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES couple_spaces(id),
  title varchar(120) NOT NULL,
  date date NOT NULL,
  time varchar(5) NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  location varchar(200) NOT NULL,
  notes varchar(2000) NOT NULL,
  assignee_id uuid REFERENCES users(id),
  weekly boolean NOT NULL,
  recurrence_until date,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  CHECK (recurrence_until IS NULL OR (weekly AND recurrence_until >= date))
);

CREATE INDEX agenda_events_space_date_idx ON agenda_events(space_id, date);
CREATE INDEX agenda_events_space_weekly_idx ON agenda_events(space_id, weekly) WHERE deleted_at IS NULL;

CREATE TABLE agenda_activity (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES couple_spaces(id),
  event_id uuid NOT NULL REFERENCES agenda_events(id),
  actor_id uuid NOT NULL REFERENCES users(id),
  action varchar(16) NOT NULL CHECK(action IN ('created', 'updated', 'deleted')),
  version integer NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX agenda_activity_space_created_idx ON agenda_activity(space_id, created_at);
