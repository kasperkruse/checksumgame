import * as THREE from 'three';

/**
 * Physics.js - a tiny, purpose-built arcade physics layer.
 *
 * We deliberately do NOT pull in a full rigid-body engine (cannon/ammo). For a
 * comedic "How to Fish / Lethal Company" vibe we want physics that are cheap,
 * fully art-directable, and above all EXPLOSIVE. A lightweight semi-implicit
 * Euler integrator with big impulses and low damping gives us exactly that:
 * mowers that cartwheel, apples that rocket out sideways, and players that flop
 * like a sack of potatoes.
 *
 * A RigidBody wraps a THREE.Object3D and drives its position + rotation each
 * frame from linear/angular velocity. Systems interact with bodies almost
 * exclusively through applyImpulse() / applyTorqueImpulse().
 */

const UP = new THREE.Vector3(0, 1, 0);
const _tmp = new THREE.Vector3();

export class RigidBody {
  /**
   * @param {THREE.Object3D} object - the mesh/group this body controls.
   * @param {object} opts
   *   mass         - heavier bodies react less to a given impulse.
   *   radius       - collision sphere radius (used by simple collision helpers).
   *   restitution  - bounciness on ground/obstacle contact (0..1).
   *   linearDamping- velocity retained per second (1 = frictionless).
   *   gravity      - downward accel (m/s^2). Set 0 for kinematic bodies.
   *   groundY      - height of the ground plane the body rests on.
   *   kinematic    - if true, integrate() ignores forces (driven manually).
   */
  constructor(object, opts = {}) {
    this.object = object;
    this.mass = opts.mass ?? 1;
    this.radius = opts.radius ?? 0.4;
    this.restitution = opts.restitution ?? 0.35;
    this.linearDamping = opts.linearDamping ?? 0.86;
    this.angularDamping = opts.angularDamping ?? 0.9;
    this.gravity = opts.gravity ?? -26; // punchy, faster-than-real gravity
    this.groundY = opts.groundY ?? 0;
    this.kinematic = opts.kinematic ?? false;

    this.velocity = new THREE.Vector3();
    this.angularVelocity = new THREE.Vector3(); // radians/sec per axis
    this.onGround = false;
    this.alive = true;
  }

  /** Add an instantaneous change in momentum (world space). */
  applyImpulse(vec) {
    this.velocity.addScaledVector(vec, 1 / this.mass);
    return this;
  }

  /** Add spin. Great for making things tumble comically. */
  applyTorqueImpulse(vec) {
    this.angularVelocity.addScaledVector(vec, 1 / this.mass);
    return this;
  }

  setVelocity(vec) {
    this.velocity.copy(vec);
    return this;
  }

  /**
   * Advance the body by dt seconds. Semi-implicit Euler: integrate velocity
   * first, then position, so gravity feels responsive.
   */
  integrate(dt) {
    if (this.kinematic || !this.alive) return;

    // Gravity.
    this.velocity.y += this.gravity * dt;

    // Position.
    this.object.position.addScaledVector(this.velocity, dt);

    // Ground contact: bounce with restitution, then settle.
    if (this.object.position.y <= this.groundY + this.radius) {
      this.object.position.y = this.groundY + this.radius;
      if (this.velocity.y < 0) {
        this.velocity.y = -this.velocity.y * this.restitution;
        // Kill tiny bounces so bodies actually come to rest.
        if (this.velocity.y < 1.2) this.velocity.y = 0;
        // Ground friction on the horizontal plane.
        this.velocity.x *= 0.6;
        this.velocity.z *= 0.6;
        this.angularVelocity.multiplyScalar(0.55);
      }
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    // Rotation from angular velocity (applied as small per-axis rotations).
    if (this.angularVelocity.lengthSq() > 1e-6) {
      this.object.rotation.x += this.angularVelocity.x * dt;
      this.object.rotation.y += this.angularVelocity.y * dt;
      this.object.rotation.z += this.angularVelocity.z * dt;
    }

    // Exponential damping (frame-rate independent).
    const linDamp = Math.pow(this.linearDamping, dt * 60);
    const angDamp = Math.pow(this.angularDamping, dt * 60);
    this.velocity.multiplyScalar(linDamp);
    this.angularVelocity.multiplyScalar(angDamp);
  }
}

/**
 * A distance constraint ("physics joint") used to snap the neighbor's hand to
 * the player's ragdoll while he drags the limp body toward the map edge.
 * Each solve() step pulls the child body back toward the anchor if it strays
 * beyond `length`, which reads as a stiff rope/grip.
 */
export class DistanceJoint {
  constructor(getAnchorPos, body, length = 0.6, stiffness = 0.5) {
    this.getAnchorPos = getAnchorPos; // () => THREE.Vector3
    this.body = body;
    this.length = length;
    this.stiffness = stiffness;
    this.active = true;
  }

  solve() {
    if (!this.active) return;
    const anchor = this.getAnchorPos();
    const pos = this.body.object.position;
    _tmp.subVectors(pos, anchor);
    const dist = _tmp.length();
    if (dist > this.length) {
      // Pull the body back toward the anchor.
      const correction = (dist - this.length) * this.stiffness;
      _tmp.normalize().multiplyScalar(-correction);
      pos.add(_tmp);
      // Bleed velocity along the constraint so it doesn't fight the joint.
      this.body.velocity.multiplyScalar(0.6);
    }
  }
}

/** Explosive radial impulse helper: returns a vector pushing away from `from`. */
export function explosionImpulse(from, to, strength, upBias = 0.6) {
  const dir = _tmp.subVectors(to, from);
  dir.y = 0;
  if (dir.lengthSq() < 1e-6) dir.set(Math.random() - 0.5, 0, Math.random() - 0.5);
  dir.normalize();
  const out = new THREE.Vector3(dir.x, 0, dir.z).multiplyScalar(strength);
  out.y = strength * upBias; // upward kick makes everything feel poppy
  return out;
}

/** Random spin vector for comedic tumbling. */
export function randomTorque(strength) {
  return new THREE.Vector3(
    (Math.random() - 0.5) * 2 * strength,
    (Math.random() - 0.5) * 2 * strength,
    (Math.random() - 0.5) * 2 * strength
  );
}

export { UP };
