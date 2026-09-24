export type AiTaskClass = 'classification'|'extraction'|'summary'|'research'|'strategy';

export interface AiModelOption { provider:string; model:string; estimatedCostUsd:number; quality:number; }
export interface AiBudgetState { enabled:boolean; remainingUsd:number; perJobLimitUsd:number; }

export function chooseAiModel(task: AiTaskClass, models: AiModelOption[], budget: AiBudgetState): AiModelOption {
  if (!budget.enabled) throw new Error('AI_DISABLED');
  const affordable = models.filter(m => m.estimatedCostUsd <= budget.remainingUsd && m.estimatedCostUsd <= budget.perJobLimitUsd);
  if (!affordable.length) throw new Error('AI_BUDGET_EXCEEDED');
  const qualityFloor = task === 'research' || task === 'strategy' ? 0.8 : 0.6;
  const qualified = affordable.filter(m => m.quality >= qualityFloor);
  const pool = qualified.length ? qualified : affordable;
  return [...pool].sort((a,b) => a.estimatedCostUsd - b.estimatedCostUsd || b.quality - a.quality)[0];
}

export function assertAiSpendAllowed(estimatedCostUsd:number, budget:AiBudgetState):void {
  if (!budget.enabled) throw new Error('AI_DISABLED');
  if (estimatedCostUsd > budget.perJobLimitUsd || estimatedCostUsd > budget.remainingUsd) throw new Error('AI_BUDGET_EXCEEDED');
}
