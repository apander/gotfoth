ALTER TABLE learners ADD COLUMN weekly_goal integer NOT NULL DEFAULT 3 CHECK (weekly_goal BETWEEN 1 AND 7);
ALTER TABLE learners ADD COLUMN goal_timezone text NOT NULL DEFAULT 'UTC';
CREATE INDEX assessments_review_queue ON assessments (family_id, state, learner_id);
