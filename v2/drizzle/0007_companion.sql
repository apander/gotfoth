CREATE TABLE teacher_groups (
  id uuid PRIMARY KEY, owner_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,owner_id)
);
CREATE TABLE teacher_group_members (
  group_id uuid NOT NULL, owner_id text NOT NULL,
  family_id uuid NOT NULL, learner_id uuid NOT NULL,
  PRIMARY KEY(group_id,learner_id),
  FOREIGN KEY(group_id,owner_id) REFERENCES teacher_groups(id,owner_id) ON DELETE CASCADE,
  FOREIGN KEY(learner_id,family_id) REFERENCES learners(id,family_id) ON DELETE CASCADE
);
CREATE TABLE reminder_preferences (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  family_id uuid REFERENCES families(id) ON DELETE CASCADE,
  scope text NOT NULL, data jsonb NOT NULL DEFAULT '{}', PRIMARY KEY(user_id,scope)
);
CREATE TABLE reminder_state (
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  family_id uuid REFERENCES families(id) ON DELETE CASCADE,
  key text NOT NULL, read_at timestamptz, snoozed_until timestamptz,
  PRIMARY KEY(user_id,key)
);
DO $$ DECLARE t text; grantee_name text; BEGIN
  FOREACH t IN ARRAY ARRAY['teacher_groups','teacher_group_members','reminder_preferences','reminder_state'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
    EXECUTE format('CREATE POLICY actor_isolation ON %I USING (%I = current_setting(''app.user_id'',true)) WITH CHECK (%I = current_setting(''app.user_id'',true))',t,CASE WHEN t LIKE 'teacher_%' THEN 'owner_id' ELSE 'user_id' END,CASE WHEN t LIKE 'teacher_%' THEN 'owner_id' ELSE 'user_id' END);
    FOR grantee_name IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='learners' AND privilege_type='SELECT' AND grantee<>'PUBLIC' LOOP
      EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON %I TO %I',t,grantee_name);
    END LOOP;
  END LOOP;
END $$;
CREATE INDEX group_members_family ON teacher_group_members(family_id,learner_id);
CREATE INDEX activity_history ON assessments(learner_id,state,published_at DESC);
CREATE INDEX diary_start ON study_sessions(family_id,((data->>'start')));
