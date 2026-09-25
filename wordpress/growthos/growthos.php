<?php
/**
 * Plugin Name: GrowthOS
 * Description: Hostinger WordPress control plane for GrowthOS.
 * Version: 1.0.10
 */
if (!defined('ABSPATH')) exit;
define('GROWTHOS_VERSION','1.0.11');
define('GROWTHOS_PRODUCTION_HOST','growthos.converentis.com');
define('GROWTHOS_DB_VERSION','11');
require_once __DIR__.'/includes/class-growthos-db.php';
require_once __DIR__.'/includes/class-growthos-rest.php';
require_once __DIR__.'/includes/class-growthos-jobs.php';
require_once __DIR__.'/includes/class-growthos-engines.php';
register_activation_hook(__FILE__,function(){GrowthOS_DB::activate();GrowthOS_Jobs::schedule();flush_rewrite_rules();});
add_action('plugins_loaded',function(){if(!wp_next_scheduled(GrowthOS_Jobs::HOOK))GrowthOS_Jobs::schedule();},20);
add_action('plugins_loaded',function(){
 $admin=get_role('administrator');
 if($admin){$admin->add_cap('growthos_access');$admin->add_cap('growthos_approve');$admin->add_cap('growthos_manage');}
},30);
add_action('plugins_loaded',['GrowthOS_DB','maybe_upgrade']);
register_deactivation_hook(__FILE__,function(){GrowthOS_Jobs::unschedule();flush_rewrite_rules();});
add_filter('cron_schedules',function($s){$s['growthos_five_minutes']=['interval'=>300,'display'=>'GrowthOS every five minutes'];return $s;});
add_action(GrowthOS_Jobs::HOOK,['GrowthOS_Jobs','run']);
add_action('rest_api_init',['GrowthOS_REST','register_routes']);
add_action('init',function(){
 $host=strtolower(preg_replace('/:\\d+$/','',(string)($_SERVER['HTTP_HOST']??'')));
 $path=(string)wp_parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH);$path='/'.ltrim($path,'/');
 $is_rest_query=isset($_GET['rest_route'])&&is_string($_GET['rest_route']);
 if($host===strtolower(GROWTHOS_PRODUCTION_HOST)&&$path==='/'&&!$is_rest_query&&!is_user_logged_in()){
  wp_safe_redirect(wp_login_url(home_url('/')));exit;
 }
},0);
add_action('init',function(){
 add_rewrite_rule('^growthos/?$','index.php?growthos_app=1','top');
});
add_filter('query_vars',function($vars){$vars[]='growthos_app';return $vars;});
add_action('template_redirect',function(){
 $host=strtolower(preg_replace('/:\\d+$/','',(string)($_SERVER['HTTP_HOST']??'')));
 if($host==='')$host=strtolower((string)wp_parse_url(home_url('/'),PHP_URL_HOST));
 $path=(string)wp_parse_url($_SERVER['REQUEST_URI']??'/',PHP_URL_PATH);
 $path='/'.ltrim($path,'/');
 $is_root=($path==='/');
 if((int)get_query_var('growthos_app')!==1&&!($host===strtolower(GROWTHOS_PRODUCTION_HOST)&&$is_root))return;
 if(!is_user_logged_in()){auth_redirect();exit;}
 if(!current_user_can('growthos_access'))wp_die('GrowthOS access denied.',403);
 status_header(200);nocache_headers();
 $base=plugin_dir_url(__FILE__);$nonce=wp_create_nonce('wp_rest');$rest='/wp-json/growthos/v1/';
 echo '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>GrowthOS</title><link rel="stylesheet" href="'.esc_url($base.'assets/growthos.css').'"></head><body><div class="appShell">
<aside class="sidebar"><div class="brand"><span class="brandIcon">G</span><div><strong>GrowthOS</strong><small>Website growth control plane</small></div></div><nav class="primaryNav" aria-label="Primary navigation"><button data-view="home" class="active">⌂ <span>Home</span></button><button data-view="websites">▦ <span>Websites</span></button><button data-view="growth">↗ <span>Growth</span></button><button data-view="automation">▶ <span>Automation</span></button><button data-view="settings">⚙ <span>Settings</span></button></nav><div class="sidebarStatus"><span class="statusDot"></span><span id="health">Checking control plane…</span></div></aside>
<section class="content"><header class="pageHeader"><div><p class="eyebrow" id="viewEyebrow">PORTFOLIO OVERVIEW</p><h1 id="viewTitle">Home</h1><p class="lede" id="viewLede">See what matters, what needs attention and what GrowthOS recommends next.</p></div><label class="scopeLabel">Website<select id="globalSite"><option value="">All websites</option></select></label></header>
<main class="page">
<section class="view active" data-panel="home"><div class="hero"><div><span class="kicker">Portfolio health</span><h2><span id="sites">—</span> websites · <span id="homeAttention">review priorities</span></h2><p>Verified issues and governed actions are surfaced here first.</p></div><button data-go="websites">View websites →</button></div><div class="sectionHead"><div><h2>Needs your attention</h2><p>Only items that require a decision or follow-up.</p></div></div><div class="summaryGrid"><article><span>Approvals</span><strong id="approvals">—</strong><small>Decisions waiting</small><button data-go="growth">Review →</button></article><article><span>Active work</span><strong id="jobs">—</strong><small>Queued work</small><button data-go="automation">View →</button></article><article><span>Connector issues</span><strong id="connectors">—</strong><small>Degraded integrations</small><button data-go="settings">Inspect →</button></article></div><section class="panel"><div class="sectionHead"><div><h2>Portfolio health</h2><p>Your websites at a glance.</p></div><button class="textButton" data-go="websites">View all →</button></div><div id="portfolioHealthRows">Loading website health…</div></section><section class="panel"><div class="sectionHead"><div><h2>Next best actions</h2><p>Evidence-backed opportunities ready for review.</p></div><button class="textButton" data-go="growth">Open Growth →</button></div><div id="portfolioActionRows">Loading priority actions…</div></section></section>
<section class="view" data-panel="websites"><section class="panel"><h2>Website portfolio</h2><p class="sub">Inspect and manage the six GrowthOS websites without mixing system controls into daily work.</p><table><thead><tr><th>Name</th><th>Domain</th><th>Status</th></tr></thead><tbody id="siteRows"></tbody></table></section><section class="panel"><h2>Website health</h2><p><select id="healthSite"><option value="">Select website</option></select> <button id="runScan">Run Full Scan</button></p><div class="metrics"><div class="metric"><span>Overall</span><strong id="scoreOverall">—</strong></div><div class="metric"><span>SEO</span><strong id="scoreSeo">—</strong></div><div class="metric"><span>QA</span><strong id="scoreQa">—</strong></div><div class="metric"><span>Pages</span><strong id="scorePages">—</strong></div></div><div id="severitySummary" class="sub">Priority: —</div><div id="scanProgress"></div></section></section>
<section class="view" data-panel="growth"><section class="panel"><h2>Growth priority center</h2><div id="prioritySummary">Loading recommendation portfolio…</div></section><section class="panel"><h2>Approval inbox</h2><table><thead><tr><th>Recommendation</th><th>Class</th><th>Decision</th></tr></thead><tbody id="approvalRows"></tbody></table></section><section class="panel"><h2>Competitor & package intelligence</h2><p class="sub">Verified evidence only. GrowthOS will not invent competitor features or pricing.</p><div id="competitorWorkspace">Select a website in Website Health to inspect competitor intelligence.</div></section><section class="panel"><h2>Measured impact</h2><div id="impactRows">Loading measured outcomes…</div></section><section class="panel"><h2>Revenue & ROI</h2><div id="roiRows">Loading ROI intelligence…</div><div id="revenueRows">Loading attributed revenue…</div></section></section>
<section class="view" data-panel="automation"><section class="panel"><h2>Approved execution queue</h2><p class="sub">Approved opportunities ready for controlled implementation.</p><div id="executionRows">Loading approved work…</div><h3>Verification history</h3><div id="verificationRows">Loading execution evidence…</div></section><section class="panel"><h2>Automation activity</h2><table><thead><tr><th>Job</th><th>Status</th><th>Attempts</th></tr></thead><tbody id="jobRows"></tbody></table></section></section>
<section class="view" data-panel="settings"><section class="panel"><h2>Connections</h2><table><thead><tr><th>Connector</th><th>Status</th><th>Last error</th></tr></thead><tbody id="connectorRows"></tbody></table></section><section class="panel"><h2>Features & plans</h2><p><select id="featureSite"><option value="">Select website</option></select></p><table><thead><tr><th>Feature</th><th>State</th><th>Entitlements</th><th>Rollout</th></tr></thead><tbody id="featureRows"></tbody></table></section><section class="panel"><h2>Security</h2><div id="securityStatus">Checking production posture…</div></section><section class="panel"><h2>System readiness</h2><div id="readinessStatus">Checking deployment prerequisites…</div></section><section class="panel"><h2>Audit history</h2><table><thead><tr><th>Action</th><th>Object</th><th>Time</th></tr></thead><tbody id="auditRows"></tbody></table></section><section class="panel"><h2>System health</h2><div id="systemHealthStatus" class="sub">Loading system health…</div></section></section>
<div class="compatHidden" aria-hidden="true"><form id="addSite"><input name="name"><input name="domain"></form><div id="portfolioCommercialRows"></div><div id="commercialPriorityRows"></div><div id="commercialQualityRows"></div><div id="commercialPortfolioRows"></div><div id="metricGoalControls"><select id="goalSite"></select><input id="goalMetric"><select id="goalDirection"><option value="increase">increase</option></select><input id="goalUnit"><input id="goalTarget"><button id="saveMetricGoal"></button><div id="metricGoalRows"></div></div></div>
</main></section><nav class="mobileNav" aria-label="Mobile navigation"><button data-view="home" class="active">⌂<small>Home</small></button><button data-view="websites">▦<small>Websites</small></button><button data-view="growth">↗<small>Growth</small></button><button data-view="automation">▶<small>Automation</small></button><button data-view="settings">⚙<small>Settings</small></button></nav></div><script>window.GrowthOS='.wp_json_encode(['rest'=>$rest,'nonce'=>$nonce,'version'=>GROWTHOS_VERSION]).';</script><script src="'.esc_url($base.'assets/growthos.js').'"></script></body></html>';
 exit;
});
