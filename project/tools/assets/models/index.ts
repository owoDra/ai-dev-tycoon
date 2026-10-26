import type { Object3D } from 'three';
import type { ModelId } from '../../../src/assets/catalog';
import type { VisualPreset } from '../../../src/content/look/visual';
import { buildAgent, buildHuman } from './characters';
import { buildDesk } from './desk';
import { buildIncidentBug } from './incidents/index';
import { buildConveyor, buildMonitor, buildPacket, buildPlant, buildServerRack } from './props';

/** モデル ID → 生成関数。catalog.ts の modelAssets と同じ ID をすべて持つ */
export const modelBuilders: Record<ModelId, (preset: VisualPreset) => Object3D> = {
  desk: buildDesk,
  humanBob: (p) => buildHuman('bob', p),
  humanCap: (p) => buildHuman('cap', p),
  humanGlasses: (p) => buildHuman('glasses', p),
  humanBun: (p) => buildHuman('bun', p),
  agentResearch: (p) => buildAgent('research', p),
  agentCode: (p) => buildAgent('code', p),
  agentQa: (p) => buildAgent('qa', p),
  agentRelease: (p) => buildAgent('release', p),
  monitor: buildMonitor,
  conveyor: buildConveyor,
  packet: buildPacket,
  plant: buildPlant,
  serverRack: buildServerRack,
  bugContextOverflow: (p) => buildIncidentBug('contextOverflow', p),
  bugStaleContext: (p) => buildIncidentBug('staleContext', p),
  bugInstructionConflict: (p) => buildIncidentBug('instructionConflict', p),
  bugRetrySpiral: (p) => buildIncidentBug('retrySpiral', p),
  bugAgentDrift: (p) => buildIncidentBug('agentDrift', p),
  bugMissingValidation: (p) => buildIncidentBug('missingValidation', p),
  bugCoordinationExplosion: (p) => buildIncidentBug('coordinationExplosion', p),
  bugHumanBottleneck: (p) => buildIncidentBug('humanBottleneck', p),
};
