import type { ConnectorTrustService } from './connector-trust';

export interface ConnectorHealthRuntime {
  readonly capability: 'independent-connector-health';
  readonly service: ConnectorTrustService;
}
/** No production anchor/issuer registry is configured. No environment flag can invent one. */
export function currentConnectorHealthRuntime(): ConnectorHealthRuntime | null { return null; }
