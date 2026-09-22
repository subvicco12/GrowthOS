<?php
/**
 * Plugin Name: GrowthOS
 * Description: Hostinger WordPress control plane for GrowthOS.
 * Version: 1.0.0
 */
if (!defined('ABSPATH')) exit;
define('GROWTHOS_VERSION','1.0.0');
define('GROWTHOS_DB_VERSION','1');
require_once __DIR__.'/includes/class-growthos-db.php';
require_once __DIR__.'/includes/class-growthos-rest.php';
register_activation_hook(__FILE__,['GrowthOS_DB','activate']);
add_action('rest_api_init',['GrowthOS_REST','register_routes']);
add_action('init',function(){
 add_rewrite_rule('^growthos/?$','index.php?growthos_app=1','top');
});
add_filter('query_vars',function($vars){$vars[]='growthos_app';return $vars;});
add_action('template_redirect',function(){
 if((int)get_query_var('growthos_app')!==1)return;
 if(!is_user_logged_in()){auth_redirect();exit;}
 if(!current_user_can('growthos_access'))wp_die('GrowthOS access denied.',403);
 status_header(200);nocache_headers();
 echo '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>GrowthOS</title></head><body><div id="growthos-root">GrowthOS control plane</div></body></html>';
 exit;
});
