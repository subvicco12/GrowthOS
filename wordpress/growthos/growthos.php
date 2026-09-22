<?php
/**
 * Plugin Name: GrowthOS
 * Description: Hostinger WordPress control plane for GrowthOS.
 * Version: 1.0.0
 */
if (!defined('ABSPATH')) exit;
define('GROWTHOS_VERSION','1.0.0');
define('GROWTHOS_PRODUCTION_HOST','growthos.converentis.com');
define('GROWTHOS_DB_VERSION','2');
require_once __DIR__.'/includes/class-growthos-db.php';
require_once __DIR__.'/includes/class-growthos-rest.php';
require_once __DIR__.'/includes/class-growthos-jobs.php';
register_activation_hook(__FILE__,function(){GrowthOS_DB::activate();GrowthOS_Jobs::schedule();});
register_deactivation_hook(__FILE__,['GrowthOS_Jobs','unschedule']);
add_filter('cron_schedules',function($s){$s['growthos_five_minutes']=['interval'=>300,'display'=>'GrowthOS every five minutes'];return $s;});
add_action(GrowthOS_Jobs::HOOK,['GrowthOS_Jobs','run']);
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
 $base=plugin_dir_url(__FILE__);$nonce=wp_create_nonce('wp_rest');
 echo '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>GrowthOS</title><link rel="stylesheet" href="'.esc_url($base.'assets/growthos.css').'"></head><body><div class="go"><header class="top"><div><div class="brand">GrowthOS</div><div class="sub">Website Growth Control Plane</div><nav class="nav"><a href="#portfolio">Portfolio</a><a href="#features">Features</a><a href="#approvals">Approvals</a><a href="#automation">Automation</a><a href="#connectors">Connectors</a><a href="#audit">Audit</a></nav></div><div id="health">Loading…</div></header><main class="wrap"><section class="grid" id="portfolio"><div class="card"><div class="label">Websites</div><div class="metric" id="sites">—</div></div><div class="card"><div class="label">Recommendations</div><div class="metric" id="recs">—</div></div><div class="card"><div class="label">Pending approvals</div><div class="metric" id="approvals">—</div></div><div class="card"><div class="label">Queued jobs</div><div class="metric" id="jobs">—</div></div><div class="card"><div class="label">Degraded connectors</div><div class="metric" id="connectors">—</div></div></section><section class="cols"><div class="panel"><h2>Add website</h2><form id="addSite"><p><input name="name" required placeholder="Website name"> <input name="domain" required placeholder="example.com"> <button type="submit">Register</button></p></form><h2>Website portfolio</h2><table><thead><tr><th>Name</th><th>Domain</th><th>Status</th></tr></thead><tbody id="siteRows"></tbody></table></div><div class="panel" id="automation"><h2>Automation activity</h2><table><thead><tr><th>Job</th><th>Status</th><th>Attempts</th></tr></thead><tbody id="jobRows"></tbody></table></div></section><section class="panel" id="features" style="margin-top:16px"><h2>Feature Control</h2><p><select id="featureSite"><option value="">Select website</option></select></p><table><thead><tr><th>Feature</th><th>State</th><th>Entitlements</th><th>Rollout</th></tr></thead><tbody id="featureRows"></tbody></table></section><section class="panel" id="approvals" style="margin-top:16px"><h2>Approval Inbox</h2><table><thead><tr><th>Recommendation</th><th>Class</th><th>Decision</th></tr></thead><tbody id="approvalRows"></tbody></table></section><section class="cols"><div class="panel" id="connectors"><h2>Connector Governance</h2><table><thead><tr><th>Connector</th><th>Status</th><th>Last error</th></tr></thead><tbody id="connectorRows"></tbody></table></div><div class="panel" id="audit"><h2>Audit History</h2><table><thead><tr><th>Action</th><th>Object</th><th>Time</th></tr></thead><tbody id="auditRows"></tbody></table></div></section></main></div><script>window.GrowthOS='.wp_json_encode(['rest'=>rest_url('growthos/v1/'),'nonce'=>$nonce]).';</script><script src="'.esc_url($base.'assets/growthos.js').'"></script></body></html>';
 exit;
});
