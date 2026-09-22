<?php
if (!defined('ABSPATH')) exit;
final class GrowthOS_REST {
 public static function register_routes(): void {
  register_rest_route('growthos/v1','/health',['methods'=>'GET','callback'=>fn()=>new WP_REST_Response(['ok'=>true,'version'=>GROWTHOS_VERSION,'host'=>GROWTHOS_PRODUCTION_HOST],200),'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/sites',['methods'=>'GET','callback'=>[self::class,'sites'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/sites',['methods'=>'POST','callback'=>[self::class,'create_site'],'permission_callback'=>fn()=>current_user_can('growthos_manage')]);
  register_rest_route('growthos/v1','/dashboard',['methods'=>'GET','callback'=>[self::class,'dashboard'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/connectors',['methods'=>'GET','callback'=>[self::class,'connectors'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/connectors',['methods'=>'POST','callback'=>[self::class,'upsert_connector'],'permission_callback'=>fn()=>current_user_can('growthos_manage')]);
  register_rest_route('growthos/v1','/jobs',['methods'=>'GET','callback'=>[self::class,'jobs'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/jobs',['methods'=>'POST','callback'=>[self::class,'create_job'],'permission_callback'=>fn()=>current_user_can('growthos_manage')]);
  register_rest_route('growthos/v1','/recommendations',['methods'=>'GET','callback'=>[self::class,'recommendations'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/features',['methods'=>'POST','callback'=>[self::class,'create_feature'],'permission_callback'=>fn()=>current_user_can('growthos_manage')]);
  register_rest_route('growthos/v1','/features',['methods'=>'GET','callback'=>[self::class,'features'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/features/(?P<id>\\d+)',['methods'=>'POST','callback'=>[self::class,'update_feature'],'permission_callback'=>fn()=>current_user_can('growthos_manage')]);
  register_rest_route('growthos/v1','/recommendations/(?P<id>\\d+)/decision',['methods'=>'POST','callback'=>[self::class,'decide'],'permission_callback'=>fn()=>current_user_can('growthos_approve')]);
 }
 public static function sites(): WP_REST_Response {
  global $wpdb; $table=$wpdb->prefix.'growthos_sites';
  return new WP_REST_Response(['sites'=>$wpdb->get_results("SELECT id,name,domain,status,created_at FROM $table ORDER BY id DESC",ARRAY_A)],200);
 }
 public static function create_site(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$name=sanitize_text_field((string)$request->get_param('name'));$domain=strtolower(trim(sanitize_text_field((string)$request->get_param('domain'))));
  $domain=preg_replace('#^https?://#','',$domain);$domain=rtrim($domain,'/');
  if($name===''||$domain===''||!preg_match('/^[a-z0-9.-]+$/',$domain))return new WP_REST_Response(['ok'=>false,'code'=>'SITE_INPUT_INVALID'],400);
  $t=$wpdb->prefix.'growthos_sites';if(false===$wpdb->insert($t,['name'=>$name,'domain'=>$domain,'status'=>'active']))return new WP_REST_Response(['ok'=>false,'code'=>'SITE_CREATE_FAILED'],409);
  return new WP_REST_Response(['ok'=>true,'site'=>['id'=>$wpdb->insert_id,'name'=>$name,'domain'=>$domain,'status'=>'active']],201);
 }
 public static function dashboard(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');$p=$wpdb->prefix.'growthos_';$where=$site?$wpdb->prepare(' WHERE site_id=%d',$site):'';
  $data=['sites'=>(int)$wpdb->get_var("SELECT COUNT(*) FROM {$p}sites"),'recommendations'=>(int)$wpdb->get_var("SELECT COUNT(*) FROM {$p}recommendations".$where),'pending_approvals'=>(int)$wpdb->get_var("SELECT COUNT(*) FROM {$p}recommendations".$where.($where?' AND':' WHERE')." status='proposed'"),'queued_jobs'=>(int)$wpdb->get_var("SELECT COUNT(*) FROM {$p}jobs".$where.($where?' AND':' WHERE')." status='queued'"),'degraded_connectors'=>(int)$wpdb->get_var("SELECT COUNT(*) FROM {$p}connectors".$where.($where?' AND':' WHERE')." status='degraded'")];
  return new WP_REST_Response(['ok'=>true,'scope'=>$site?:'portfolio','metrics'=>$data],200);
 }
 public static function connectors(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');$t=$wpdb->prefix.'growthos_connectors';$rows=$site?$wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE site_id=%d ORDER BY kind",$site),ARRAY_A):$wpdb->get_results("SELECT * FROM $t ORDER BY site_id,kind",ARRAY_A);
  return new WP_REST_Response(['connectors'=>$rows],200);
 }
 public static function upsert_connector(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');$kind=sanitize_key((string)$request->get_param('kind'));$status=sanitize_key((string)$request->get_param('status'));
  if(!$site||$kind===''||!in_array($status,['needs_connection','connected','degraded','disabled'],true))return new WP_REST_Response(['ok'=>false,'code'=>'CONNECTOR_INPUT_INVALID'],400);
  $t=$wpdb->prefix.'growthos_connectors';$existing=$wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE site_id=%d AND kind=%s",$site,$kind),ARRAY_A);
  $data=['site_id'=>$site,'kind'=>$kind,'status'=>$status,'last_seen_at'=>current_time('mysql'),'last_error'=>sanitize_textarea_field((string)$request->get_param('last_error'))?:null];
  $ok=$existing?$wpdb->update($t,$data,['id'=>$existing['id']]):$wpdb->insert($t,$data);
  if(false===$ok)return new WP_REST_Response(['ok'=>false,'code'=>'CONNECTOR_UPDATE_FAILED'],500);
  return new WP_REST_Response(['ok'=>true,'connector'=>$data],$existing?200:201);
 }
 public static function jobs(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');$t=$wpdb->prefix.'growthos_jobs';
  $rows=$site?$wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE site_id=%d ORDER BY id DESC LIMIT 100",$site),ARRAY_A):$wpdb->get_results("SELECT * FROM $t ORDER BY id DESC LIMIT 100",ARRAY_A);
  return new WP_REST_Response(['jobs'=>$rows],200);
 }
 public static function create_job(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');$type=sanitize_key((string)$request->get_param('job_type'));$key=sanitize_text_field((string)$request->get_param('idempotency_key'));
  if($type==='')return new WP_REST_Response(['ok'=>false,'code'=>'JOB_INPUT_INVALID'],400);
  $t=$wpdb->prefix.'growthos_jobs';$payload=wp_json_encode($request->get_param('payload')??[]);
  if($key!==''){$prior=$wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE idempotency_key=%s",$key),ARRAY_A);if($prior)return new WP_REST_Response(['ok'=>true,'job'=>$prior,'idempotent'=>true],200);}
  $data=['site_id'=>$site?:null,'job_type'=>$type,'status'=>'queued','payload'=>$payload,'attempts'=>0,'max_attempts'=>3,'idempotency_key'=>$key?:null,'updated_at'=>current_time('mysql')];
  if(false===$wpdb->insert($t,$data))return new WP_REST_Response(['ok'=>false,'code'=>'JOB_CREATE_FAILED'],500);
  $data['id']=$wpdb->insert_id;return new WP_REST_Response(['ok'=>true,'job'=>$data],201);
 }
 public static function recommendations(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');$status=sanitize_key((string)$request->get_param('status'));$t=$wpdb->prefix.'growthos_recommendations';
  $where=[];$args=[];if($site){$where[]='site_id=%d';$args[]=$site;}if($status!==''){$where[]='status=%s';$args[]=$status;}
  $sql="SELECT * FROM $t".($where?' WHERE '.implode(' AND ',$where):'').' ORDER BY score DESC,id DESC LIMIT 100';
  if($args)$sql=$wpdb->prepare($sql,...$args);
  return new WP_REST_Response(['recommendations'=>$wpdb->get_results($sql,ARRAY_A)],200);
 }
 public static function create_feature(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');$key=sanitize_key((string)$request->get_param('feature_key'));$name=sanitize_text_field((string)$request->get_param('name'));
  if(!$site||$key===''||$name==='')return new WP_REST_Response(['ok'=>false,'code'=>'FEATURE_INPUT_INVALID'],400);
  $t=$wpdb->prefix.'growthos_features';$data=['site_id'=>$site,'feature_key'=>$key,'name'=>$name,'state'=>'on','free_enabled'=>1,'pro_enabled'=>1,'business_enabled'=>1,'rollout_percent'=>100,'updated_at'=>current_time('mysql')];
  if(false===$wpdb->insert($t,$data))return new WP_REST_Response(['ok'=>false,'code'=>'FEATURE_CREATE_FAILED'],409);$data['id']=$wpdb->insert_id;
  return new WP_REST_Response(['ok'=>true,'feature'=>$data],201);
 }
 public static function features(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');$t=$wpdb->prefix.'growthos_features';
  $rows=$site?$wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE site_id=%d ORDER BY name",$site),ARRAY_A):[];
  return new WP_REST_Response(['features'=>$rows],200);
 }
 public static function update_feature(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$id=(int)$request['id'];$state=sanitize_key((string)$request->get_param('state'));
  if(!in_array($state,['on','off','maintenance','beta','admin-only'],true))return new WP_REST_Response(['ok'=>false,'code'=>'FEATURE_STATE_INVALID'],400);
  $t=$wpdb->prefix.'growthos_features';$e=$wpdb->prefix.'growthos_audit_events';$before=$wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE id=%d",$id),ARRAY_A);
  if(!$before)return new WP_REST_Response(['ok'=>false,'code'=>'FEATURE_NOT_FOUND'],404);
  $data=['state'=>$state,'updated_at'=>current_time('mysql')];
  foreach(['free_enabled','pro_enabled','business_enabled'] as $k){if(null!==$request->get_param($k))$data[$k]=(int)(bool)$request->get_param($k);}
  if(null!==$request->get_param('rollout_percent'))$data['rollout_percent']=max(0,min(100,(int)$request->get_param('rollout_percent')));
  if(false===$wpdb->update($t,$data,['id'=>$id]))return new WP_REST_Response(['ok'=>false,'code'=>'FEATURE_UPDATE_FAILED'],500);
  $wpdb->insert($e,['actor_id'=>get_current_user_id(),'site_id'=>$before['site_id'],'action'=>'feature.updated','object_type'=>'feature','object_id'=>(string)$id,'before_data'=>wp_json_encode($before),'after_data'=>wp_json_encode(array_merge($before,$data))]);
  return new WP_REST_Response(['ok'=>true,'feature'=>array_merge($before,$data)],200);
 }
 public static function decide(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;
  $rid=(int)$request['id']; $actor=get_current_user_id();
  $decision=sanitize_key((string)$request->get_param('decision'));
  $key=sanitize_text_field((string)$request->get_param('idempotency_key'));
  $note=sanitize_textarea_field((string)$request->get_param('note'));
  if(!in_array($decision,['approved','rejected','deferred'],true)||$key==='')return new WP_REST_Response(['ok'=>false,'code'=>'APPROVAL_INPUT_INVALID'],400);
  $r=$wpdb->prefix.'growthos_recommendations';$a=$wpdb->prefix.'growthos_approvals';$e=$wpdb->prefix.'growthos_audit_events';
  $wpdb->query('START TRANSACTION');
  try{
   $prior=$wpdb->get_row($wpdb->prepare("SELECT * FROM $a WHERE idempotency_key=%s FOR UPDATE",$key),ARRAY_A);
   if($prior){
    if((int)$prior['recommendation_id']!==$rid||(int)$prior['actor_id']!==$actor||$prior['decision']!==$decision)throw new Exception('APPROVAL_IDEMPOTENCY_CONFLICT');
    $row=$wpdb->get_row($wpdb->prepare("SELECT * FROM $r WHERE id=%d",$rid),ARRAY_A);$wpdb->query('COMMIT');
    return new WP_REST_Response(['ok'=>true,'recommendation'=>$row,'idempotent'=>true],200);
   }
   $row=$wpdb->get_row($wpdb->prepare("SELECT * FROM $r WHERE id=%d FOR UPDATE",$rid),ARRAY_A);
   if(!$row)throw new Exception('RECOMMENDATION_NOT_FOUND');
   $allowed=($row['status']==='proposed')||($row['status']==='approved'&&in_array($decision,['rejected','deferred'],true))||($row['status']==='deferred'&&in_array($decision,['approved','rejected'],true));
   if(!$allowed)throw new Exception('INVALID_RECOMMENDATION_TRANSITION');
   if(false===$wpdb->insert($a,['recommendation_id'=>$rid,'actor_id'=>$actor,'decision'=>$decision,'note'=>$note?:null,'idempotency_key'=>$key]))throw new Exception('APPROVAL_PERSISTENCE_FAILED');
   $before=$row['status'];
   if(false===$wpdb->update($r,['status'=>$decision],['id'=>$rid]))throw new Exception('APPROVAL_PERSISTENCE_FAILED');
   $wpdb->insert($e,['actor_id'=>$actor,'site_id'=>$row['site_id'],'action'=>'recommendation.decision','object_type'=>'recommendation','object_id'=>(string)$rid,'before_data'=>wp_json_encode(['status'=>$before]),'after_data'=>wp_json_encode(['status'=>$decision])]);
   $wpdb->query('COMMIT');$row['status']=$decision;
   return new WP_REST_Response(['ok'=>true,'recommendation'=>$row],200);
  }catch(Throwable $x){$wpdb->query('ROLLBACK');$code=$x->getMessage();$status=$code==='RECOMMENDATION_NOT_FOUND'?404:(in_array($code,['APPROVAL_IDEMPOTENCY_CONFLICT','INVALID_RECOMMENDATION_TRANSITION'],true)?409:500);return new WP_REST_Response(['ok'=>false,'code'=>$status===500?'APPROVAL_FAILED':$code],$status);}
 }
}
