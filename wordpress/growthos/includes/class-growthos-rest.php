<?php
if (!defined('ABSPATH')) exit;
final class GrowthOS_REST {
 public static function register_routes(): void {
  register_rest_route('growthos/v1','/health',['methods'=>'GET','callback'=>fn()=>new WP_REST_Response(['ok'=>true,'version'=>GROWTHOS_VERSION],200),'permission_callback'=>fn()=>current_user_can('growthos_access')]);
  register_rest_route('growthos/v1','/sites',['methods'=>'GET','callback'=>[self::class,'sites'],'permission_callback'=>fn()=>current_user_can('growthos_access')]);
 }
 public static function sites(): WP_REST_Response {
  global $wpdb; $table=$wpdb->prefix.'growthos_sites';
  return new WP_REST_Response(['sites'=>$wpdb->get_results("SELECT id,name,domain,status,created_at FROM $table ORDER BY id DESC",ARRAY_A)],200);
 }
}
