'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../..');
const candidate='database/proposals/010_content_persistence_candidate.sql';
const candidateHash='bb10b32ec0186399ae10b1820541d4330aab500843cd0fcf2a82b4da515c2c5b';
const certifiedHashes=[
'b67ab03511cd972ee07f7e891d35134e84c0e0ac00ff8f27614f5fcf479108c6',
'2b5d77e9120b23debd57f39439ceee3fafee7b46c1c5c26c22c1597aebddab2e',
'c2bcabc28b3c26827ea0e1f5e01b6e6c0ce0c7d9797f6c5ed9c4c60150b0b4c7',
'4bf0afc1e375720abaadf5b3bc282ed0b7d5c83cd56e58f37b3b557133f1c179',
'4c020458375497ba0808a65ac76baaa839c13697de054608f5c42556ad14919b',
'763ee4dd6b9461a799bffc1f314bc0ff69bc6dd84a52f9e96841342051f01019',
'8f4fd143f23761e62f381cfcb736efe9380159bb786be07f46e9cee3d28add6f',
'7ad741a87d29157ed1236aacd9daef1f855b5c38f2351bb5e5cf9e305502c672',
'b8d26a4f7f9ce93407d3a3a5c63415bf3ca32a1843275ef5a3b99ba8ff15285c'];
const newTables=['growth_content_records','growth_content_events','growth_connector_health','growth_publication_claims','growth_publication_observations'];
const assert=(ok,message)=>{if(!ok)throw Error('REFUSED: '+message);};
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function candidateStatements(bytes){
 assert(sha(bytes)===candidateHash,'candidate SHA-256 mismatch');
 const source=bytes.toString('utf8'),body=source.slice(source.indexOf('DELIMITER //')+'DELIMITER //'.length).replace(/\nDELIMITER ;\s*$/,'');
 const chunks=body.split('\n-- @statement\n').slice(1);
 assert(chunks.length===13&&chunks.every(s=>s.trim().endsWith('//')),'candidate framing mismatch');
 const statements=chunks.map(s=>s.trim().slice(0,-2));
 assert(statements.filter(s=>s.startsWith('CREATE TABLE')).length===5&&statements.filter(s=>s.startsWith('CREATE TRIGGER')).length===7,'candidate inventory mismatch');
 assert(statements.filter(s=>s.startsWith('ALTER TABLE growth_ai_reservations ADD UNIQUE KEY')).length===1,'candidate index mismatch');
 const fkColumns=[...statements.join('\n').matchAll(/FOREIGN KEY \(([^)]+)\)/g)].reduce((sum,m)=>sum+m[1].split(',').length,0);
 assert(fkColumns===17,'candidate FK column model mismatch');
 return statements;
}
function verifyPackage(){
 const files=fs.readdirSync(path.join(root,'database/mysql')).filter(n=>/^00[1-9]_.*\.sql$/.test(n)).sort();
 assert(files.length===9,'certified migration inventory mismatch');
 const migrations=files.map((file,i)=>{const bytes=fs.readFileSync(path.join(root,'database/mysql',file));assert(sha(bytes)===certifiedHashes[i],'certified migration changed: '+file);return {file,sha256:certifiedHashes[i]};});
 assert(sha(fs.readFileSync(path.join(root,'database/mysql/000_migration_ledger.sql')))==='4a20c75d96d31f23aba12256175ba927fbd2476321b8e49f3d393c5f188419ee','certified ledger changed');
 assert(sha(fs.readFileSync(path.join(root,'scripts/mariadb-migration-runner.cjs')))==='552dc45fd06f2cdf769496f3d2648f857f39dd0643c06975ab5bb78775d0d01d','certified runner changed');
 const statements=candidateStatements(fs.readFileSync(path.join(root,candidate)));
 return {migrations,candidate,candidateHash,statements,newTables};
}
function preflight(env,nodeVersion){
 assert(/^22\./.test(nodeVersion),'Node.js 22 required; no infrastructure or database access attempted');
 assert(env.GROWTHOS_CERT_DISPOSABLE==='YES','explicit disposable certification opt-in required');
 assert(!env.CI&&!env.GITHUB_ACTIONS,'CI execution forbidden');
 assert(!Object.keys(env).some(k=>/^GROWTHOS_(DB_|PRODUCTION|BACKUP_)/.test(k)&&env[k]),'inherited database, backup or production configuration forbidden');
 assert(/^mariadb@sha256:[a-f0-9]{64}$/.test(env.GROWTHOS_CERT_MARIADB_IMAGE||''),'preloaded digest-pinned MariaDB image required');
 assert(!env.DOCKER_HOST&&!env.DOCKER_CONTEXT,'inherited Docker endpoints forbidden');
}
function verifyContainer(container,network,image,{name,networkName,nonce,imageRef}){
 assert(container.Name==='/'+name&&container.State?.Running===true,'owned running container required');
 assert(container.Config?.Labels?.['com.growthos.certification']===nonce,'container provenance mismatch');
 assert(container.Config.Image===imageRef&&container.Image===image.Id&&image.RepoDigests?.includes(imageRef),'image digest mismatch');
 assert(container.HostConfig?.Privileged===false&&!container.HostConfig.Binds?.length&&!container.HostConfig.Devices?.length&&!container.HostConfig.CapAdd?.length&&!container.HostConfig.SecurityOpt?.some(x=>/unconfined/.test(x)),'privileged or mounted container forbidden');
 assert(!container.Mounts?.some(m=>m.Type!=='tmpfs')&&container.HostConfig.Tmpfs?.['/var/lib/mysql']!==undefined,'tmpfs-only data required');
 assert(container.HostConfig.NetworkMode===networkName&&container.HostConfig.PidMode!=='host'&&container.HostConfig.IpcMode!=='host','host namespaces forbidden');
 assert(network.Name===networkName&&network.Internal===true&&network.Labels?.['com.growthos.certification']===nonce,'owned internal network required');
 assert(Object.keys(container.NetworkSettings.Networks||{}).length===1&&container.NetworkSettings.Networks[networkName],'single private network required');
 assert(Object.keys(network.Containers||{}).length===1&&Object.hasOwn(network.Containers,container.Id),'shared network forbidden');
 const ports=container.NetworkSettings.Ports||{};const bindings=ports['3306/tcp'];
 assert(Object.keys(ports).every(k=>k==='3306/tcp')&&bindings?.length===1&&bindings[0].HostIp==='127.0.0.1'&&/^\d+$/.test(bindings[0].HostPort),'single loopback database port required');
 const port=Number(bindings[0].HostPort);assert(port>0&&port<=65535,'invalid published port');return port;
}
module.exports={root,assert,sha,verifyPackage,candidateStatements,preflight,verifyContainer,newTables,candidateHash,certifiedHashes};
