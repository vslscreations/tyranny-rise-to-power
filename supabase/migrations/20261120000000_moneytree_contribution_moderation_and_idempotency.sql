BEGIN;

ALTER TABLE public.moneytree_contributions
    ADD COLUMN moderation_state text NOT NULL DEFAULT 'pending'
    CHECK (moderation_state IN ('pending', 'approved', 'rejected')),
    ADD COLUMN submission_request_id uuid NOT NULL;

ALTER TABLE public.moneytree_contributions
    ADD CONSTRAINT moneytree_contributions_citizen_request_id_unique
    UNIQUE (citizen_id, submission_request_id);

COMMIT;
