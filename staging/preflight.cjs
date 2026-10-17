'use strict';
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const fail = reason => { console.error('REFUSED: ' + reason); process.exit(2); };
if (Number(process.versions.node.split('.')[0]) !== 22) fail('Node.js 22 required');
if (process.env.CI || process.env.GITHUB_ACTIONS) fail('local execution only');
const e = process.env;
if (!/^growthos_test_[a-z0-9_]+$/.test(e.GROWTHOS_DB_NAME || '')) fail('disposable schema required');
if (e.GROWTHOS_DB_HOST !== '127.0.0.1' || e.GROWTHOS_DB_PORT !== '33317') fail('loopback database endpoint required');
for (const key of ['GROWTHOS_DB_USER', 'GROWTHOS_DB_PASSWORD', 'GROWTHOS_STAGING_ROOT_PASSWORD', 'GROWTHOS_STAGING_USER_PASSWORD']) {
  if (!e[key] || !e[key].startsWith('synthetic_') || e[key].length < 16) fail('synthetic credential required: ' + key);
}
if (new Set([e.GROWTHOS_DB_PASSWORD,e.GROWTHOS_STAGING_ROOT_PASSWORD,e.GROWTHOS_STAGING_USER_PASSWORD]).size !== 3) fail('distinct synthetic passwords required');
for (const key of ['GROWTHOS_STAGING_MARIADB_IMAGE','GROWTHOS_STAGING_NODE_IMAGE']) {
  if (!/^.+@sha256:[a-f0-9]{64}$/.test(e[key] || '')) fail('digest-pinned image required: ' + key);
}
if (!/mariadb:11\.8/.test(e.GROWTHOS_STAGING_MARIADB_IMAGE)) fail('MariaDB 11.8 image required');
if (!/node:22/.test(e.GROWTHOS_STAGING_NODE_IMAGE)) fail('Node 22 image required');
const certDir = path.resolve(e.GROWTHOS_STAGING_CERT_DIR || '');
if (!certDir.startsWith(path.resolve(__dirname) + path.sep)) fail('certificates must stay in disposable staging directory');
for (const file of ['cert.pem','key.pem']) if (!fs.statSync(path.join(certDir,file), { throwIfNoEntry: false })?.isFile()) fail('missing disposable TLS certificate');
let run = (...args) => execFileSync(args[0],args.slice(1), { encoding:'utf8', timeout:10000, stdio:['ignore','pipe','pipe'] });
try {
  const context = JSON.parse(run('docker','context','inspect'))[0];
  if (!String(context.Endpoints.docker.Host).startsWith('unix://')) fail('local Unix Docker context required');
  run('docker','info','--format','{{.ServerVersion}}');
  run('docker','image','inspect',e.GROWTHOS_STAGING_NODE_IMAGE);
  run('docker','image','inspect',e.GROWTHOS_STAGING_MARIADB_IMAGE);
  if (!/^v22\./.test(run('docker','run','--rm','--network','none','--entrypoint','node',e.GROWTHOS_STAGING_NODE_IMAGE,'--version').trim())) fail('pinned Node image version mismatch');
  if (!/11\.8\.[0-9]+.*MariaDB/i.test(run('docker','run','--rm','--network','none','--entrypoint','mariadbd',e.GROWTHOS_STAGING_MARIADB_IMAGE,'--version'))) fail('pinned MariaDB image version mismatch');
  const config = JSON.parse(run('docker','compose','-f','staging/compose.yaml','config','--format','json'));
  const services = config.services;
  for (const key of ['db','app','proxy']) if (!services[key]) fail('missing service ' + key);
  if (!Object.values(config.networks).every(n => n.internal === true)) fail('network must be internal');
  if (services.app.ports?.length) fail('app must have no published port');
  for (const [name,port] of [['db',33317],['proxy',34443]]) {
    if (services[name].ports?.length !== 1 || services[name].ports[0].host_ip !== '127.0.0.1' || Number(services[name].ports[0].published) !== port) fail('unexpected published port: '+name);
  }
} catch (error) { if (error?.status === 2) throw error; fail('Docker/Compose unavailable or staging config invalid'); }
console.log('PASS staging preflight: Node 22, local Docker, pinned images, internal network, loopback ports, disposable identity and synthetic credentials');
