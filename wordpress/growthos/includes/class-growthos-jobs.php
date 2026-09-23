<?php
if (!defined('ABSPATH')) exit;
final class GrowthOS_Jobs {
 const HOOK='growthos_run_jobs';
 public static function schedule(): void { if(!wp_next_scheduled(self::HOOK))wp_schedule_event(time()+60,'growthos_five_minutes',self::HOOK); }
 public static function unschedule(): void { $t=wp_next_scheduled(self::HOOK);if($t)wp_unschedule_event($t,self::HOOK); }
 public static function run(): void {
  global $wpdb;$t=$wpdb->prefix.'growthos_jobs';
  if(get_transient('growthos_worker_lock'))return;set_transient('growthos_worker_lock',1,240);
  $cutoff=gmdate('Y-m-d H:i:s',time()-900);$stale=$wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE status='running' AND updated_at<%s",$cutoff),ARRAY_A);foreach($stale as $s){$terminal=(int)$s['attempts']>=(int)$s['max_attempts'];$wpdb->update($t,['status'=>$terminal?'failed':'queued','error'=>'STALE_JOB_RECOVERED','updated_at'=>current_time('mysql')],['id'=>$s['id']]);}
  self::block_dependents_of_failed_jobs($t);
  $jobs=$wpdb->get_results("SELECT j.* FROM $t j WHERE j.status='queued' AND j.attempts<j.max_attempts AND NOT EXISTS (SELECT 1 FROM $t p WHERE p.site_id=j.site_id AND JSON_UNQUOTE(JSON_EXTRACT(p.payload,'$.batch'))=JSON_UNQUOTE(JSON_EXTRACT(j.payload,'$.batch')) AND CAST(JSON_UNQUOTE(JSON_EXTRACT(p.payload,'$.sequence')) AS UNSIGNED)<CAST(JSON_UNQUOTE(JSON_EXTRACT(j.payload,'$.sequence')) AS UNSIGNED) AND p.status<>'completed') ORDER BY j.id ASC LIMIT 10",ARRAY_A);
  foreach($jobs as $job)self::execute($job);delete_transient('growthos_worker_lock');
 }
 private static function block_dependents_of_failed_jobs(string $t): void {
  global $wpdb;$queued=$wpdb->get_results("SELECT id,site_id,payload FROM $t WHERE status='queued'",ARRAY_A);foreach($queued as $job){$p=json_decode($job['payload']?:'{}',true);if(!is_array($p)||empty($p['batch'])||!isset($p['sequence']))continue;$failed=$wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE site_id=%d AND status='failed' AND JSON_UNQUOTE(JSON_EXTRACT(payload,'$.batch'))=%s AND CAST(JSON_UNQUOTE(JSON_EXTRACT(payload,'$.sequence')) AS UNSIGNED)<%d ORDER BY id ASC LIMIT 1",(int)$job['site_id'],(string)$p['batch'],(int)$p['sequence']));if($failed)$wpdb->update($t,['status'=>'blocked','error'=>'BLOCKED_BY_FAILED_PREDECESSOR:'.(int)$failed,'updated_at'=>current_time('mysql')],['id'=>(int)$job['id'],'status'=>'queued']);}
 }
 private static function execute(array $job): void {
  global $wpdb;$t=$wpdb->prefix.'growthos_jobs';$id=(int)$job['id'];$attempt=(int)$job['attempts']+1;
  $claimed=$wpdb->query($wpdb->prepare("UPDATE $t SET status='running',attempts=%d,updated_at=%s WHERE id=%d AND status='queued'",$attempt,current_time('mysql'),$id));
  if($claimed!==1)return;
  try{
   $payload=json_decode($job['payload']?:'{}',true);if(!is_array($payload))throw new RuntimeException('JOB_PAYLOAD_INVALID');
   $result=apply_filters('growthos_execute_job',null,$job['job_type'],$payload,$job);
   if($result===null)throw new RuntimeException('JOB_HANDLER_MISSING');
   $wpdb->update($t,['status'=>'completed','result'=>wp_json_encode($result),'error'=>null,'updated_at'=>current_time('mysql')],['id'=>$id]);
  }catch(Throwable $e){
   $terminal=$attempt>=(int)$job['max_attempts'];$wpdb->update($t,['status'=>$terminal?'failed':'queued','error'=>sanitize_text_field($e->getMessage()),'updated_at'=>current_time('mysql')],['id'=>$id]);
  }
 }
}
