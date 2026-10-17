'use strict';
const tableNames='growth_ai_reservations growth_approval_decisions growth_approval_queue growth_budget_incidents growth_content_policies growth_installation_state growth_login_throttles growth_memberships growth_organizations growth_organization_budgets growth_schema_migrations growth_sessions growth_users growth_websites growth_website_feature_audit'.split(' ');
const triggerEntries=[['approval_audit_update_guard','growth_approval_decisions','UPDATE'],['approval_audit_delete_guard','growth_approval_decisions','DELETE'],['growth_feature_audit_no_update','growth_website_feature_audit','UPDATE'],['growth_feature_audit_no_delete','growth_website_feature_audit','DELETE']];
function fixture(extra=''){
 return Buffer.from([
  ...tableNames.map(n=>`CREATE TABLE \`${n}\` (\`id\` int NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_uca1400_ai_ci;`),
  ...triggerEntries.map(([name,table,event])=>`CREATE TRIGGER \`${name}\` BEFORE ${event} ON \`${table}\` FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'immutable';`),extra
 ].join('\n'));
}
module.exports={fixture};
