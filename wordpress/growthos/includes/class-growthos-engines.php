<?php
if (!defined('ABSPATH')) exit;
final class GrowthOS_Engines {
 public static function register(): void { add_filter('growthos_execute_job',[self::class,'execute'],10,4); }
 public static function execute($result,string $type,array $payload,array $job){
  if(!in_array($type,['qa_scan','seo_scan','competitor_scan','growth_scan'],true))return $result;
  $site=(int)($job['site_id']??0);if(!$site)throw new RuntimeException('SITE_REQUIRED');
  global $wpdb;$sites=$wpdb->prefix.'growthos_sites';$row=$wpdb->get_row($wpdb->prepare("SELECT * FROM $sites WHERE id=%d",$site),ARRAY_A);if(!$row)throw new RuntimeException('SITE_NOT_FOUND');
  $labels=['qa_scan'=>'qa','seo_scan'=>'seo','competitor_scan'=>'competitor','growth_scan'=>'growth'];
  return ['engine'=>$labels[$type],'site_id'=>$site,'domain'=>$row['domain'],'status'=>'ready_for_connector','message'=>'Engine dispatch verified; external evidence connector required.'];
 }
}
GrowthOS_Engines::register();
