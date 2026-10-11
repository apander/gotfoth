CREATE TABLE figures (
  id uuid PRIMARY KEY,
  extract_id uuid NOT NULL REFERENCES extracts(id) ON DELETE CASCADE,
  page_number integer NOT NULL CHECK (page_number > 0),
  media_type text NOT NULL,
  width integer NOT NULL CHECK (width > 0),
  height integer NOT NULL CHECK (height > 0),
  sha256 text NOT NULL,
  png bytea NOT NULL
);
