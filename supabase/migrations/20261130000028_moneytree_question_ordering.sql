BEGIN;

-- Add explicit, durable ordering for question discussions.
-- This keeps MoneyTree question ordering outside of created_at timestamps and
-- allows the display layer to order by category + sort_order without disrupting
-- existing player contributions or discussion IDs.
ALTER TABLE public.moneytree_discussions
    ADD COLUMN IF NOT EXISTS question_category text;

ALTER TABLE public.moneytree_discussions
    ADD COLUMN IF NOT EXISTS question_category_priority integer;

ALTER TABLE public.moneytree_discussions
    ADD COLUMN IF NOT EXISTS sort_order integer;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'moneytree_discussions_question_category_check'
    ) THEN
        ALTER TABLE public.moneytree_discussions
            ADD CONSTRAINT moneytree_discussions_question_category_check
            CHECK (
                question_category IS NULL
                OR question_category IN ('main', 'misc')
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'moneytree_discussions_question_category_priority_check'
    ) THEN
        ALTER TABLE public.moneytree_discussions
            ADD CONSTRAINT moneytree_discussions_question_category_priority_check
            CHECK (
                question_category_priority IS NULL
                OR question_category_priority IN (1, 2)
            );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'moneytree_discussions_question_sort_order_check'
    ) THEN
        ALTER TABLE public.moneytree_discussions
            ADD CONSTRAINT moneytree_discussions_question_sort_order_check
            CHECK (
                question_category IS NULL
                OR sort_order IS NOT NULL
            );
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_moneytree_discussions_question_order
    ON public.moneytree_discussions (question_category_priority, sort_order)
    WHERE discussion_type = 'question' AND question_category_priority IS NOT NULL;

-- Normalize the approved list to an explicit ordered state without deleting or recreating
-- discussion records. This migration updates existing rows by exact question wording and
-- preserves the current discussion IDs and any contribution history attached to them.
WITH official_questions AS (
    SELECT * FROM (VALUES
        ('main', 1, 1, 'What underrated careers are necessary to build a new civilization?'),
        ('main', 1, 2, 'How should the government address the growing gap between wealthy and working-class citizens?'),
        ('main', 1, 3, 'If you could introduce one major reform that would change the world, what would it be?'),
        ('main', 1, 4, 'Should there be censorship on social media, and if so, to what extent?'),
        ('main', 1, 5, 'Which deserves more government funding: education, healthcare, infrastructure, or public safety? And why?'),
        ('main', 1, 6, 'How should a new civilization balance national security with citizens'' privacy?'),
        ('main', 1, 7, 'How should a civilization balance individual rights with the needs of the greater population?'),
        ('main', 1, 8, 'How should a nation determine which behaviors deserve criminal punishment versus rehabilitation?'),
        ('main', 1, 9, 'How should a civilization prepare for widespread unemployment caused by automation and AI?'),
        ('main', 1, 10, 'Should citizens be required to contribute to society through public service, military service, or community work? Why or why not?'),
        ('main', 1, 11, 'Should people be allowed to accumulate unlimited wealth, or should there be a point where society places limits on personal fortunes? Why?'),
        ('main', 1, 12, 'If a civilization could eliminate poverty but doing so required significantly higher taxes on everyone, would that be a fair trade-off? Why or why not?'),
        ('main', 1, 13, 'What should a society do when its laws no longer reflect what its citizens consider morally right?'),
        ('main', 1, 14, 'Should governments have the power to restrict certain technologies if they believe those technologies could threaten humanity''s future?'),
        ('main', 1, 15, 'If humanity had to start civilization over tomorrow, what is the first mistake from modern society that you would make sure never happens again?'),
        ('misc', 2, 16, 'Who is your favorite villain from any anime or cartoon, and do you agree with their beliefs, motivations, or methods? Why or why not?'),
        ('misc', 2, 17, 'Which sport takes the most skill, and why?'),
        ('misc', 2, 18, 'Which artist, musician, or band has had the greatest influence on music, and what makes their impact so significant?'),
        ('misc', 2, 19, 'What was the most influential video game system and what was the best game on it and why?'),
        ('misc', 2, 20, 'What is something you strongly believe in that most people disagree with, and what makes you stand by that opinion?')
    ) AS official(question_category, question_category_priority, sort_order, question_text)
)
UPDATE public.moneytree_discussions AS md
SET question_category = q.question_category,
    question_category_priority = q.question_category_priority,
    sort_order = q.sort_order
FROM official_questions AS q
WHERE md.discussion_type = 'question'
  AND (
      md.title = q.question_text
      OR md.prompt = q.question_text
  )
  AND md.id = (
      SELECT latest.id
      FROM public.moneytree_discussions AS latest
      WHERE latest.discussion_type = 'question'
        AND (
            latest.title = q.question_text
            OR latest.prompt = q.question_text
        )
      ORDER BY latest.created_at DESC, latest.id
      LIMIT 1
  )
  AND (
      md.question_category IS DISTINCT FROM q.question_category
      OR md.question_category_priority IS DISTINCT FROM q.question_category_priority
      OR md.sort_order IS DISTINCT FROM q.sort_order
  );

-- Any remaining question rows without an explicit order keep their current IDs but get a stable
-- fallback ordering instead of relying on created_at for display.
UPDATE public.moneytree_discussions
SET question_category = COALESCE(question_category, 'main'),
    question_category_priority = COALESCE(question_category_priority,
        CASE WHEN question_category = 'misc' THEN 2 ELSE 1 END),
    sort_order = COALESCE(sort_order, 9999)
WHERE discussion_type = 'question'
  AND (question_category IS NULL OR question_category_priority IS NULL OR sort_order IS NULL);

COMMIT;
