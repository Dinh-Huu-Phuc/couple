begin;

-- Daily purge applies only to completed new-workflow operations metadata.
-- It never deletes active jobs, user content, or existing legacy archives.
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('couple-purge-erasure-audit','0 3 * * *',
  'select api.purge_deletion_audit();');

commit;
