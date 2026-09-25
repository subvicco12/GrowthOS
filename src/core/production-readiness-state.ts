export interface ProductionReadinessState {
 connected:boolean;
 wordpressReady:boolean;
 failedChecks:string[];
}

export function deriveProductionGateState(state:ProductionReadinessState):{productionConnected:boolean;productionSmokeTests:boolean}{
 return {
  productionConnected:state.connected,
  productionSmokeTests:state.connected&&state.wordpressReady&&state.failedChecks.length===0,
 };
}
