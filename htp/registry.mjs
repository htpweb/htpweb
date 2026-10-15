// Pure governance model. No I/O, credentials, persistence or commercial operations.
const versionPattern = /^\d+\.\d+\.\d+$/;
export function createRegistry(modules) {
  const entries = structuredClone(modules);
  const byId = new Map();
  for (const module of entries) {
    if (!module.id || byId.has(module.id)) throw new Error('Identidad ausente o duplicada');
    if (!versionPattern.test(module.version) || !module.owner || !module.dataOwner ||
        !module.scope || !module.continuity || !module.recovery || !Array.isArray(module.permissions) ||
        !Array.isArray(module.contracts) || !Array.isArray(module.dependencies)) throw new Error('Ficha incompleta');
    const contracts = new Set();
    for (const contract of module.contracts) {
      if (!contract.id || !versionPattern.test(contract.version) || contracts.has(contract.id)) throw new Error('Contrato inválido');
      contracts.add(contract.id);
    }
    byId.set(module.id, module);
  }
  for (const module of entries) {
    const targets = new Set();
    for (const dependency of module.dependencies) {
      const provider = byId.get(dependency.moduleId);
      if (!provider || provider.id === module.id || targets.has(provider.id)) throw new Error('Dependencia inválida');
      if (!['required', 'optional'].includes(dependency.kind) || !dependency.failurePolicy) throw new Error('Política de dependencia inválida');
      if (!provider.contracts.some(c => c.id === dependency.contractId && c.version === dependency.version)) throw new Error('Contrato incompatible');
      targets.add(provider.id);
    }
  }
  // Reject cycles so continuity has an unambiguous dependency order.
  const visiting = new Set(), visited = new Set();
  function visit(id) {
    if (visiting.has(id)) throw new Error('Ciclo de dependencias');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of byId.get(id).dependencies) visit(dependency.moduleId);
    visiting.delete(id); visited.add(id);
  }
  entries.forEach(m => visit(m.id));
  return Object.freeze({
    list: () => structuredClone(entries),
    consumers: id => {
      if (!byId.has(id)) throw new Error('Módulo desconocido');
      return structuredClone(entries.filter(m => m.dependencies.some(d => d.moduleId === id)));
    },
    simulateDisable: id => {
      if (!byId.has(id)) throw new Error('Módulo desconocido');
      const unavailable = new Set([id]);
      let changed;
      do {
        changed = false;
        for (const module of entries) {
          if (!unavailable.has(module.id) && module.dependencies.some(d => d.kind === 'required' && unavailable.has(d.moduleId))) {
            unavailable.add(module.id); changed = true;
          }
        }
      } while (changed);
      return {
        demo: true, simulationOnly: true, target: id,
        continuityRequired: byId.get(id).critical === true,
        effects: entries.map(module => ({
          id: module.id,
          status: module.id === id ? 'disabled' : unavailable.has(module.id) ? 'blocked' :
            module.dependencies.some(d => unavailable.has(d.moduleId)) ? 'degraded' : 'unaffected',
          reasons: module.dependencies.filter(d => unavailable.has(d.moduleId)).map(d => ({ ...d })),
          continuity: module.continuity
        }))
      };
    }
  });
}
