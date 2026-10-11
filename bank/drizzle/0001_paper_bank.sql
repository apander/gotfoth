-- Paper bank. Question identity is stable; wording and mark schemes are revisions.

CREATE TABLE specifications (
  id uuid PRIMARY KEY,
  board text NOT NULL,
  qualification text NOT NULL,
  code text NOT NULL UNIQUE,
  subject text NOT NULL
);

CREATE TABLE components (
  id uuid PRIMARY KEY,
  specification_id uuid NOT NULL REFERENCES specifications(id),
  code text NOT NULL,
  title text NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
  total_marks integer NOT NULL CHECK (total_marks > 0),
  themes text[] NOT NULL,
  UNIQUE (specification_id, code)
);

CREATE TABLE series (
  id uuid PRIMARY KEY,
  name text NOT NULL UNIQUE
);

CREATE TABLE papers (
  id uuid PRIMARY KEY,
  component_id uuid NOT NULL REFERENCES components(id),
  series_id uuid NOT NULL REFERENCES series(id),
  exam_date date,
  instructions text NOT NULL DEFAULT '',
  permission_confirmed boolean NOT NULL DEFAULT false,
  status text NOT NULL CHECK (status IN ('draft', 'reviewed', 'published')),
  parser_version text NOT NULL,
  UNIQUE (component_id, series_id)
);

CREATE TABLE source_files (
  id uuid PRIMARY KEY,
  paper_id uuid NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('question_paper', 'source_booklet', 'mark_scheme')),
  filename text NOT NULL,
  sha256 text NOT NULL,
  page_count integer NOT NULL CHECK (page_count > 0),
  local_path text NOT NULL,
  pearson_code text,
  scheme_date date,
  UNIQUE (paper_id, role),
  UNIQUE (sha256, role)
);

CREATE TABLE pages (
  id uuid PRIMARY KEY,
  source_file_id uuid NOT NULL REFERENCES source_files(id) ON DELETE CASCADE,
  page_number integer NOT NULL CHECK (page_number > 0),
  text text NOT NULL,
  has_figure boolean NOT NULL DEFAULT false,
  UNIQUE (source_file_id, page_number)
);

CREATE TABLE sections (
  id uuid PRIMARY KEY,
  paper_id uuid NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  label text NOT NULL,
  marks integer NOT NULL CHECK (marks > 0),
  instruction text NOT NULL DEFAULT '',
  sort_order integer NOT NULL,
  UNIQUE (paper_id, label)
);

CREATE TABLE extracts (
  id uuid PRIMARY KEY,
  section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  label text NOT NULL,
  body text NOT NULL,
  page_start integer NOT NULL,
  page_end integer NOT NULL,
  needs_figure boolean NOT NULL DEFAULT false,
  UNIQUE (section_id, label)
);

CREATE TABLE questions (
  id text PRIMARY KEY,
  paper_id uuid NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  parent_number integer NOT NULL CHECK (parent_number > 0),
  part text NOT NULL,
  response_format text NOT NULL CHECK (response_format IN ('calculation', 'short', 'diagram', 'levels')),
  UNIQUE (paper_id, parent_number, part)
);

CREATE TABLE question_revisions (
  id uuid PRIMARY KEY,
  question_id text NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  revision integer NOT NULL CHECK (revision > 0),
  stem text NOT NULL,
  command_word text NOT NULL,
  marks integer NOT NULL CHECK (marks > 0),
  source_pages integer[] NOT NULL,
  UNIQUE (question_id, revision)
);

CREATE TABLE question_extracts (
  question_revision_id uuid NOT NULL REFERENCES question_revisions(id) ON DELETE CASCADE,
  extract_id uuid NOT NULL REFERENCES extracts(id) ON DELETE CASCADE,
  cited boolean NOT NULL DEFAULT false,
  PRIMARY KEY (question_revision_id, extract_id)
);

CREATE TABLE mark_schemes (
  id uuid PRIMARY KEY,
  paper_id uuid NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  source_file_id uuid NOT NULL REFERENCES source_files(id) ON DELETE CASCADE,
  revised_on date,
  guidance text NOT NULL DEFAULT ''
);

CREATE TABLE scheme_items (
  id uuid PRIMARY KEY,
  mark_scheme_id uuid NOT NULL REFERENCES mark_schemes(id) ON DELETE CASCADE,
  question_revision_id uuid NOT NULL REFERENCES question_revisions(id) ON DELETE CASCADE,
  style text NOT NULL CHECK (style IN ('points', 'levels')),
  ao_knowledge integer NOT NULL DEFAULT 0 CHECK (ao_knowledge >= 0),
  ao_application integer NOT NULL DEFAULT 0 CHECK (ao_application >= 0),
  ao_analysis integer NOT NULL DEFAULT 0 CHECK (ao_analysis >= 0),
  ao_evaluation integer NOT NULL DEFAULT 0 CHECK (ao_evaluation >= 0),
  quantitative_skills text[] NOT NULL DEFAULT '{}',
  source_text text NOT NULL DEFAULT '',
  UNIQUE (mark_scheme_id, question_revision_id)
);

CREATE OR REPLACE FUNCTION scheme_item_marks_match() RETURNS trigger AS $$
DECLARE
  expected integer;
BEGIN
  SELECT marks INTO expected FROM question_revisions WHERE id = NEW.question_revision_id;
  IF expected IS NULL OR expected <> NEW.ao_knowledge + NEW.ao_application + NEW.ao_analysis + NEW.ao_evaluation THEN
    RAISE EXCEPTION 'assessment objective marks do not match the question marks';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER scheme_item_marks_match
BEFORE INSERT OR UPDATE ON scheme_items
FOR EACH ROW EXECUTE FUNCTION scheme_item_marks_match();

CREATE TABLE point_credits (
  id uuid PRIMARY KEY,
  scheme_item_id uuid NOT NULL REFERENCES scheme_items(id) ON DELETE CASCADE,
  strand text NOT NULL CHECK (strand IN ('knowledge', 'application', 'analysis', 'evaluation')),
  marks integer NOT NULL CHECK (marks > 0),
  criterion text NOT NULL,
  examples text NOT NULL DEFAULT '',
  award_note text NOT NULL DEFAULT '',
  sort_order integer NOT NULL
);

CREATE TABLE indicative_points (
  id uuid PRIMARY KEY,
  scheme_item_id uuid NOT NULL REFERENCES scheme_items(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('definition', 'application', 'counterbalance', 'judgement', 'note')),
  text text NOT NULL,
  sort_order integer NOT NULL
);

CREATE TABLE level_bands (
  id uuid PRIMARY KEY,
  scheme_item_id uuid NOT NULL REFERENCES scheme_items(id) ON DELETE CASCADE,
  level integer NOT NULL CHECK (level >= 0),
  min_mark integer NOT NULL CHECK (min_mark >= 0),
  max_mark integer NOT NULL CHECK (max_mark >= min_mark),
  descriptor text NOT NULL,
  UNIQUE (scheme_item_id, level)
);

CREATE TABLE topics (
  id uuid PRIMARY KEY,
  specification_id uuid NOT NULL REFERENCES specifications(id),
  theme text NOT NULL,
  label text NOT NULL,
  UNIQUE (specification_id, theme, label)
);

CREATE TABLE question_topics (
  question_id text NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  topic_id uuid NOT NULL REFERENCES topics(id),
  confirmed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (question_id, topic_id)
);

CREATE TABLE reviews (
  id uuid PRIMARY KEY,
  question_revision_id uuid NOT NULL REFERENCES question_revisions(id) ON DELETE CASCADE,
  decision text NOT NULL CHECK (decision IN ('accept', 'reject')),
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE publications (
  id uuid PRIMARY KEY,
  paper_id uuid NOT NULL REFERENCES papers(id) ON DELETE CASCADE,
  published_at timestamptz NOT NULL DEFAULT now(),
  content_hash text NOT NULL,
  snapshot jsonb NOT NULL,
  UNIQUE (paper_id, content_hash)
);

CREATE TABLE import_runs (
  id uuid PRIMARY KEY,
  sha256 text NOT NULL,
  parser_version text NOT NULL,
  issues jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sha256, parser_version)
);

INSERT INTO specifications (id, board, qualification, code, subject)
VALUES (
  '00000000-0000-4000-8000-0000000009b0',
  'Pearson Edexcel',
  'GCE A Level',
  '9BS0',
  'Business'
) ON CONFLICT (code) DO NOTHING;

INSERT INTO components (id, specification_id, code, title, duration_minutes, total_marks, themes)
VALUES
  (
    '00000000-0000-4000-8000-000000000001',
    '00000000-0000-4000-8000-0000000009b0',
    '01',
    'Marketing, people and global businesses',
    120,
    100,
    ARRAY['Theme 1 Marketing and people', 'Theme 4 Global business']
  ),
  (
    '00000000-0000-4000-8000-000000000002',
    '00000000-0000-4000-8000-0000000009b0',
    '02',
    'Business activities, decisions and strategy',
    120,
    100,
    ARRAY['Theme 2 Managing business activities', 'Theme 3 Business decisions and strategy']
  ),
  (
    '00000000-0000-4000-8000-000000000003',
    '00000000-0000-4000-8000-0000000009b0',
    '03',
    'Investigating business in a competitive environment',
    120,
    100,
    ARRAY[
      'Theme 1 Marketing and people',
      'Theme 2 Managing business activities',
      'Theme 3 Business decisions and strategy',
      'Theme 4 Global business'
    ]
  )
ON CONFLICT (specification_id, code) DO NOTHING;

INSERT INTO series (id, name)
VALUES ('00000000-0000-4000-8000-000000002025', 'Summer 2025')
ON CONFLICT (name) DO NOTHING;

INSERT INTO topics (id, specification_id, theme, label)
VALUES
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-0000000009b0', 'Theme 1', 'Marketing and people'),
  ('00000000-0000-4000-8000-000000000102', '00000000-0000-4000-8000-0000000009b0', 'Theme 2', 'Managing business activities'),
  ('00000000-0000-4000-8000-000000000103', '00000000-0000-4000-8000-0000000009b0', 'Theme 3', 'Business decisions and strategy'),
  ('00000000-0000-4000-8000-000000000104', '00000000-0000-4000-8000-0000000009b0', 'Theme 4', 'Global business')
ON CONFLICT (specification_id, theme, label) DO NOTHING;
