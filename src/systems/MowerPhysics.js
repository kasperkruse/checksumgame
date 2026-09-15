import * as THREE from 'three';
import { RigidBody, explosionImpulse, randomTorque } from './Physics.js';
import { GameEvents } from './EventBus.js';

/**
 * MowerPhysics - turns the lawn mower into a physics prop the player shoves
 * around, and the source of the game's slapstick chain-reactions.
 *
 * Two behaviours share one body:
 *
 *   1. FOLLOW (normal): while everything is calm the mower is kinematic and
 *      simply tracks a point in front of the player - exactly the feel of the
 *      original game.
 *
 *   2. CRASH (dynamic): the instant the mower overlaps a solid obstacle (rock,
 *      fence, gnome) it flips to a dynamic RigidBody, gets an explosive up +
 *      backward impulse, tumbles, and emits MOWER_HIT_OBSTACLE so the
 *      RagdollController can briefly ragdoll the player too. After it settles it
 *      lerps back into the player's hands.
 *
 * It also detects small props (apples, toys, pebbles) passing under the deck and
 * fires them out of the discharge chute as projectiles (see ProjectileSystem).
 */
export class MowerPhysics {
  constructor(ctx, mowerMesh) {
    this.ctx = ctx;
    this.bus = ctx.bus;
    this.mesh = mowerMesh;

    this.body = new RigidBody(mowerMesh, {
      mass: 3,
      radius: 0.5,
      restitution: 0.4,
      linearDamping: 0.82,
      gravity: -26,
    });

    this.crashTimer = 0;    // >0 while flying after a crash
    this.crashCooldown = 0; // debounce so one rock doesn't crash us 60x/sec
    this.followOffset = new THREE.Vector3(0, 0, 1.5);
  }

  get isCrashing() {
    return this.crashTimer > 0;
  }

  update(dt) {
    if (this.crashCooldown > 0) this.crashCooldown -= dt;

    if (this.crashTimer > 0) {
      // Dynamic phase: let the arcade physics fling the mower around.
      this.crashTimer -= dt;
      this.body.integrate(dt);
      // Keep it inside the yard so it doesn't rocket to infinity.
      this._clampToYard();
      if (this.crashTimer <= 0) this.body.velocity.multiplyScalar(0.2);
    } else {
      // Follow phase: kinematically glue the mower in front of the player, but
      // ease back in case we just recovered from a crash somewhere else.
      const yaw = this.ctx.player.getYaw();
      const off = this.followOffset.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const targetX = this.ctx.player.pos.x + off.x;
      const targetZ = this.ctx.player.pos.z + off.z;
      this.mesh.position.x += (targetX - this.mesh.position.x) * Math.min(1, dt * 12);
      this.mesh.position.z += (targetZ - this.mesh.position.z) * Math.min(1, dt * 12);
      this.mesh.position.y += (0 - this.mesh.position.y) * Math.min(1, dt * 12);
      // Settle the tumble back to upright.
      this.mesh.rotation.x *= 0.8;
      this.mesh.rotation.z *= 0.8;
      this.mesh.rotation.y = yaw;
    }

    // Collisions are checked in both phases so a tumbling mower can still smash
    // more props on the way down.
    this._checkObstacles();
    this._checkPickups();
  }

  _checkObstacles() {
    if (this.crashCooldown > 0 || this.ctx.player.isRagdolled) return;
    for (const obs of this.ctx.obstacles) {
      const dx = obs.position.x - this.mesh.position.x;
      const dz = obs.position.z - this.mesh.position.z;
      const distSq = dx * dx + dz * dz;
      const minDist = (obs.radius + this.body.radius);
      if (distSq < minDist * minDist) {
        this._crashInto(obs);
        break;
      }
    }
  }

  _crashInto(obstacle) {
    this.crashTimer = 1.3;
    this.crashCooldown = 1.6;

    // EXPLOSIVE up + backward kick on the mower.
    const impulse = explosionImpulse(obstacle.position, this.mesh.position, 15, 0.95);
    this.body.setVelocity(impulse);
    this.body.applyTorqueImpulse(randomTorque(9));

    // Direction from the obstacle back toward the player, used to fling both the
    // mower and the player the same way (comedic shared knockback).
    const dir = new THREE.Vector3().subVectors(this.mesh.position, obstacle.position);
    dir.y = 0; dir.normalize();

    if (this.ctx.audio && this.ctx.audio.playCrash) this.ctx.audio.playCrash();
    // Tell the world: the RagdollController briefly ragdolls the player.
    this.bus.emit(GameEvents.MOWER_HIT_OBSTACLE, obstacle, dir);
  }

  _checkPickups() {
    for (const pickup of this.ctx.pickups) {
      if (!pickup.alive) continue;
      const dx = pickup.position.x - this.mesh.position.x;
      const dz = pickup.position.z - this.mesh.position.z;
      const distSq = dx * dx + dz * dz;
      const minDist = (pickup.radius + this.body.radius);
      if (distSq < minDist * minDist) {
        this._ejectPickup(pickup);
      }
    }
  }

  _ejectPickup(pickup) {
    pickup.alive = false;
    if (pickup.mesh) pickup.mesh.visible = false;

    // The discharge chute points out the mower's right/back. Fire the projectile
    // from there so it feels like the blades kicked it out.
    const yaw = this.ctx.player.getYaw();
    const eject = new THREE.Vector3(0.8, 0, -0.2)
      .applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw)
      .normalize();

    const origin = new THREE.Vector3(
      this.mesh.position.x,
      0.4,
      this.mesh.position.z
    );
    this.bus.emit(GameEvents.PROJECTILE_FIRED, origin, eject, pickup.color);
  }

  _clampToYard() {
    const b = this.ctx.boundary;
    const p = this.mesh.position;
    if (p.x < b.minX) { p.x = b.minX; this.body.velocity.x *= -0.4; }
    if (p.x > b.maxX) { p.x = b.maxX; this.body.velocity.x *= -0.4; }
    if (p.z < b.minZ) { p.z = b.minZ; this.body.velocity.z *= -0.4; }
    if (p.z > b.maxZ) { p.z = b.maxZ; this.body.velocity.z *= -0.4; }
  }
}
