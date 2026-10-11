CREATE UNIQUE INDEX IF NOT EXISTS memberships_one_student_family
  ON memberships (user_id)
  WHERE role = 'student' AND active;
