create table if not exists couple_spaces (
  id text primary key,
  name text not null,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists space_members (
  space_id text not null references couple_spaces (id),
  user_id text not null,
  display_name text not null,
  email text,
  avatar_url text,
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create unique index if not exists space_members_one_space_idx on space_members (user_id);

create table if not exists invitations (
  id text primary key,
  space_id text not null references couple_spaces (id),
  code_hash text not null unique,
  invited_email text,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists agenda_events (
  id text primary key,
  space_id text not null references couple_spaces (id),
  title text not null,
  date date not null,
  time text not null,
  duration_minutes integer not null,
  location text not null default '',
  notes text not null default '',
  assignee_id text,
  weekly boolean not null default false,
  recurrence_until date,
  version integer not null default 1,
  created_by text not null,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists agenda_events_space_date_idx on agenda_events (space_id, date);

create table if not exists meal_plans (
  id text primary key,
  space_id text not null references couple_spaces (id),
  date date not null,
  meal_type text not null,
  recipe_id text,
  title text not null,
  prep_minutes integer not null default 0,
  quick boolean not null default false,
  updated_by text not null,
  updated_at timestamptz not null default now(),
  unique (space_id, date, meal_type)
);

create index if not exists meal_plans_space_date_idx on meal_plans (space_id, date);

create table if not exists shopping_items (
  id text primary key,
  space_id text not null references couple_spaces (id),
  week_start date not null,
  name text not null,
  quantity text not null default '',
  category text not null default 'outros',
  note text not null default '',
  source text not null,
  ingredient_key text,
  checked boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default now()
);

create index if not exists shopping_items_space_week_idx on shopping_items (space_id, week_start);
