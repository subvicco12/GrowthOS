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
  register_rest_route('growthos/v1','/measurements',['methods'=>['GET','POST'],'callback'=>[self::class,'measurements'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/measurements',['methods'=>['GET','POST'],'callback'=>[self::class,'measurements'],'permission_callback'=>fn()=>current_user_can('growthos_access')&&($_SERVER['REQUEST_METHOD']==='GET'||current_user_can('growthos_manage'))]);
  register_rest_route('growthos/v1','/executions/from-approved',['methods'=>'POST','callback'=>[self::class,'create_execution'],'permission_callback'=>fn()=>current_user_can('growthos_manage')]);
  register_rest_route('growthos/v1','/executions/(?P<id>\\d+)/verify',['methods'=>'POST','callback'=>[self::class,'verify_execution'],'permission_callback'=>fn()=>current_user_can('growthos_manage')]);
  register_rest_route('growthos/v1','/executions',['methods'=>'GET','callback'=>[self::class,'executions'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/execution-queue',['methods'=>'GET','callback'=>[self::class,'execution_queue'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/portfolio-actions',['methods'=>'GET','callback'=>[self::class,'portfolio_actions'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/portfolio-health',['methods'=>'GET','callback'=>[self::class,'portfolio_health'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/readiness',['methods'=>'GET','callback'=>[self::class,'readiness'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/security-status',['methods'=>'GET','callback'=>[self::class,'security_status'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/system-health/repair-worker',['methods'=>'POST','callback'=>[self::class,'repair_worker'],'permission_callback'=>fn()=>current_user_can('growthos_manage')]);
  register_rest_route('growthos/v1','/system-health',['methods'=>'GET','callback'=>[self::class,'system_health'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/recommendations/summary',['methods'=>'GET','callback'=>[self::class,'recommendation_summary'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/plan-intelligence/recommend',['methods'=>'POST','callback'=>[self::class,'recommend_plan_intelligence'],'permission_callback'=>fn()=>current_user_can('growthos_manage')]);
  register_rest_route('growthos/v1','/plan-intelligence',['methods'=>'GET','callback'=>[self::class,'plan_intelligence'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/package-gap/recommend',['methods'=>'POST','callback'=>[self::class,'recommend_package_gaps'],'permission_callback'=>fn()=>current_user_can('growthos_manage')]);
  register_rest_route('growthos/v1','/package-gap',['methods'=>'GET','callback'=>[self::class,'package_gap'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/competitors',['methods'=>'GET','callback'=>[self::class,'competitors'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/competitors',['methods'=>'POST','callback'=>[self::class,'save_competitor'],'permission_callback'=>fn()=>current_user_can('growthos_manage')]);
  register_rest_route('growthos/v1','/competitor-packages',['methods'=>'GET','callback'=>[self::class,'competitor_packages'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/competitor-packages',['methods'=>'POST','callback'=>[self::class,'save_competitor_package'],'permission_callback'=>fn()=>current_user_can('growthos_manage')]);
  register_rest_route('growthos/v1','/retry-job/(?P<id>\\d+)',['methods'=>'POST','callback'=>[self::class,'retry_job'],'permission_callback'=>fn()=>current_user_can('growthos_manage')]);
  register_rest_route('growthos/v1','/scan-status',['methods'=>'GET','callback'=>[self::class,'scan_status'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/scan',['methods'=>'POST','callback'=>[self::class,'scan'],'permission_callback'=>fn()=>current_user_can('growthos_manage')]);
  register_rest_route('growthos/v1','/health-score',['methods'=>'GET','callback'=>[self::class,'health_score'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/discoveries',['methods'=>'GET','callback'=>[self::class,'discoveries'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/audit',['methods'=>'GET','callback'=>[self::class,'audit'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/jobs',['methods'=>'GET','callback'=>[self::class,'jobs'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/jobs',['methods'=>'POST','callback'=>[self::class,'create_job'],'permission_callback'=>fn()=>current_user_can('growthos_manage')]);
  register_rest_route('growthos/v1','/recommendations',['methods'=>'POST','callback'=>[self::class,'create_recommendation'],'permission_callback'=>fn()=>current_user_can('growthos_manage')]);
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
 public static function measurements(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$p=$wpdb->prefix.'growthos_';if($request->get_method()==='GET'){$site=(int)$request->get_param('site_id');$where=$site?$wpdb->prepare("WHERE m.site_id=%d",$site):'';$rows=$wpdb->get_results("SELECT m.*,e.recommendation_id,r.title,s.name site_name FROM {$p}measurements m JOIN {$p}executions e ON e.id=m.execution_id JOIN {$p}recommendations r ON r.id=e.recommendation_id JOIN {$p}sites s ON s.id=m.site_id $where ORDER BY m.created_at DESC LIMIT 200",ARRAY_A);return new WP_REST_Response(['items'=>$rows,'count'=>count($rows)],200);}if(!current_user_can('growthos_manage'))return new WP_REST_Response(['error'=>'FORBIDDEN'],403);$eid=(int)$request->get_param('execution_id');$e=$wpdb->get_row($wpdb->prepare("SELECT id,site_id,verification_status FROM {$p}executions WHERE id=%d",$eid),ARRAY_A);if(!$e)return new WP_REST_Response(['error'=>'EXECUTION_NOT_FOUND'],404);if($e['verification_status']!=='passed')return new WP_REST_Response(['error'=>'VERIFIED_EXECUTION_REQUIRED'],409);$key=sanitize_key((string)$request->get_param('metric_key'));$evidence=sanitize_textarea_field((string)$request->get_param('evidence'));if(!$key||!$evidence)return new WP_REST_Response(['error'=>'METRIC_AND_EVIDENCE_REQUIRED'],400);$base=$request->get_param('baseline_value');$obs=$request->get_param('observed_value');$data=['execution_id'=>$eid,'site_id'=>(int)$e['site_id'],'metric_key'=>$key,'baseline_value'=>is_numeric($base)?$base:null,'observed_value'=>is_numeric($obs)?$obs:null,'unit'=>sanitize_text_field((string)$request->get_param('unit')),'window_start'=>sanitize_text_field((string)$request->get_param('window_start'))?:null,'window_end'=>sanitize_text_field((string)$request->get_param('window_end'))?:null,'evidence'=>$evidence];$wpdb->insert($p.'measurements',$data);return new WP_REST_Response(['id'=>(int)$wpdb->insert_id]+$data,201);
 }
 public static function measurements(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$p=$wpdb->prefix.'growthos_';if($request->get_method()==='GET'){$eid=(int)$request->get_param('execution_id');$where=$eid?$wpdb->prepare("WHERE m.execution_id=%d",$eid):'';$rows=$wpdb->get_results("SELECT m.*,e.recommendation_id,r.title,s.name site_name FROM {$p}measurements m JOIN {$p}executions e ON e.id=m.execution_id JOIN {$p}recommendations r ON r.id=e.recommendation_id JOIN {$p}sites s ON s.id=m.site_id $where ORDER BY m.measured_at DESC,m.id DESC LIMIT 200",ARRAY_A);return new WP_REST_Response(['items'=>$rows,'count'=>count($rows)],200);}$eid=(int)$request->get_param('execution_id');$e=$wpdb->get_row($wpdb->prepare("SELECT id,site_id,verification_status FROM {$p}executions WHERE id=%d",$eid),ARRAY_A);if(!$e)return new WP_REST_Response(['error'=>'EXECUTION_NOT_FOUND'],404);if($e['verification_status']!=='passed')return new WP_REST_Response(['error'=>'VERIFIED_EXECUTION_REQUIRED'],409);$metric=sanitize_key((string)$request->get_param('metric_key'));$period=sanitize_key((string)$request->get_param('period'));if(!$metric||!in_array($period,['baseline','after'],true))return new WP_REST_Response(['error'=>'INVALID_MEASUREMENT'],400);$value=$request->get_param('value');if(!is_numeric($value))return new WP_REST_Response(['error'=>'NUMERIC_VALUE_REQUIRED'],400);$evidence=sanitize_textarea_field((string)$request->get_param('evidence'));if($evidence==='')return new WP_REST_Response(['error'=>'MEASUREMENT_EVIDENCE_REQUIRED'],400);$wpdb->insert($p.'measurements',['execution_id'=>$eid,'site_id'=>(int)$e['site_id'],'metric_key'=>$metric,'period'=>$period,'value'=>(float)$value,'unit'=>sanitize_text_field((string)$request->get_param('unit')),'evidence'=>$evidence],['%d','%d','%s','%s','%f','%s','%s']);return new WP_REST_Response(['id'=>(int)$wpdb->insert_id,'execution_id'=>$eid,'metric_key'=>$metric,'period'=>$period],201);
 }
 public static function create_execution(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$p=$wpdb->prefix.'growthos_';$rid=(int)$request->get_param('recommendation_id');$r=$wpdb->get_row($wpdb->prepare("SELECT id,site_id,status FROM {$p}recommendations WHERE id=%d",$rid),ARRAY_A);if(!$r)return new WP_REST_Response(['error'=>'RECOMMENDATION_NOT_FOUND'],404);if($r['status']!=='approved')return new WP_REST_Response(['error'=>'APPROVAL_REQUIRED'],409);$existing=$wpdb->get_row($wpdb->prepare("SELECT * FROM {$p}executions WHERE recommendation_id=%d",$rid),ARRAY_A);if($existing)return new WP_REST_Response($existing,200);$ok=$wpdb->insert($p.'executions',['recommendation_id'=>$rid,'site_id'=>(int)$r['site_id'],'status'=>'ready','verification_status'=>'pending'],['%d','%d','%s','%s']);if(!$ok)return new WP_REST_Response(['error'=>'EXECUTION_CREATE_FAILED'],500);return new WP_REST_Response(['id'=>(int)$wpdb->insert_id,'recommendation_id'=>$rid,'status'=>'ready','verification_status'=>'pending'],201);
 }
 public static function verify_execution(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$p=$wpdb->prefix.'growthos_';$id=(int)$request['id'];$e=$wpdb->get_row($wpdb->prepare("SELECT * FROM {$p}executions WHERE id=%d",$id),ARRAY_A);if(!$e)return new WP_REST_Response(['error'=>'EXECUTION_NOT_FOUND'],404);$status=sanitize_key((string)$request->get_param('status'));if(!in_array($status,['passed','failed'],true))return new WP_REST_Response(['error'=>'INVALID_VERIFICATION_STATUS'],400);$evidence=sanitize_textarea_field((string)$request->get_param('evidence'));if($evidence==='')return new WP_REST_Response(['error'=>'VERIFICATION_EVIDENCE_REQUIRED'],400);$newStatus=$status==='passed'?'verified':'needs_attention';$wpdb->update($p.'executions',['verification_status'=>$status,'verification_evidence'=>$evidence,'status'=>$newStatus,'completed_at'=>current_time('mysql'),'updated_at'=>current_time('mysql')],['id'=>$id]);return new WP_REST_Response(['id'=>$id,'status'=>$newStatus,'verification_status'=>$status],200);
 }
 public static function executions(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$p=$wpdb->prefix.'growthos_';$site=(int)$request->get_param('site_id');$where=$site?$wpdb->prepare("WHERE e.site_id=%d",$site):'';$rows=$wpdb->get_results("SELECT e.*,r.title,r.category,r.score,s.name site_name,s.domain FROM {$p}executions e JOIN {$p}recommendations r ON r.id=e.recommendation_id JOIN {$p}sites s ON s.id=e.site_id $where ORDER BY e.updated_at DESC,e.id DESC LIMIT 100",ARRAY_A);return new WP_REST_Response(['items'=>$rows,'count'=>count($rows)],200);
 }
 public static function execution_queue(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$p=$wpdb->prefix.'growthos_';$rows=$wpdb->get_results("SELECT r.id,r.site_id,r.category,r.title,r.score,r.approval_class,r.status,s.name site_name,s.domain,(SELECT a.decision FROM {$p}approvals a WHERE a.recommendation_id=r.id ORDER BY a.id DESC LIMIT 1) decision,(SELECT a.created_at FROM {$p}approvals a WHERE a.recommendation_id=r.id ORDER BY a.id DESC LIMIT 1) decided_at FROM {$p}recommendations r JOIN {$p}sites s ON s.id=r.site_id WHERE r.status='approved' ORDER BY r.score DESC,r.id DESC LIMIT 50",ARRAY_A);return new WP_REST_Response(['items'=>$rows,'count'=>count($rows)],200);
 }
 public static function portfolio_actions(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$p=$wpdb->prefix.'growthos_';$rows=$wpdb->get_results("SELECT r.id,r.site_id,r.category,r.title,r.score,r.approval_class,r.status,s.name site_name,s.domain FROM {$p}recommendations r JOIN {$p}sites s ON s.id=r.site_id WHERE r.status='proposed' ORDER BY r.score DESC,r.id DESC LIMIT 25",ARRAY_A);$actions=[];foreach($rows as $r){$actions[]=['recommendation_id'=>(int)$r['id'],'site_id'=>(int)$r['site_id'],'site_name'=>$r['site_name'],'domain'=>$r['domain'],'category'=>$r['category'],'title'=>$r['title'],'score'=>(float)$r['score'],'approval_class'=>$r['approval_class']];}return new WP_REST_Response(['actions'=>$actions,'count'=>count($actions)],200);
 }
 public static function portfolio_health(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$p=$wpdb->prefix.'growthos_';$sites=$wpdb->get_results("SELECT id,name,domain,status FROM {$p}sites ORDER BY name",ARRAY_A);$out=[];foreach($sites as $s){$id=(int)$s['id'];$pages=(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(DISTINCT url) FROM {$p}discoveries WHERE site_id=%d",$id));$open=(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$p}recommendations WHERE site_id=%d AND status='proposed'",$id));$high=(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$p}recommendations WHERE site_id=%d AND status='proposed' AND score>=70",$id));$failed=(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$p}jobs WHERE site_id=%d AND status='failed'",$id));$degraded=(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$p}connectors WHERE site_id=%d AND status='degraded'",$id));$state=($failed||$degraded)?'attention':($high?'improve':'healthy');$out[]=['id'=>$id,'name'=>$s['name'],'domain'=>$s['domain'],'status'=>$s['status'],'state'=>$state,'pages'=>$pages,'open_recommendations'=>$open,'high_priority'=>$high,'failed_jobs'=>$failed,'degraded_connectors'=>$degraded];}return new WP_REST_Response(['sites'=>$out,'count'=>count($out)],200);
 }
 public static function readiness(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$p=$wpdb->prefix.'growthos_';$tables=['sites','recommendations','approvals','features','connectors','jobs','discoveries','competitors','competitor_packages','audit_events'];$missing=[];foreach($tables as $x){$t=$p.$x;if($wpdb->get_var($wpdb->prepare("SHOW TABLES LIKE %s",$t))!==$t)$missing[]=$x;}$worker=(bool)wp_next_scheduled(GrowthOS_Jobs::HOOK);$checks=[['key'=>'database','ok'=>!$missing,'detail'=>$missing?'Missing: '.implode(', ',$missing):'All GrowthOS tables available'],['key'=>'worker','ok'=>$worker,'detail'=>$worker?'Worker scheduled':'Worker not scheduled'],['key'=>'rest','ok'=>true,'detail'=>'Authenticated REST control plane loaded'],['key'=>'db_version','ok'=>(string)get_option('growthos_db_version')===(string)GROWTHOS_DB_VERSION,'detail'=>'Installed '.get_option('growthos_db_version','none').' / expected '.GROWTHOS_DB_VERSION]];$pass=0;foreach($checks as $x)if($x['ok'])$pass++;return new WP_REST_Response(['ready'=>$pass===count($checks),'passing'=>$pass,'total'=>count($checks),'checks'=>$checks],200);
 }
 public static function security_status(WP_REST_Request $request): WP_REST_Response {
  $https=is_ssl();$debug=(bool)(defined('WP_DEBUG')&&WP_DEBUG);$display=(bool)(defined('WP_DEBUG_DISPLAY')&&WP_DEBUG_DISPLAY);$discouraged=(bool)get_option('blog_public');$checks=[['key'=>'https','ok'=>$https,'message'=>$https?'HTTPS active':'HTTPS is not detected'],['key'=>'debug_display','ok'=>!($debug&&$display),'message'=>($debug&&$display)?'Debug output may be visible':'Debug output is not publicly displayed'],['key'=>'file_edit','ok'=>(defined('DISALLOW_FILE_EDIT')&&DISALLOW_FILE_EDIT),'message'=>(defined('DISALLOW_FILE_EDIT')&&DISALLOW_FILE_EDIT)?'Dashboard file editing disabled':'Consider DISALLOW_FILE_EDIT in production']];$score=0;foreach($checks as $x)if($x['ok'])$score++;return new WP_REST_Response(['score'=>$score,'total'=>count($checks),'checks'=>$checks,'search_visibility'=>$discouraged?'public':'discouraged'],200);
 }
 public static function repair_worker(WP_REST_Request $request): WP_REST_Response {
  $before=wp_next_scheduled(GrowthOS_Jobs::HOOK);if(!$before)GrowthOS_Jobs::schedule();$after=wp_next_scheduled(GrowthOS_Jobs::HOOK);return new WP_REST_Response(['ok'=>(bool)$after,'was_scheduled'=>(bool)$before,'scheduled'=>(bool)$after,'next_run'=>$after?gmdate('c',$after):null],$after?200:500);
 }
 public static function system_health(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$j=$wpdb->prefix.'growthos_jobs';$c=$wpdb->prefix.'growthos_connectors';$now=current_time('mysql');$queued=(int)$wpdb->get_var("SELECT COUNT(*) FROM $j WHERE status='queued'");$failed=(int)$wpdb->get_var("SELECT COUNT(*) FROM $j WHERE status='failed'");$running=(int)$wpdb->get_var("SELECT COUNT(*) FROM $j WHERE status='running'");$degraded=(int)$wpdb->get_var("SELECT COUNT(*) FROM $c WHERE status='degraded'");$next=wp_next_scheduled(GrowthOS_Jobs::HOOK);$status=($failed>0||$degraded>0)?'attention':'healthy';return new WP_REST_Response(['status'=>$status,'jobs'=>['queued'=>$queued,'running'=>$running,'failed'=>$failed],'degraded_connectors'=>$degraded,'worker'=>['scheduled'=>(bool)$next,'next_run'=>$next?gmdate('c',$next):null],'checked_at'=>$now],200);
 }
 public static function recommendation_summary(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');$t=$wpdb->prefix.'growthos_recommendations';$where=$site?$wpdb->prepare("WHERE site_id=%d",$site):'';$rows=$wpdb->get_results("SELECT category,approval_class,status,COUNT(*) n,AVG(score) avg_score,MAX(score) max_score FROM $t $where GROUP BY category,approval_class,status ORDER BY max_score DESC",ARRAY_A);$total=0;$pending=0;foreach($rows as $x){$total+=(int)$x['n'];if($x['status']==='proposed')$pending+=(int)$x['n'];}return new WP_REST_Response(['site_id'=>$site?:null,'total'=>$total,'pending'=>$pending,'groups'=>$rows],200);
 }
 public static function recommend_plan_intelligence(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');$probe=new WP_REST_Request('GET','/growthos/v1/plan-intelligence');$probe->set_param('site_id',$site);$data=self::plan_intelligence($probe)->get_data();if(isset($data['ok'])&&$data['ok']===false)return new WP_REST_Response($data,400);$t=$wpdb->prefix.'growthos_recommendations';$made=0;
  foreach($data['signals']??[] as $s){$title='Improve subscription packaging: '.sanitize_text_field($s['message']);$exists=$wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE site_id=%d AND category='packaging' AND title=%s AND status='proposed'",$site,$title));if($exists)continue;$wpdb->insert($t,['site_id'=>$site,'category'=>'packaging','title'=>$title,'evidence'=>wp_json_encode(['signal'=>$s['code'],'feature'=>$s['feature']??null,'plan_counts'=>$data['counts'],'exclusive'=>$data['exclusive'],'quota_signals'=>$data['quota_signals']??[]]),'score'=>(int)$s['severity'],'approval_class'=>'amber','status'=>'proposed','created_at'=>current_time('mysql')]);$made++;}
  return new WP_REST_Response(['ok'=>true,'created'=>$made],201);
 }
 public static function plan_intelligence(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');if(!$site)return new WP_REST_Response(['ok'=>false,'code'=>'SITE_REQUIRED'],400);$f=$wpdb->prefix.'growthos_features';
  $rows=$wpdb->get_results($wpdb->prepare("SELECT feature_key,name,free_enabled,pro_enabled,business_enabled,quota_json FROM $f WHERE site_id=%d ORDER BY name",$site),ARRAY_A);
  $counts=['free'=>0,'pro'=>0,'business'=>0];$exclusive=['pro'=>[],'business'=>[]];foreach($rows as $x){if($x['free_enabled'])$counts['free']++;if($x['pro_enabled'])$counts['pro']++;if($x['business_enabled'])$counts['business']++;if(!$x['free_enabled']&&$x['pro_enabled'])$exclusive['pro'][]=$x['name'];if(!$x['pro_enabled']&&$x['business_enabled'])$exclusive['business'][]=$x['name'];}
  $signals=[];$quotaSignals=[];if(!$exclusive['pro'])$signals[]=['code'=>'WEAK_FREE_TO_PRO','severity'=>80,'message'=>'No Pro-only capability currently differentiates Pro from Free.'];if(!$exclusive['business'])$signals[]=['code'=>'WEAK_PRO_TO_BUSINESS','severity'=>85,'message'=>'No Business-only capability currently differentiates Business from Pro.'];if($counts['pro']<$counts['free'])$signals[]=['code'=>'PRO_REGRESSION','severity'=>95,'message'=>'Pro exposes fewer enabled capabilities than Free.'];if($counts['business']<$counts['pro'])$signals[]=['code'=>'BUSINESS_REGRESSION','severity'=>95,'message'=>'Business exposes fewer enabled capabilities than Pro.'];
  foreach($rows as $x){$q=json_decode($x['quota_json']?:'{}',true);if(!is_array($q)||!$q)continue;$free=$q['free']??null;$pro=$q['pro']??null;$biz=$q['business']??null;$num=fn($v)=>is_numeric($v)?(float)$v:null;$fn=$num($free);$pn=$num($pro);$bn=$num($biz);if($x['free_enabled']&&$x['pro_enabled']&&$fn!==null&&$pn!==null&&$pn<=$fn)$quotaSignals[]=['code'=>'WEAK_PRO_QUOTA','feature'=>$x['name'],'severity'=>75,'message'=>'Pro quota does not improve on Free.'];if($x['pro_enabled']&&$x['business_enabled']&&$pn!==null&&$bn!==null&&$bn<=$pn)$quotaSignals[]=['code'=>'WEAK_BUSINESS_QUOTA','feature'=>$x['name'],'severity'=>80,'message'=>'Business quota does not improve on Pro.'];}
  $signals=array_merge($signals,$quotaSignals);return new WP_REST_Response(['site_id'=>$site,'counts'=>$counts,'exclusive'=>$exclusive,'signals'=>$signals,'quota_signals'=>$quotaSignals,'features'=>$rows],200);
 }
 public static function recommend_package_gaps(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');if(!$site)return new WP_REST_Response(['ok'=>false,'code'=>'SITE_REQUIRED'],400);
  $probe=new WP_REST_Request('GET','/growthos/v1/package-gap');$probe->set_param('site_id',$site);$data=self::package_gap($probe)->get_data();$t=$wpdb->prefix.'growthos_recommendations';$made=0;
  foreach(array_slice($data['gaps']??[],0,20) as $g){if((int)$g['competitor_mentions']<2)continue;$title='Evaluate competitor-supported feature: '.sanitize_text_field(str_replace('-',' ',$g['feature_key']));$exists=$wpdb->get_var($wpdb->prepare("SELECT id FROM $t WHERE site_id=%d AND category='packaging' AND title=%s AND status='proposed'",$site,$title));if($exists)continue;$score=min(95,55+((int)$g['competitor_mentions']*10));$wpdb->insert($t,['site_id'=>$site,'category'=>'packaging','title'=>$title,'evidence'=>wp_json_encode(['competitor_mentions'=>$g['competitor_mentions'],'sources'=>$g['evidence']]),'score'=>$score,'approval_class'=>'amber','status'=>'proposed','created_at'=>current_time('mysql')]);$made++;}
  return new WP_REST_Response(['ok'=>true,'created'=>$made],201);
 }
 public static function package_gap(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');if(!$site)return new WP_REST_Response(['ok'=>false,'code'=>'SITE_REQUIRED'],400);
  $c=$wpdb->prefix.'growthos_competitors';$p=$wpdb->prefix.'growthos_competitor_packages';$f=$wpdb->prefix.'growthos_features';
  $own=$wpdb->get_results($wpdb->prepare("SELECT feature_key,name,free_enabled,pro_enabled,business_enabled FROM $f WHERE site_id=%d",$site),ARRAY_A);
  $rows=$wpdb->get_results($wpdb->prepare("SELECT c.id competitor_id,c.name competitor,c.domain,p.plan_key,p.plan_name,p.price_amount,p.currency,p.billing_period,p.features,p.evidence_url,p.observed_at FROM $c c JOIN $p p ON p.competitor_id=c.id WHERE c.site_id=%d AND c.status='active' ORDER BY c.name,p.id",$site),ARRAY_A);
  $ownKeys=[];foreach($own as $x){$ownKeys[sanitize_key($x['feature_key'])]=true;$ownKeys[sanitize_key($x['name'])]=true;}
  $freq=[];$evidence=[];foreach($rows as &$x){$features=json_decode($x['features']?:'[]',true);$x['features']=is_array($features)?$features:[];foreach($x['features'] as $v){$label=is_array($v)?($v['name']??''):$v;$key=sanitize_key((string)$label);if(!$key)continue;$freq[$key]=($freq[$key]??0)+1;$evidence[$key][]=[$x['competitor'],$x['evidence_url']];}}
  unset($x);arsort($freq);$gaps=[];foreach($freq as $key=>$count)if(!isset($ownKeys[$key]))$gaps[]=['feature_key'=>$key,'competitor_mentions'=>$count,'evidence'=>$evidence[$key]];
  return new WP_REST_Response(['site_id'=>$site,'own_features'=>$own,'packages'=>$rows,'gaps'=>$gaps],200);
 }
 public static function competitors(WP_REST_Request $request): WP_REST_Response {global $wpdb;$site=(int)$request->get_param('site_id');$t=$wpdb->prefix.'growthos_competitors';return new WP_REST_Response($wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE site_id=%d ORDER BY name",$site),ARRAY_A),200);}
 public static function save_competitor(WP_REST_Request $request): WP_REST_Response {global $wpdb;$t=$wpdb->prefix.'growthos_competitors';$site=(int)$request->get_param('site_id');$name=sanitize_text_field($request->get_param('name'));$domain=strtolower(preg_replace('#^https?://#','',trim((string)$request->get_param('domain'))));$domain=rtrim($domain,'/');$e=esc_url_raw($request->get_param('evidence_url'));if(!$site||!$name||!$domain||!$e)return new WP_REST_Response(['ok'=>false,'code'=>'EVIDENCE_REQUIRED'],400);$wpdb->replace($t,['site_id'=>$site,'name'=>$name,'domain'=>$domain,'evidence_url'=>$e,'status'=>'active','verified_at'=>current_time('mysql'),'created_at'=>current_time('mysql')]);return new WP_REST_Response(['ok'=>true,'id'=>$wpdb->insert_id],201);}
 public static function competitor_packages(WP_REST_Request $request): WP_REST_Response {global $wpdb;$cid=(int)$request->get_param('competitor_id');$t=$wpdb->prefix.'growthos_competitor_packages';return new WP_REST_Response($wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE competitor_id=%d ORDER BY id",$cid),ARRAY_A),200);}
 public static function save_competitor_package(WP_REST_Request $request): WP_REST_Response {global $wpdb;$t=$wpdb->prefix.'growthos_competitor_packages';$cid=(int)$request->get_param('competitor_id');$name=sanitize_text_field($request->get_param('plan_name'));$key=sanitize_key($request->get_param('plan_key'));$e=esc_url_raw($request->get_param('evidence_url'));if(!$cid||!$name||!$key||!$e)return new WP_REST_Response(['ok'=>false,'code'=>'EVIDENCE_REQUIRED'],400);$wpdb->insert($t,['competitor_id'=>$cid,'plan_key'=>$key,'plan_name'=>$name,'price_amount'=>$request->get_param('price_amount')!==null?(float)$request->get_param('price_amount'):null,'currency'=>sanitize_text_field($request->get_param('currency')),'billing_period'=>sanitize_text_field($request->get_param('billing_period')),'features'=>wp_json_encode((array)$request->get_param('features')),'evidence_url'=>$e,'observed_at'=>current_time('mysql')]);return new WP_REST_Response(['ok'=>true,'id'=>$wpdb->insert_id],201);}
 public static function retry_job(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$id=(int)$request['id'];$t=$wpdb->prefix.'growthos_jobs';$job=$wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE id=%d",$id),ARRAY_A);if(!$job)return new WP_REST_Response(['ok'=>false,'code'=>'JOB_NOT_FOUND'],404);if($job['status']!=='failed')return new WP_REST_Response(['ok'=>false,'code'=>'JOB_NOT_FAILED'],409);
  if(false===$wpdb->update($t,['status'=>'queued','attempts'=>0,'error'=>null,'updated_at'=>current_time('mysql')],['id'=>$id]))return new WP_REST_Response(['ok'=>false,'code'=>'JOB_RETRY_FAILED'],500);
  return new WP_REST_Response(['ok'=>true,'job_id'=>$id],202);
 }
 public static function scan_status(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');if(!$site)return new WP_REST_Response(['ok'=>false,'code'=>'SITE_REQUIRED'],400);$t=$wpdb->prefix.'growthos_jobs';
  $rows=$wpdb->get_results($wpdb->prepare("SELECT id,job_type,status,result,error,attempts,max_attempts,payload,updated_at FROM $t WHERE site_id=%d AND job_type IN ('discovery_scan','qa_scan','seo_scan') ORDER BY id DESC LIMIT 30",$site),ARRAY_A);
  $batches=[];foreach($rows as $x){$p=json_decode($x['payload']?:'{}',true)?:[];$b=$p['batch']??'legacy';if(!isset($batches[$b]))$batches[$b]=[];unset($x['payload']);$batches[$b][]=$x;}
  return new WP_REST_Response(['site_id'=>$site,'batches'=>$batches],200);
 }
 public static function scan(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');if(!$site)return new WP_REST_Response(['ok'=>false,'code'=>'SITE_REQUIRED'],400);
  $sites=$wpdb->prefix.'growthos_sites';if(!$wpdb->get_var($wpdb->prepare("SELECT id FROM $sites WHERE id=%d",$site)))return new WP_REST_Response(['ok'=>false,'code'=>'SITE_NOT_FOUND'],404);
  $jobs=$wpdb->prefix.'growthos_jobs';$batch=wp_generate_uuid4();$ids=[];foreach(['discovery_scan','qa_scan','seo_scan'] as $i=>$type){$key='fullscan:'.$site.':'.$batch.':'.$i;$wpdb->insert($jobs,['site_id'=>$site,'job_type'=>$type,'status'=>'queued','payload'=>wp_json_encode(['batch'=>$batch,'sequence'=>$i]),'attempts'=>0,'max_attempts'=>3,'idempotency_key'=>$key,'created_at'=>current_time('mysql'),'updated_at'=>current_time('mysql')]);$ids[]=$wpdb->insert_id;}
  return new WP_REST_Response(['ok'=>true,'batch'=>$batch,'jobs'=>$ids],202);
 }
 public static function health_score(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');if(!$site)return new WP_REST_Response(['ok'=>false,'code'=>'SITE_REQUIRED'],400);
  $d=$wpdb->prefix.'growthos_discoveries';$r=$wpdb->prefix.'growthos_recommendations';
  $pages=(int)$wpdb->get_var($wpdb->prepare("SELECT COUNT(DISTINCT url) FROM $d WHERE site_id=%d",$site));
  $rows=$wpdb->get_results($wpdb->prepare("SELECT category,score FROM $r WHERE site_id=%d AND status='proposed' AND category IN ('seo','qa')",$site),ARRAY_A);
  $pen=['seo'=>0,'qa'=>0];$cnt=['seo'=>0,'qa'=>0];foreach($rows as $x){$k=$x['category'];$pen[$k]+=min(25,max(1,(float)$x['score']/10));$cnt[$k]++;}
  $seo=max(0,round(100-min(100,$pen['seo'])));$qa=max(0,round(100-min(100,$pen['qa'])));$overall=round(($seo+$qa)/2);$severity=['critical'=>0,'high'=>0,'medium'=>0,'low'=>0];foreach($rows as $x){$s=(float)$x['score'];if($s>=90)$severity['critical']++;elseif($s>=70)$severity['high']++;elseif($s>=50)$severity['medium']++;else $severity['low']++;}
  return new WP_REST_Response(['site_id'=>$site,'pages'=>$pages,'scores'=>['overall'=>$overall,'seo'=>$seo,'qa'=>$qa],'open_findings'=>$cnt,'severity'=>$severity],200);
 }
 public static function discoveries(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');if(!$site)return new WP_REST_Response(['ok'=>false,'code'=>'SITE_REQUIRED'],400);
  $t=$wpdb->prefix.'growthos_discoveries';$rows=$wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE site_id=%d ORDER BY id DESC LIMIT 200",$site),ARRAY_A);
  return new WP_REST_Response(['discoveries'=>$rows],200);
 }
 public static function audit(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');$t=$wpdb->prefix.'growthos_audit_events';
  $rows=$site?$wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE site_id=%d ORDER BY id DESC LIMIT 100",$site),ARRAY_A):$wpdb->get_results("SELECT * FROM $t ORDER BY id DESC LIMIT 100",ARRAY_A);
  return new WP_REST_Response(['events'=>$rows],200);
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
 public static function create_recommendation(WP_REST_Request $request): WP_REST_Response {
  global $wpdb;$site=(int)$request->get_param('site_id');$category=sanitize_key((string)$request->get_param('category'));$title=sanitize_text_field((string)$request->get_param('title'));$class=sanitize_key((string)$request->get_param('approval_class'));$score=(int)$request->get_param('score');
  if(!$site||$category===''||$title===''||!in_array($class,['green','amber','red'],true))return new WP_REST_Response(['ok'=>false,'code'=>'RECOMMENDATION_INPUT_INVALID'],400);
  $t=$wpdb->prefix.'growthos_recommendations';$data=['site_id'=>$site,'category'=>$category,'title'=>$title,'evidence'=>wp_json_encode($request->get_param('evidence')??[]),'score'=>max(0,min(100,$score)),'approval_class'=>$class,'status'=>'proposed'];
  if(false===$wpdb->insert($t,$data))return new WP_REST_Response(['ok'=>false,'code'=>'RECOMMENDATION_CREATE_FAILED'],500);$data['id']=$wpdb->insert_id;return new WP_REST_Response(['ok'=>true,'recommendation'=>$data],201);
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
  global $wpdb;$id=(int)$request['id'];$t=$wpdb->prefix.'growthos_features';$e=$wpdb->prefix.'growthos_audit_events';
  $wpdb->query('START TRANSACTION');
  try{
   $before=$wpdb->get_row($wpdb->prepare("SELECT * FROM $t WHERE id=%d FOR UPDATE",$id),ARRAY_A);if(!$before)throw new Exception('FEATURE_NOT_FOUND');
   $data=['updated_at'=>current_time('mysql')];
   if(null!==$request->get_param('state')){$state=sanitize_key((string)$request->get_param('state'));if(!in_array($state,['on','off','maintenance','beta','admin-only'],true))throw new Exception('FEATURE_STATE_INVALID');$data['state']=$state;}
   foreach(['free_enabled','pro_enabled','business_enabled'] as $k)if(null!==$request->get_param($k))$data[$k]=(int)(bool)$request->get_param($k);
   if(null!==$request->get_param('rollout_percent'))$data['rollout_percent']=max(0,min(100,(int)$request->get_param('rollout_percent')));
   if(null!==$request->get_param('quota_json')){$q=$request->get_param('quota_json');$data['quota_json']=wp_json_encode(is_array($q)?$q:[]);}
   if(null!==$request->get_param('status_message'))$data['status_message']=sanitize_text_field((string)$request->get_param('status_message'));
   $reason=sanitize_text_field((string)$request->get_param('reason'));if($reason==='')$reason='GrowthOS control panel update';
   if(false===$wpdb->update($t,$data,['id'=>$id]))throw new Exception('FEATURE_UPDATE_FAILED');
   $after=array_merge($before,$data);if(false===$wpdb->insert($e,['actor_id'=>get_current_user_id(),'site_id'=>$before['site_id'],'action'=>'feature.updated','object_type'=>'feature','object_id'=>(string)$id,'before_data'=>wp_json_encode($before),'after_data'=>wp_json_encode(['feature'=>$after,'reason'=>$reason])]))throw new Exception('FEATURE_AUDIT_FAILED');
   $wpdb->query('COMMIT');return new WP_REST_Response(['ok'=>true,'feature'=>$after],200);
  }catch(Throwable $x){$wpdb->query('ROLLBACK');$code=$x->getMessage();$status=$code==='FEATURE_NOT_FOUND'?404:($code==='FEATURE_STATE_INVALID'?400:500);return new WP_REST_Response(['ok'=>false,'code'=>$status===500?'FEATURE_UPDATE_FAILED':$code],$status);}
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
