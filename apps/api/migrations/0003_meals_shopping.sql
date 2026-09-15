CREATE TABLE meal_plans (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES couple_spaces(id),
  date date NOT NULL,
  meal_type varchar(16) NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
  recipe_id varchar(64),
  title varchar(120) NOT NULL,
  prep_minutes integer NOT NULL DEFAULT 0 CHECK (prep_minutes BETWEEN 0 AND 240),
  quick boolean NOT NULL DEFAULT false,
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL,
  UNIQUE (space_id, date, meal_type)
);

CREATE INDEX meal_plans_space_date_idx ON meal_plans (space_id, date);

CREATE TABLE shopping_items (
  id uuid PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES couple_spaces(id),
  week_start date NOT NULL,
  name varchar(120) NOT NULL,
  quantity varchar(80) NOT NULL DEFAULT '',
  category varchar(32) NOT NULL DEFAULT 'outros',
  note varchar(200) NOT NULL DEFAULT '',
  source varchar(16) NOT NULL CHECK (source IN ('auto', 'manual')),
  ingredient_key varchar(160),
  checked boolean NOT NULL DEFAULT false,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL
);

CREATE INDEX shopping_items_space_week_idx ON shopping_items (space_id, week_start);
