<?php
if (!defined('ABSPATH')) exit;
final class GrowthOS_REST {
 public static function register_routes(): void {
  register_rest_route('growthos/v1','/health',['methods'=>'GET','callback'=>fn()=>new WP_REST_Response(['ok'=>true,'version'=>GROWTHOS_VERSION,'host'=>GROWTHOS_PRODUCTION_HOST],200),'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/sites',['methods'=>'GET','callback'=>[self::class,'sites'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/recommendations/(?P<id>\\d+)/decision',['methods'=>'POST','callback'=>[self::class,'decide'],'permission_callback'=>fn()=>current_user_can('growthos_approve')]);
 }
 public static function sites(): WP_REST_Response {
  global $wpdb; $table=$wpdb->prefix.'growthos_sites';
  return new WP_REST_Response(['sites'=>$wpdb->get_results("SELECT id,name,domain,status,created_at FROM $table ORDER BY id DESC",ARRAY_A)],200);
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
