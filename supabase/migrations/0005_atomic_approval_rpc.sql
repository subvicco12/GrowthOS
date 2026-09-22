-- Atomic approval RPC: recommendation decision + idempotency + audit in one database transaction.
create or replace function public.decide_recommendation(
  p_recommendation_id uuid,
  p_actor_id uuid,
  p_decision text,
  p_note text,
  p_idempotency_key text
) returns public.recommendations
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.recommendations%rowtype;
  prior public.approvals%rowtype;
begin
  if p_actor_id is null or p_idempotency_key is null or btrim(p_idempotency_key)='' then raise exception 'APPROVAL_INPUT_INVALID'; end if;
  if p_decision not in ('approved','rejected','deferred') then raise exception 'APPROVAL_DECISION_INVALID'; end if;
  select * into prior from public.approvals where idempotency_key=p_idempotency_key;
  if found then
    if prior.recommendation_id<>p_recommendation_id or prior.actor_id is distinct from p_actor_id or prior.decision<>p_decision then raise exception 'APPROVAL_IDEMPOTENCY_CONFLICT'; end if;
    select * into r from public.recommendations where id=p_recommendation_id;
    if not found then raise exception 'RECOMMENDATION_NOT_FOUND'; end if;
    return r;
  end if;
  select * into r from public.recommendations where id=p_recommendation_id for update;
  if not found then raise exception 'RECOMMENDATION_NOT_FOUND'; end if;
  if not ((r.status='proposed' and p_decision in ('approved','rejected','deferred')) or (r.status='approved' and p_decision in ('rejected','deferred')) or (r.status='deferred' and p_decision in ('approved','rejected'))) then raise exception 'INVALID_RECOMMENDATION_TRANSITION'; end if;
  insert into public.approvals(recommendation_id,actor_id,decision,note,idempotency_key) values(p_recommendation_id,p_actor_id,p_decision,p_note,p_idempotency_key);
  update public.recommendations set status=p_decision where id=p_recommendation_id returning * into r;
  insert into public.audit_events(actor_id,site_id,action,resource_type,resource_id,reason,before_data,after_data)
  values(p_actor_id,r.site_id,'recommendation.decision','recommendation',p_recommendation_id,coalesce(p_note,p_decision),jsonb_build_object('status',case when p_decision='approved' then 'proposed' else null end),jsonb_build_object('status',p_decision));
  return r;
end $$;
revoke all on function public.decide_recommendation(uuid,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.decide_recommendation(uuid,uuid,text,text,text) to service_role;
