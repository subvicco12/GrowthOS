<?php
/** Plugin Name: GrowthOS Isolated Read-Only Connector Fixture
 * Description: Disabled-by-default disposable integration fixture. No publication capabilities.
 * Version: 0.1.0
 */
if (!defined('ABSPATH')) { exit; }
function growthos_ro_key() { return hash('sha256', AUTH_KEY, true); }
function growthos_ro_seal($secret, $binding) {
 $iv=random_bytes(12);$tag='';$data=openssl_encrypt($secret,'aes-256-gcm',growthos_ro_key(),OPENSSL_RAW_DATA,$iv,$tag,$binding);
 return base64_encode($iv.$tag.$data);
}
function growthos_ro_open($value,$binding) {
 $bytes=base64_decode($value,true);if($bytes===false||strlen($bytes)<29)return false;
 return openssl_decrypt(substr($bytes,28),'aes-256-gcm',growthos_ro_key(),OPENSSL_RAW_DATA,substr($bytes,0,12),substr($bytes,12,16),$binding);
}
function growthos_ro_admin($r) {
 if(current_user_can('manage_options'))return true;
 return defined('GROWTHOS_READONLY_FIXTURE')&&GROWTHOS_READONLY_FIXTURE===true&&getenv('GROWTHOS_RO_FIXTURE_ADMIN_TOKEN')&&hash_equals(getenv('GROWTHOS_RO_FIXTURE_ADMIN_TOKEN'),$r->get_header('x-growthos-fixture-admin'));
}
function growthos_ro_enroll($r) {
 $b=$r->get_json_params();$expected=['connectorId','organizationId','websiteId','domain','revision','secret','mode'];
 if(!is_array($b)||count(array_diff(array_keys($b),$expected))||count($b)!==count($expected)||$b['mode']!=='wordpress_fixture'||!preg_match('/^[A-Za-z0-9_-]{43}$/',$b['secret'])||!is_int($b['revision'])||$b['revision']<1)return new WP_Error('invalid_enrollment','Invalid read-only enrollment',['status'=>400]);
 foreach(['connectorId','organizationId','websiteId']as $field)if(!preg_match('/^[a-f0-9-]{36}$/',$b[$field]))return new WP_Error('invalid_scope','Invalid scope',['status'=>400]);
 if(!preg_match('/^[a-z0-9.-]{1,253}$/',$b['domain']))return new WP_Error('invalid_domain','Invalid domain',['status'=>400]);
 $name='growthos_ro_'.str_replace('-','',$b['connectorId']);$previous=get_option($name);$fingerprint=hash('sha256',$b['secret']);
 if($previous&&($previous['organizationId']!==$b['organizationId']||$previous['websiteId']!==$b['websiteId']||$previous['domain']!==$b['domain']))return new WP_Error('scope_conflict','Scope conflict',['status'=>409]);
 if($previous&&$b['revision']<=$previous['revision']){
  if($b['revision']===$previous['revision']&&$previous['fingerprint']===$fingerprint&&!$previous['revoked'])return ['mode'=>'wordpress_fixture','fingerprint'=>$fingerprint,'capabilities'=>['health:read']];
  return new WP_Error('revision_conflict','Credential revision conflict',['status'=>409]);
 }
 $binding=$b['organizationId'].'|'.$b['websiteId'].'|'.$b['connectorId'].'|'.$b['revision'];
 unset($b['secret']);$b['ciphertext']=growthos_ro_seal($r->get_json_params()['secret'],$binding);$b['fingerprint']=$fingerprint;$b['revoked']=false;update_option($name,$b,false);
 return ['mode'=>'wordpress_fixture','fingerprint'=>$fingerprint,'capabilities'=>['health:read']];
}
function growthos_ro_health($r) {
 if(strlen($r->get_body())>4096)return new WP_Error('oversized','Oversized request',['status'=>413]);$b=$r->get_json_params();
 if(!is_array($b)||array_keys($b)!==['connectorId','organizationId','websiteId','domain','revision','nonce','observedAt','mode']||$b['mode']!=='wordpress_fixture'||!preg_match('/^[a-f0-9-]{36}$/',$b['nonce'])||abs(time()-strtotime($b['observedAt']))>30)return new WP_Error('invalid_health','Invalid request',['status'=>400]);
 $saved=get_option('growthos_ro_'.str_replace('-','',$b['connectorId']));
 if(!$saved||$saved['revoked']||$saved['organizationId']!==$b['organizationId']||$saved['websiteId']!==$b['websiteId']||$saved['domain']!==$b['domain']||$saved['revision']!==$b['revision'])return new WP_Error('unauthorized','Read-only credential unavailable',['status'=>401]);
 $binding=$b['organizationId'].'|'.$b['websiteId'].'|'.$b['connectorId'].'|'.$b['revision'];$secret=growthos_ro_open($saved['ciphertext'],$binding);
 if(!$secret||!hash_equals(hash_hmac('sha256',$r->get_body(),$secret),$r->get_header('x-growthos-ro-signature')))return new WP_Error('unauthorized','Signature refused',['status'=>401]);
 $nonce='growthos_ro_nonce_'.hash('sha256',$b['connectorId'].'|'.$b['revision'].'|'.$b['nonce']);if(!add_option($nonce,time(),'','no'))return new WP_Error('replay','Replay refused',['status'=>409]);
 $payload=$b;$payload['capabilities']=['health:read'];$payload['wordpressVersion']=get_bloginfo('version');$payload['status']='ok';$encoded=wp_json_encode($payload,JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);
 return ['payload'=>$payload,'signature'=>hash_hmac('sha256',$encoded,$secret)];
}
function growthos_ro_revoke($r) {$id=$r->get_json_params()['connectorId']??'';if(!preg_match('/^[a-f0-9-]{36}$/',$id))return new WP_Error('invalid_scope','Invalid scope',['status'=>400]);$name='growthos_ro_'.str_replace('-','',$id);$value=get_option($name);if($value){$value['revoked']=true;update_option($name,$value,false);}return ['revoked'=>true,'mode'=>'wordpress_fixture'];}
add_action('rest_api_init',function(){
 if(!defined('GROWTHOS_READONLY_FIXTURE')||GROWTHOS_READONLY_FIXTURE!==true)return;
 register_rest_route('growthos-ro/v1','/enroll',['methods'=>'POST','permission_callback'=>'growthos_ro_admin','callback'=>'growthos_ro_enroll']);
 register_rest_route('growthos-ro/v1','/health',['methods'=>'POST','permission_callback'=>'__return_true','callback'=>'growthos_ro_health']);
 register_rest_route('growthos-ro/v1','/revoke',['methods'=>'POST','permission_callback'=>'growthos_ro_admin','callback'=>'growthos_ro_revoke']);
});
