CREATE TABLE public.saved_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  student_id text NOT NULL CHECK (char_length(student_id) BETWEEN 1 AND 80),
  attendance real NOT NULL,
  study_hours real NOT NULL,
  assignment_completion real NOT NULL,
  previous_score real NOT NULL,
  internal_marks real NOT NULL,
  absences integer NOT NULL,
  mathematics real NOT NULL,
  programming real NOT NULL,
  electronics real NOT NULL,
  predicted_score real NOT NULL,
  risk_probability real NOT NULL CHECK (risk_probability BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.saved_predictions TO authenticated;
GRANT ALL ON public.saved_predictions TO service_role;
ALTER TABLE public.saved_predictions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Own predictions readable" ON public.saved_predictions FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Own predictions insertable" ON public.saved_predictions FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Own predictions deletable" ON public.saved_predictions FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX saved_predictions_user_created_idx ON public.saved_predictions (user_id, created_at DESC);