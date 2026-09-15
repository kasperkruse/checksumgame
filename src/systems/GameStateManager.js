import { GameEvents } from './EventBus.js';

/**
 * GameStateManager - the master controller that owns the high-level flow of the
 * whole game and the transitions between the two gameplay phases.
 *
 *   Phase.MOWING    (Level 1) - mow the lawn from 0% -> 100%.
 *   Phase.PAINTING  (Level 2) - paint the house from 0% -> 100%.
 *   Phase.GAME_OVER           - the neighbor dragged you off the property.
 *
 * It does NOT implement any of the mechanics itself. Instead it listens on the
 * EventBus for the milestone events other systems emit (25% mowed, 100% mowed,
 * 100% painted, player ragdoll dragged out of bounds) and reacts by flipping the
 * phase and broadcasting PHASE_CHANGED. Every other system subscribes to
 * PHASE_CHANGED to activate/deactivate itself for the current level.
 */
export const Phase = {
  MOWING: 'MOWING',
  PAINTING: 'PAINTING',
  GAME_OVER: 'GAME_OVER',
};

export class GameStateManager {
  constructor(bus) {
    this.bus = bus;
    this.phase = Phase.MOWING;
    this.neighborSpawned = false;

    // --- Wire up the milestone events that drive phase changes. ---

    // Level 1: at exactly 25% mowed, unleash the angry neighbor (once).
    this.bus.on(GameEvents.MOW_PROGRESS, (percent) => {
      if (this.phase !== Phase.MOWING) return;
      if (!this.neighborSpawned && percent >= 25) {
        this.neighborSpawned = true;
        this.bus.emit(GameEvents.SPAWN_NEIGHBOR);
      }
    });

    // Level 1 complete -> transition to Level 2 (painting).
    this.bus.on(GameEvents.LEVEL1_COMPLETE, () => {
      if (this.phase === Phase.MOWING) this.setPhase(Phase.PAINTING);
    });

    // Level 2 complete -> victory (handled by main via PHASE_CHANGED listener).
    this.bus.on(GameEvents.LEVEL2_COMPLETE, () => {
      if (this.phase === Phase.PAINTING) this.setPhase(Phase.GAME_OVER, 'victory');
    });

    // Any system can declare a loss (neighbor dragged the player out of bounds).
    this.bus.on(GameEvents.GAME_OVER, (reason) => {
      if (this.phase !== Phase.GAME_OVER) this.setPhase(Phase.GAME_OVER, reason);
    });

    this.bus.on(GameEvents.RESTART, () => this.reset());
  }

  setPhase(phase, meta = null) {
    if (phase === this.phase) return;
    const prev = this.phase;
    this.phase = phase;
    this.bus.emit(GameEvents.PHASE_CHANGED, phase, prev, meta);
  }

  reset() {
    this.neighborSpawned = false;
    const prev = this.phase;
    this.phase = Phase.MOWING;
    if (prev !== Phase.MOWING) {
      this.bus.emit(GameEvents.PHASE_CHANGED, Phase.MOWING, prev, 'restart');
    }
  }

  is(phase) {
    return this.phase === phase;
  }
}
