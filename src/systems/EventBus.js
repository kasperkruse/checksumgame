/**
 * EventBus - the nervous system that lets every gameplay system talk to the
 * others without holding hard references to each other.
 *
 * The whole game is built around a handful of independent systems
 * (GameStateManager, NeighborAI, MowerPhysics, ProjectileSystem, RagdollController,
 * PaintingSystem). Instead of each system calling into the others directly, they
 * emit and listen for named events on a single shared bus. For example:
 *
 *   - MowerPhysics runs over an apple -> emits 'projectileFired'
 *   - ProjectileSystem hears that, spawns a physics projectile
 *   - the projectile hits the neighbor -> emits 'neighborHitByProjectile'
 *   - NeighborAI hears that and staggers + enrages
 *
 * This keeps the systems loosely coupled and makes the chaotic chain-reactions
 * easy to follow and extend.
 */
export class EventBus {
  constructor() {
    this._listeners = new Map();
  }

  /** Subscribe to an event. Returns an unsubscribe function. */
  on(event, handler) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    const set = this._listeners.get(event);
    if (set) set.delete(handler);
  }

  /** Fire an event. Extra args are forwarded to every listener. */
  emit(event, ...args) {
    const set = this._listeners.get(event);
    if (!set) return;
    // Copy to a temp array so handlers can safely unsubscribe while emitting.
    for (const handler of [...set]) handler(...args);
  }
}

/**
 * Canonical event names. Using constants avoids typo bugs and documents, in one
 * place, every message that flows between systems.
 */
export const GameEvents = {
  PHASE_CHANGED: 'phaseChanged',              // (newPhase, prevPhase)
  SPAWN_NEIGHBOR: 'spawnNeighbor',            // ()  fired at 25% mowed
  LEVEL1_COMPLETE: 'level1Complete',          // ()  100% mowed
  LEVEL2_COMPLETE: 'level2Complete',          // ()  100% painted
  GAME_OVER: 'gameOver',                       // (reason)
  RESTART: 'restart',                          // ()

  MOWER_HIT_OBSTACLE: 'mowerHitObstacle',      // (obstacle, impactDir)
  PROJECTILE_FIRED: 'projectileFired',         // (origin, direction)
  NEIGHBOR_HIT_BY_PROJECTILE: 'neighborHitByProjectile', // (impactDir)
  NEIGHBOR_BLINDED: 'neighborBlinded',         // (duration)
  DISTRACT_NEIGHBOR: 'distractNeighbor',       // (targetPosition, duration)

  PLAYER_RAGDOLLED: 'playerRagdolled',         // (impactDir)  melee hit landed
  PAINT_PROGRESS: 'paintProgress',             // (percent)
  MOW_PROGRESS: 'mowProgress',                 // (percent)
};
