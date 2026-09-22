<?php
if (!defined('ABSPATH')) exit;
final class GrowthOS_Engines {
 public static function register(): void { add_filter('growthos_execute_job',[self::class,'execute'],10,4); }
 public static function execute($result,string $type,array $payload,array $job){
  if(!in_array($type,['discovery_scan','qa_scan','seo_scan','competitor_scan','growth_scan'],true))return $result;
  $site=(int)($job['site_id']??0);if(!$site)throw new RuntimeException('SITE_REQUIRED');
  global $wpdb;$sites=$wpdb->prefix.'growthos_sites';$row=$wpdb->get_row($wpdb->prepare("SELECT * FROM $sites WHERE id=%d",$site),ARRAY_A);if(!$row)throw new RuntimeException('SITE_NOT_FOUND');
  $labels=['discovery_scan'=>'discovery','qa_scan'=>'qa','seo_scan'=>'seo','competitor_scan'=>'competitor','growth_scan'=>'growth'];
  if($type==='discovery_scan')return self::discover($row);
  return ['engine'=>$labels[$type],'site_id'=>$site,'domain'=>$row['domain'],'status'=>'ready_for_connector','message'=>'Engine dispatch verified; external evidence connector required.'];
 }
 private static function discover(array $site): array {
  global $wpdb;$url='https://'.$site['domain'];$response=wp_safe_remote_get($url,['timeout'=>12,'redirection'=>3,'user-agent'=>'GrowthOS/1.0']);
  if(is_wp_error($response))throw new RuntimeException('DISCOVERY_FETCH_FAILED');
  $status=(int)wp_remote_retrieve_response_code($response);$body=(string)wp_remote_retrieve_body($response);if($status<200||$status>=400)throw new RuntimeException('DISCOVERY_HTTP_'.$status);
  $title='';$description='';$canonical='';$h1=0;$words=0;
  if(class_exists('DOMDocument')){$dom=new DOMDocument();libxml_use_internal_errors(true);$dom->loadHTML($body);libxml_clear_errors();$titles=$dom->getElementsByTagName('title');if($titles->length)$title=trim($titles->item(0)->textContent);$h1=$dom->getElementsByTagName('h1')->length;$words=str_word_count(wp_strip_all_tags($body));foreach($dom->getElementsByTagName('meta') as $m)if(strtolower($m->getAttribute('name'))==='description')$description=trim($m->getAttribute('content'));foreach($dom->getElementsByTagName('link') as $l)if(strtolower($l->getAttribute('rel'))==='canonical')$canonical=trim($l->getAttribute('href'));}
  $data=['site_id'=>(int)$site['id'],'url'=>$url,'page_type'=>'homepage','http_status'=>$status,'title'=>$title,'meta_description'=>$description,'canonical'=>$canonical,'h1_count'=>$h1,'word_count'=>$words,'evidence'=>wp_json_encode(['content_type'=>wp_remote_retrieve_header($response,'content-type')]),'fingerprint'=>hash('sha256',$body),'discovered_at'=>current_time('mysql')];
  if(false===$wpdb->insert($wpdb->prefix.'growthos_discoveries',$data))throw new RuntimeException('DISCOVERY_PERSIST_FAILED');
  return ['engine'=>'discovery','site_id'=>(int)$site['id'],'status'=>'completed','pages'=>1,'http_status'=>$status,'title'=>$title,'h1_count'=>$h1,'word_count'=>$words];
 }
}
GrowthOS_Engines::register();
