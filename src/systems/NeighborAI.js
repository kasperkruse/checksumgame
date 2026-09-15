import * as THREE from 'three';
import { GameEvents } from './EventBus.js';
import { Phase } from './GameStateManager.js';

/**
 * NeighborAI - the brain of the angry neighbor, the game's single antagonist.
 *
 * It drives the existing neighbor mesh (a THREE.Group with limb sub-groups in
 * userData) through a small finite state machine and reacts to events from the
 * other systems:
 *
 *   SPAWN_NEIGHBOR             -> wake up at the property edge and pathfind in
 *   NEIGHBOR_HIT_BY_PROJECTILE -> stagger + become ENRAGED (faster)
 *   DISTRACT_NEIGHBOR          -> break off and investigate a position
 *   NEIGHBOR_BLINDED           -> stumble around randomly for 4s (Level 2)
 *   PHASE_CHANGED              -> switch goal: chase player (L1) vs sabotage walls (L2)
 *
 * Tactical design notes baked in here:
 *   - Walking through UNMOWED tall grass slows him by 40% (player escape route).
 *   - When he melee-connects with the player he triggers the ragdoll game-over
 *     chain by emitting PLAYER_RAGDOLLED and switching to DRAGGING.
 */

export const NeighborState = {
  DORMANT: 'dormant',       // not yet spawned
  ENTERING: 'entering',     // walking from the edge in through the gate
  CHASING: 'chasing',       // L1: hunt player  /  L2: march to a wall
  SABOTAGE: 'sabotage',     // L2: wrecking the paint job at a wall
  DISTRACTED: 'distracted', // investigating a lure position
  STAGGERED: 'staggered',   // knocked back by a projectile
  BLINDED: 'blinded',       // paint in the face, random stumbling
  DRAGGING: 'dragging',     // hauling the player's ragdoll to the boundary
  DEFEATED: 'defeated',
};

const _dir = new THREE.Vector3();
const _target = new THREE.Vector3();

export class NeighborAI {
  /**
   * @param {object} ctx    shared game context (bus, player, world helpers...)
   * @param {object} config per-antagonist setup so we can run several of these
   *   at once (the grumpy old man AND his equally grumpy wife):
   *     mesh        - the THREE.Group for this character.
   *     name        - label used in dialog.
   *     spawnPoint  - where he/she appears outside the fence.
   *     gatePoint   - the gate opening to walk in through.
   *     baseSpeed   - units/second.
   *     level2Hunt  - in Level 2, true = keep hunting the player, false = go
   *                   sabotage the freshly painted walls.
   */
  constructor(ctx, config = {}) {
    this.ctx = ctx;
    this.bus = ctx.bus;
    this.config = config;
    this.mesh = config.mesh;
    this.name = config.name || 'SUR NABO';

    this.state = NeighborState.DORMANT;
    this.phase = Phase.MOWING;

    // Tunable movement (units/second).
    this.baseSpeed = config.baseSpeed ?? 3.6;
    this.speedMultiplier = 1;      // temporary buffs/debuffs (grass, enrage)
    this.enrageTimer = 0;          // seconds of the projectile-fueled speed boost

    // Timers for the various temporary states.
    this.stateTimer = 0;
    this.distractPos = new THREE.Vector3();
    this.blindWanderTarget = new THREE.Vector3();
    this.blindRetargetTimer = 0;

    this.meleeRange = 1.7;
    this.attackCooldown = 0;
    this.sabotageWall = null;

    this._bindEvents();
    this._goHome(); // start idle at the sun lounger / in the garden
  }

  _bindEvents() {
    this.bus.on(GameEvents.SPAWN_NEIGHBOR, () => this._spawn());

    // Projectile hits and paint-blinding are dispatched directly to the specific
    // antagonist that got struck (see ProjectileSystem), not via broadcast, so
    // one apple doesn't stagger both characters at once.

    // A thrown decoy distracts everyone who can hear it.
    this.bus.on(GameEvents.DISTRACT_NEIGHBOR, (pos, duration) => this.distract(pos, duration));

    this.bus.on(GameEvents.PHASE_CHANGED, (phase) => {
      this.phase = phase;
      if (phase === Phase.PAINTING) {
        // In Level 2 he is always active and aggressive, now aiming at the house.
        this._ensureActiveForLevel2();
      }
      if (phase === Phase.MOWING) this._despawn();
    });

    this.bus.on(GameEvents.RESTART, () => this._despawn());
  }

  // ---------------------------------------------------------------------------
  // Public API described in the design doc.
  // ---------------------------------------------------------------------------

  /**
   * DistractNeighbor(targetPosition, duration).
   * Interrupts the current hunt and sends the neighbor to investigate
   * `targetPosition` for `duration` seconds (e.g. a noisy sprinkler or a thrown
   * object). While distracted he ignores the player entirely.
   */
  distract(targetPosition, duration = 4) {
    if (this.state === NeighborState.DORMANT || this.state === NeighborState.DRAGGING) return;
    this.distractPos.copy(targetPosition);
    this.distractPos.y = 0;
    this.stateTimer = duration;
    this._setState(NeighborState.DISTRACTED);
  }

  /** Blind the neighbor with paint for `duration` seconds (Level 2 mechanic). */
  blind(duration = 4) {
    if (this.state === NeighborState.DORMANT || this.state === NeighborState.DRAGGING) return;
    this.stateTimer = duration;
    this.blindRetargetTimer = 0;
    this._paintFace(true);
    this._setState(NeighborState.BLINDED);
  }

  isActive() {
    return this.state !== NeighborState.DORMANT && this.state !== NeighborState.DEFEATED;
  }

  // ---------------------------------------------------------------------------
  // Lifecycle.
  // ---------------------------------------------------------------------------

  _spawn() {
    // Get up from the idle spot (the old man rises from his sun lounger) and
    // march in through the gate from wherever he was lounging.
    this.mesh.visible = true;
    this.mesh.rotation.x = 0;
    this.mesh.rotation.z = 0;
    this.mesh.position.y = 0;
    this.speedMultiplier = 1;
    this.enrageTimer = 0;
    this.attackCooldown = 0;
    this._paintFace(false);
    this._setState(NeighborState.ENTERING);
  }

  /**
   * Return to the idle "home" spot. The characters stay VISIBLE while dormant so
   * the neighbours' garden feels alive: the old man reclines on his sun lounger
   * and his wife stands about, until the 25% mowing trigger sends them after you.
   */
  _goHome() {
    const home = this.config.homePoint;
    if (home) this.mesh.position.copy(home);
    this.mesh.rotation.set(0, this.config.homeYaw ?? 0, 0);
    this._applyRestPose();
    this._paintFace(false);
    this.mesh.visible = true;
    this.state = NeighborState.DORMANT;
  }

  _applyRestPose() {
    if (this.config.restPose === 'recline') {
      // Lean back as if lounging on the sunbed.
      this.mesh.rotation.x = -0.85;
    }
  }

  _despawn() {
    // "Despawn" now means go back to the idle home spot rather than vanish.
    this._goHome();
  }

  /** Where this character's grabbing hand is (joint anchor for dragging). */
  getHandPos() {
    return new THREE.Vector3(this.mesh.position.x, 0.6, this.mesh.position.z);
  }

  _ensureActiveForLevel2() {
    if (!this.isActive()) {
      this._spawn();
    }
    // Retarget to the house walls.
    this._setState(NeighborState.CHASING);
  }

  /** Called by ProjectileSystem when THIS character is struck by mower debris. */
  staggerFromProjectile(impactDir) {
    if (!this.isActive()) return;
    // A whiff of knockback + a temporary rage-fuelled speed boost.
    if (impactDir) {
      _dir.copy(impactDir); _dir.y = 0; _dir.normalize();
      this.mesh.position.addScaledVector(_dir, 0.9);
    }
    this.enrageTimer = 2.5;          // 2.5s of extra speed
    this.stateTimer = 0.45;          // brief stagger
    this._setState(NeighborState.STAGGERED);
    this._flashAngry();
  }

  // ---------------------------------------------------------------------------
  // Per-frame update.
  // ---------------------------------------------------------------------------

  update(dt) {
    if (this.state === NeighborState.DORMANT || this.state === NeighborState.DEFEATED) return;

    // Decay the enrage buff.
    if (this.enrageTimer > 0) this.enrageTimer = Math.max(0, this.enrageTimer - dt);
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    switch (this.state) {
      case NeighborState.ENTERING:  this._updateEntering(dt); break;
      case NeighborState.CHASING:   this._updateChasing(dt); break;
      case NeighborState.SABOTAGE:  this._updateSabotage(dt); break;
      case NeighborState.DISTRACTED:this._updateDistracted(dt); break;
      case NeighborState.STAGGERED: this._updateStaggered(dt); break;
      case NeighborState.BLINDED:   this._updateBlinded(dt); break;
      case NeighborState.DRAGGING:  this._updateDragging(dt); break;
    }
  }

  _updateEntering(dt) {
    // Walk to the garden gate first so he uses the opening in the fence.
    const gate = this.config.gatePoint || this.ctx.gatePoint;
    const reached = this._moveToward(gate, dt, 1);
    if (reached) this._setState(NeighborState.CHASING);
  }

  _updateChasing(dt) {
    // In Level 2 the wife keeps hunting the player (level2Hunt) while the old man
    // instead marches to the walls to sabotage the fresh paint.
    if (this.phase === Phase.PAINTING && !this.config.level2Hunt) {
      // Level 2 (saboteur): march to the nearest wall and wreck it, UNLESS the
      // player is close enough to grab (the ragdoll threat exists in both levels).
      const distToPlayer = this.mesh.position.distanceTo(this.ctx.player.pos);
      if (distToPlayer < this.meleeRange && this.attackCooldown <= 0) {
        this._meleePlayer();
        return;
      }
      const wall = this.ctx.getNearestWallPoint(this.mesh.position);
      this.sabotageWall = wall;
      _target.copy(wall.point);
      const reached = this._moveToward(_target, dt, wall.standoff ?? 1.2);
      if (reached) {
        this.stateTimer = 0;
        this._setState(NeighborState.SABOTAGE);
      }
    } else {
      // Level 1: hunt the player.
      _target.copy(this.ctx.player.pos);
      this._moveToward(_target, dt, this.meleeRange * 0.8);
      const dist = this.mesh.position.distanceTo(this.ctx.player.pos);
      if (dist < this.meleeRange && this.attackCooldown <= 0) {
        this._meleePlayer();
      } else {
        this._animateWalk();
        this._faceTarget(this.ctx.player.pos);
      }
    }
  }

  _updateSabotage(dt) {
    // Anchored at the wall, wrecking the paint. Each second removes 5% progress.
    this._faceTarget(this.sabotageWall ? this.sabotageWall.point : this.ctx.player.pos);
    this._animateSabotage();
    if (this.ctx.onSabotage) this.ctx.onSabotage(5 * dt); // 5% per second

    // If the player wanders into range while he's busy, he'll still grab them.
    const distToPlayer = this.mesh.position.distanceTo(this.ctx.player.pos);
    if (distToPlayer < this.meleeRange && this.attackCooldown <= 0) {
      this._meleePlayer();
    }
  }

  _updateDistracted(dt) {
    this.stateTimer -= dt;
    const reached = this._moveToward(this.distractPos, dt, 0.6);
    if (reached) {
      // Loiter and look around at the lure until the timer runs out.
      this._lookAround();
    }
    if (this.stateTimer <= 0) {
      this._resumeHunt();
    }
  }

  _updateStaggered(dt) {
    this.stateTimer -= dt;
    // Reel backwards briefly; no pathfinding while stunned.
    this._recoilPose();
    if (this.stateTimer <= 0) this._resumeHunt();
  }

  _updateBlinded(dt) {
    this.stateTimer -= dt;
    this.blindRetargetTimer -= dt;
    // Completely random stumbling: pick a new nearby target every so often.
    if (this.blindRetargetTimer <= 0) {
      this.blindRetargetTimer = 0.4 + Math.random() * 0.5;
      const p = this.mesh.position;
      this.blindWanderTarget.set(
        p.x + (Math.random() - 0.5) * 6,
        0,
        p.z + (Math.random() - 0.5) * 6
      );
      this._clampToYard(this.blindWanderTarget);
    }
    // Move erratically at reduced speed; he cannot track the player or sabotage.
    this._moveToward(this.blindWanderTarget, dt, 0.3, 0.5);
    this.mesh.rotation.y += (Math.random() - 0.5) * dt * 6; // dizzy spin
    if (this.stateTimer <= 0) {
      this._paintFace(false);
      this._resumeHunt();
    }
  }

  _updateDragging(dt) {
    // Haul the limp player toward the exit point at the map boundary.
    const exit = this.ctx.boundary.exitPoint;
    _target.copy(exit);
    this._moveToward(_target, dt, 0.2, 0.75);
    this._animateWalk(1.4);
    // The RagdollController owns the joint that keeps the body glued to his hand
    // and the out-of-bounds check that finally fires GAME_OVER.
  }

  // ---------------------------------------------------------------------------
  // Movement + helpers.
  // ---------------------------------------------------------------------------

  /**
   * Move toward `target`, stopping when within `stopDist`. Returns true when the
   * neighbor has arrived. Applies the 40% tall-grass slowdown and the enrage
   * boost. `speedScale` lets specific states move slower (e.g. dragging).
   */
  _moveToward(target, dt, stopDist = 0.5, speedScale = 1) {
    _dir.subVectors(target, this.mesh.position);
    _dir.y = 0;
    const dist = _dir.length();
    if (dist <= stopDist) return true;
    _dir.normalize();

    // Tall-grass penalty: wading through unmowed grass costs 40% speed.
    const inTallGrass = this.ctx.isTallGrassAt(this.mesh.position.x, this.mesh.position.z);
    const grassFactor = inTallGrass ? 0.6 : 1.0;
    const enrageFactor = this.enrageTimer > 0 ? 1.5 : 1.0;

    const speed = this.baseSpeed * this.speedMultiplier * grassFactor * enrageFactor * speedScale;
    const step = Math.min(speed * dt, dist - stopDist);
    this.mesh.position.addScaledVector(_dir, step);
    this._clampToYard(this.mesh.position);

    this._faceTarget(target);
    this._animateWalk(enrageFactor); // faster leg cycle when enraged
    return false;
  }

  _resumeHunt() {
    this._paintFace(false);
    this._setState(NeighborState.CHASING);
  }

  _meleePlayer() {
    // The melee connects: kick off the ragdoll game-over chain. The
    // RagdollController listens for PLAYER_RAGDOLLED, flops the player, and then
    // hands control back by flipping us into DRAGGING via ctx.onPlayerCaught.
    if (this.ctx.player.isRagdolled) return;
    this.attackCooldown = 1.2;
    _dir.subVectors(this.ctx.player.pos, this.mesh.position); _dir.y = 0; _dir.normalize();
    this._punchPose();
    // Pass `this` so the RagdollController joints the body to whoever caught it.
    this.bus.emit(GameEvents.PLAYER_RAGDOLLED, _dir.clone(), this);
    this._setState(NeighborState.DRAGGING);
  }

  _setState(state) {
    this.state = state;
    this.stateTimerStart = this.stateTimer;
  }

  // ---------------------------------------------------------------------------
  // Pose / animation (drives the limb groups stored on the mesh userData).
  // ---------------------------------------------------------------------------

  _faceTarget(target) {
    this.mesh.lookAt(target.x, this.mesh.position.y, target.z);
  }

  _animateWalk(rate = 1) {
    const t = this.ctx.clock.getElapsedTime();
    const cycle = Math.sin(t * 10 * rate) * 0.5;
    const ud = this.mesh.userData;
    if (ud.leftLeg) ud.leftLeg.rotation.x = cycle;
    if (ud.rightLeg) ud.rightLeg.rotation.x = -cycle;
    if (ud.leftArm) ud.leftArm.rotation.x = -cycle * 0.6;
    if (ud.rightArm) ud.rightArm.rotation.x = cycle * 0.6;
  }

  _animateSabotage() {
    const t = this.ctx.clock.getElapsedTime();
    const swing = Math.abs(Math.sin(t * 12)) * -1.8; // both arms hammering the wall
    const ud = this.mesh.userData;
    if (ud.leftArm) ud.leftArm.rotation.x = swing;
    if (ud.rightArm) ud.rightArm.rotation.x = swing;
  }

  _punchPose() {
    const ud = this.mesh.userData;
    if (ud.rightArm) ud.rightArm.rotation.x = -2.2;
  }

  _recoilPose() {
    const ud = this.mesh.userData;
    if (ud.leftArm) ud.leftArm.rotation.x = 1.2;
    if (ud.rightArm) ud.rightArm.rotation.x = 1.2;
  }

  _lookAround() {
    const t = this.ctx.clock.getElapsedTime();
    this.mesh.rotation.y += Math.sin(t * 3) * 0.02;
  }

  _flashAngry() {
    const ud = this.mesh.userData;
    if (ud.eyebrows) {
      ud.eyebrows.forEach((b, i) => { b.rotation.z = i === 0 ? -0.7 : 0.7; });
    }
  }

  /** Toggle the paint-splatter on the neighbor's face while blinded. */
  _paintFace(on) {
    const ud = this.mesh.userData;
    if (!ud.paintSplat) return;
    ud.paintSplat.visible = on;
  }

  _clampToYard(v) {
    const b = this.ctx.boundary;
    // Allow the neighbor slightly past the edge only while dragging (to exit).
    const pad = this.state === NeighborState.DRAGGING ? 4 : 0.2;
    v.x = Math.max(b.minX - pad, Math.min(b.maxX + pad, v.x));
    v.z = Math.max(b.minZ - pad, Math.min(b.maxZ + pad, v.z));
  }
}
