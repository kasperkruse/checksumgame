import * as THREE from 'three';
import { RigidBody, randomTorque } from './Physics.js';
import { GameEvents } from './EventBus.js';

/**
 * ProjectileSystem - manages every physics projectile in flight.
 *
 * It has two customers:
 *   - the mower, which fires debris (apples/toys/pebbles) via PROJECTILE_FIRED
 *     when it runs a prop over. If that debris hits the neighbor it staggers and
 *     enrages him (NEIGHBOR_HIT_BY_PROJECTILE).
 *   - the paint tool in Level 2, which spawns paint blobs via spawnPaint(). A
 *     paint blob that hits the neighbor blinds him (NEIGHBOR_BLINDED).
 *
 * All projectiles are cheap RigidBodies integrated here; on impact or after a
 * lifetime they are recycled.
 */
export class ProjectileSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.bus = ctx.bus;
    this.scene = ctx.scene;
    this.projectiles = [];

    // Debris projectiles come from the mower.
    this.bus.on(GameEvents.PROJECTILE_FIRED, (origin, dir, color) => {
      this.spawnDebris(origin, dir, color);
    });
  }

  spawnDebris(origin, dir, color = 0xff4444) {
    const geo = new THREE.IcosahedronGeometry(0.14, 0);
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.position.copy(origin);
    this.scene.add(mesh);

    const body = new RigidBody(mesh, { mass: 0.4, radius: 0.14, restitution: 0.45, gravity: -22 });
    // Fast, flat-ish launch with a bit of loft.
    const speed = 16 + Math.random() * 4;
    body.setVelocity(new THREE.Vector3(dir.x * speed, 6 + Math.random() * 2, dir.z * speed));
    body.applyTorqueImpulse(randomTorque(14));

    this.projectiles.push({ body, mesh, kind: 'debris', life: 4, hit: false });
  }

  /** Paint blob fired by the player's paint tool in Level 2. */
  spawnPaint(origin, dir, color = 0x33aaff) {
    const geo = new THREE.SphereGeometry(0.16, 8, 6);
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    this.scene.add(mesh);

    const body = new RigidBody(mesh, { mass: 0.3, radius: 0.16, restitution: 0.1, gravity: -14 });
    const speed = 22;
    body.setVelocity(new THREE.Vector3(dir.x * speed, dir.y * speed + 2, dir.z * speed));

    this.projectiles.push({ body, mesh, kind: 'paint', life: 3, hit: false });
  }

  update(dt) {
    // Every antagonist (the grumpy old man AND his wife) is a candidate target.
    const antagonists = this.ctx.getAntagonists();

    for (const p of this.projectiles) {
      p.life -= dt;
      p.body.integrate(dt);

      // Check impact against each active antagonist (torso-height sphere).
      if (!p.hit) {
        for (const a of antagonists) {
          if (!a.isActive() || !a.mesh.visible) continue;
          const np = a.mesh.position;
          const dx = np.x - p.mesh.position.x;
          const dy = (np.y + 1.1) - p.mesh.position.y;
          const dz = np.z - p.mesh.position.z;
          if (dx * dx + dy * dy + dz * dz < 0.65 * 0.65) {
            p.hit = true;
            const impactDir = new THREE.Vector3(p.body.velocity.x, 0, p.body.velocity.z).normalize();
            // Dispatch the effect to the specific character that got hit.
            if (p.kind === 'debris') a.staggerFromProjectile(impactDir);
            else if (p.kind === 'paint') a.blind(4);
            p.life = 0; // consume on hit
            break;
          }
        }
      }
    }

    // Recycle dead projectiles.
    this.projectiles = this.projectiles.filter((p) => {
      if (p.life > 0) return true;
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
      return false;
    });
  }

  clear() {
    for (const p of this.projectiles) {
      this.scene.remove(p.mesh);
      p.mesh.geometry.dispose();
      p.mesh.material.dispose();
    }
    this.projectiles = [];
  }
}
