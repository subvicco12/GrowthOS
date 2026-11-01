<?php
// Disposable fixture initialization only. No output of credentials or salts.
if (getenv('WORDPRESS_DB_NAME') !== 'growthos_test_wp04') { fwrite(STDERR,"REFUSED: disposable WordPress database required\n"); exit(2); }
define('WP_INSTALLING',true);
$_SERVER['HTTP_HOST']='127.0.0.1:33320';$_SERVER['SERVER_NAME']='127.0.0.1';$_SERVER['REQUEST_URI']='/';
require '/var/www/html/wp-load.php';require '/var/www/html/wp-admin/includes/upgrade.php';
if (!defined('GROWTHOS_READONLY_FIXTURE') || !GROWTHOS_READONLY_FIXTURE) { exit(2); }
if (!is_blog_installed()) { wp_install('GrowthOS disposable fixture','fixture-admin','fixture@example.invalid',false,'',getenv('GROWTHOS_WP_ADMIN_PASSWORD')); }
update_option('active_plugins',['growthos-readonly-fixture/growthos-readonly-fixture.php']);
echo 'PASS: local WordPress '.get_bloginfo('version')." fixture installed; external WordPress HTTP blocked\n";
