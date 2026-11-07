-- Run as the job owner. Refuse to remove a job with an unexpected command.
do $$
declare
  target record;
begin
  if to_regclass('cron.job') is null then
    return;
  end if;

  for target in
    select jobid, command from cron.job where jobname = 'zalo-auto-approve-every-minute'
  loop
    if position('/api/cron/zalo-auto-approve' in target.command) = 0 then
      raise exception 'Verify the command for Zalo Auto Approve job % before unscheduling', target.jobid;
    end if;
    if not cron.unschedule(target.jobid) then
      raise exception 'Could not unschedule Zalo Auto Approve job %', target.jobid;
    end if;
  end loop;
end $$;
