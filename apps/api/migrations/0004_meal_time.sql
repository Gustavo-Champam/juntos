ALTER TABLE meal_plans
  ADD COLUMN time varchar(5) NOT NULL DEFAULT '12:30';

UPDATE meal_plans SET time = '07:15' WHERE meal_type = 'breakfast';
UPDATE meal_plans SET time = '12:30' WHERE meal_type = 'lunch';
UPDATE meal_plans SET time = '19:00' WHERE meal_type = 'dinner';

CREATE TABLE space_prefs (
  space_id uuid PRIMARY KEY REFERENCES couple_spaces(id),
  breakfast_time varchar(5) NOT NULL DEFAULT '07:15',
  lunch_time varchar(5) NOT NULL DEFAULT '12:30',
  dinner_time varchar(5) NOT NULL DEFAULT '19:00'
);
