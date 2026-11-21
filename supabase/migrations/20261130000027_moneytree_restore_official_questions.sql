BEGIN;

-- Restore the official MoneyTree question list and reorder it by database timestamp.
--
-- This migration deliberately avoids deleting rows or rewriting unrelated MoneyTree data.
-- It deactivates obvious temporary/test rows if they match the placeholder naming patterns
-- used during local QA, and inserts the approved 20-question set in the required order.
-- Existing rows that already match the official wording are left intact to preserve IDs and
-- discussion relationships.

WITH seed_citizen AS (
    SELECT id AS creator_id
    FROM public.citizens
    ORDER BY created_at ASC, id
    LIMIT 1
),
official_questions(seq, title, prompt) AS (
    VALUES
        (1, 'What underrated careers are necessary to build a new civilization?',
         'What underrated careers are necessary to build a new civilization?'),
        (2, 'How should the government address the growing gap between wealthy and working-class citizens?',
         'How should the government address the growing gap between wealthy and working-class citizens?'),
        (3, 'If you could introduce one major reform that would change the world, what would it be?',
         'If you could introduce one major reform that would change the world, what would it be?'),
        (4, 'Should there be censorship on social media, and if so, to what extent?',
         'Should there be censorship on social media, and if so, to what extent?'),
        (5, 'Which deserves more government funding: education, healthcare, infrastructure, or public safety? And why?',
         'Which deserves more government funding: education, healthcare, infrastructure, or public safety? And why?'),
        (6, 'How should a new civilization balance national security with citizens'' privacy?',
         'How should a new civilization balance national security with citizens'' privacy?'),
        (7, 'How should a civilization balance individual rights with the needs of the greater population?',
         'How should a civilization balance individual rights with the needs of the greater population?'),
        (8, 'How should a nation determine which behaviors deserve criminal punishment versus rehabilitation?',
         'How should a nation determine which behaviors deserve criminal punishment versus rehabilitation?'),
        (9, 'How should a civilization prepare for widespread unemployment caused by automation and AI?',
         'How should a civilization prepare for widespread unemployment caused by automation and AI?'),
        (10, 'Should citizens be required to contribute to society through public service, military service, or community work? Why or why not?',
         'Should citizens be required to contribute to society through public service, military service, or community work? Why or why not?'),
        (11, 'Should people be allowed to accumulate unlimited wealth, or should there be a point where society places limits on personal fortunes? Why?',
         'Should people be allowed to accumulate unlimited wealth, or should there be a point where society places limits on personal fortunes? Why?'),
        (12, 'If a civilization could eliminate poverty but doing so required significantly higher taxes on everyone, would that be a fair trade-off? Why or why not?',
         'If a civilization could eliminate poverty but doing so required significantly higher taxes on everyone, would that be a fair trade-off? Why or why not?'),
        (13, 'What should a society do when its laws no longer reflect what its citizens consider morally right?',
         'What should a society do when its laws no longer reflect what its citizens consider morally right?'),
        (14, 'Should governments have the power to restrict certain technologies if they believe those technologies could threaten humanity''s future?',
         'Should governments have the power to restrict certain technologies if they believe those technologies could threaten humanity''s future?'),
        (15, 'If humanity had to start civilization over tomorrow, what is the first mistake from modern society that you would make sure never happens again?',
         'If humanity had to start civilization over tomorrow, what is the first mistake from modern society that you would make sure never happens again?'),
        (16, 'Who is your favorite villain from any anime or cartoon, and do you agree with their beliefs, motivations, or methods? Why or why not?',
         'Who is your favorite villain from any anime or cartoon, and do you agree with their beliefs, motivations, or methods? Why or why not?'),
        (17, 'Which sport takes the most skill, and why?',
         'Which sport takes the most skill, and why?'),
        (18, 'Which artist, musician, or band has had the greatest influence on music, and what makes their impact so significant?',
         'Which artist, musician, or band has had the greatest influence on music, and what makes their impact so significant?'),
        (19, 'What was the most influential video game system and what was the best game on it and why?',
         'What was the most influential video game system and what was the best game on it and why?'),
        (20, 'What is something you strongly believe in that most people disagree with, and what makes you stand by that opinion?',
         'What is something you strongly believe in that most people disagree with, and what makes you stand by that opinion?')
),
question_rows AS (
    SELECT
        q.seq,
        q.title,
        q.prompt,
        now() + ((21 - q.seq) * interval '1 second') AS created_at,
        sc.creator_id
    FROM official_questions q
    CROSS JOIN seed_citizen sc
)
INSERT INTO public.moneytree_discussions (
    discussion_type,
    title,
    prompt,
    created_by_citizen_id,
    is_active,
    created_at
)
SELECT
    'question',
    qr.title,
    qr.prompt,
    qr.creator_id,
    true,
    qr.created_at
FROM question_rows qr
WHERE NOT EXISTS (
    SELECT 1
    FROM public.moneytree_discussions existing
    WHERE existing.discussion_type = 'question'
      AND existing.title = qr.title
      AND existing.prompt = qr.prompt
);

-- Deactivate obviously temporary QA rows without deleting their contribution history.
UPDATE public.moneytree_discussions AS md
SET is_active = false,
    archived_at = COALESCE(md.archived_at, now())
WHERE md.discussion_type = 'question'
  AND md.is_active = true
  AND (
      md.title ILIKE '%test%'
      OR md.prompt ILIKE '%test%'
      OR md.title ~ '^Question [0-9]+$'
      OR md.title ~ '^MoneyTree question [0-9]+$'
      OR md.title ~ '^Temporary.*Question.*$'
      OR md.prompt ~ '^Temporary.*$'
  );

COMMIT;
