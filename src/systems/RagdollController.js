import * as THREE from 'three';
import { RigidBody, DistanceJoint, explosionImpulse, randomTorque } from './Physics.js';
import { GameEvents } from './EventBus.js';

/**
 * RagdollController - the comedic heart of the game. There is NO health bar; the
 * player's whole vulnerability model is "can I be turned into a flailing sack of
 * limbs and dragged off my own lawn?".
 *
 * It responds to two events with two very different outcomes:
 *
 *   MOWER_HIT_OBSTACLE  -> TEMPORARY ragdoll. The player flops, the first-person
 *                          camera tumbles hilariously, then they scramble back
 *                          up after a couple of seconds. No penalty beyond the
 *                          loss of control.
 *
 *   PLAYER_RAGDOLLED    -> TERMINAL ragdoll. The neighbor's melee connected.
 *                          Controls die permanently, the neighbor snaps a physics
 *                          joint onto the body (DistanceJoint) and hauls it toward
 *                          the property line. If the body crosses the boundary we
 *                          emit GAME_OVER.
 *
 * Because the base game is first-person and the player has no visible body, we
 * spawn a lightweight ragdoll mesh on demand and ride the camera along with its
 * tumbling head so the flop is actually visible and felt.
 */
export class RagdollController {
  constructor(ctx) {
    this.ctx = ctx;
    this.bus = ctx.bus;
    this.scene = ctx.scene;
    this.camera = ctx.camera;

    this.active = false;
    this.mode = null;        // 'temporary' | 'terminal'
    this.body = null;
    this.group = null;
    this.joint = null;
    this.recoverTimer = 0;
    this.minFlopTime = 0;

    this._headWorld = new THREE.Vector3();

    this.bus.on(GameEvents.MOWER_HIT_OBSTACLE, (obstacle, dir) => {
      // Fling the player the same direction the mower flew.
      this.enable('temporary', dir, 13);
    });

    this.bus.on(GameEvents.PLAYER_RAGDOLLED, (dir, attacker) => {
      this.attacker = attacker; // whoever landed the grab drags the body
      this.enable('terminal', dir, 9);
    });

    this.bus.on(GameEvents.RESTART, () => this._teardown());
  }

  enable(mode, impactDir, strength) {
    // A terminal ragdoll always wins; a temporary one can't override it.
    if (this.active && this.mode === 'terminal') return;
    if (this.active) this._teardown();

    this.active = true;
    this.mode = mode;
    this.ctx.player.isRagdolled = true;
    this.ctx.player.controlsEnabled = false;

    this._buildBody();

    // Explosive launch: up + along the impact direction, plus wild spin.
    const from = new THREE.Vector3(
      this.group.position.x - impactDir.x,
      0,
      this.group.position.z - impactDir.z
    );
    const impulse = explosionImpulse(from, this.group.position, strength, 0.9);
    this.body.setVelocity(impulse);
    this.body.applyTorqueImpulse(randomTorque(12));

    if (this.ctx.audio && this.ctx.audio.playHurt) this.ctx.audio.playHurt();

    if (mode === 'temporary') {
      this.minFlopTime = 1.6;
      this.recoverTimer = 3.2; // hard cap so we always recover
    } else {
      // Terminal: the attacker grabs the body. The joint keeps it near their
      // hand as they haul it to the property line.
      const anchorFn = this.attacker
        ? () => this.attacker.getHandPos()
        : () => this.ctx.getNeighborHandPos();
      this.joint = new DistanceJoint(anchorFn, this.body, 0.7, 0.35);
      if (this.ctx.onPlayerCaught) this.ctx.onPlayerCaught();
    }
  }

  _buildBody() {
    const g = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: 0xDEB887 });
    const shirt = new THREE.MeshLambertMaterial({ color: 0x2E86DE });
    const pants = new THREE.MeshLambertMaterial({ color: 0x34495e });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.55, 0.25), shirt);
    torso.castShadow = true;
    g.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), skin);
    head.position.y = 0.5;
    head.castShadow = true;
    g.add(head);
    this.headLocal = head.position.clone();

    const armGeo = new THREE.CapsuleGeometry
      ? new THREE.CapsuleGeometry(0.06, 0.3, 4, 6)
      : new THREE.CylinderGeometry(0.06, 0.06, 0.4, 6);
    const legGeo = new THREE.CapsuleGeometry
      ? new THREE.CapsuleGeometry(0.08, 0.35, 4, 6)
      : new THREE.CylinderGeometry(0.08, 0.08, 0.45, 6);

    const la = new THREE.Mesh(armGeo, shirt); la.position.set(-0.32, 0.1, 0); la.rotation.z = 0.6; g.add(la);
    const ra = new THREE.Mesh(armGeo, shirt); ra.position.set(0.32, 0.1, 0); ra.rotation.z = -0.6; g.add(ra);
    const ll = new THREE.Mesh(legGeo, pants); ll.position.set(-0.12, -0.5, 0); g.add(ll);
    const rl = new THREE.Mesh(legGeo, pants); rl.position.set(0.12, -0.5, 0); g.add(rl);

    // Spawn at the player's current spot, torso centred ~0.9m up.
    g.position.set(this.ctx.player.pos.x, 0.9, this.ctx.player.pos.z);
    this.scene.add(g);
    this.group = g;

    this.body = new RigidBody(g, {
      mass: 1.2,
      radius: 0.45,
      restitution: 0.35,
      linearDamping: 0.8,
      angularDamping: 0.82,
      gravity: -24,
    });
  }

  update(dt) {
    if (!this.active) return;

    // Terminal drag: keep the body tethered to the neighbor's hand.
    if (this.joint) this.joint.solve();

    this.body.integrate(dt);

    // Ride the camera on the tumbling head for a chaotic first-person flop.
    this.group.updateMatrixWorld();
    this._headWorld.copy(this.headLocal).applyMatrix4(this.group.matrixWorld);
    this.camera.position.copy(this._headWorld);
    this.camera.quaternion.copy(this.group.quaternion);

    if (this.mode === 'temporary') {
      this._updateTemporary(dt);
    } else {
      this._updateTerminal(dt);
    }
  }

  _updateTemporary(dt) {
    this.minFlopTime -= dt;
    this.recoverTimer -= dt;
    const settled = this.body.onGround && this.body.velocity.lengthSq() < 1.5;
    if ((this.minFlopTime <= 0 && settled) || this.recoverTimer <= 0) {
      this._recover();
    }
  }

  _updateTerminal(dt) {
    // Check whether the neighbor has hauled us across the property line.
    const b = this.ctx.boundary;
    const p = this.group.position;
    const out =
      p.x < b.minX - 1.0 || p.x > b.maxX + 1.0 ||
      p.z < b.minZ - 1.0 || p.z > b.maxZ + 1.0;
    if (out) {
      this.bus.emit(GameEvents.GAME_OVER, 'dragged');
      this.active = false; // stop integrating; main shows the Game Over screen
    }
  }

  _recover() {
    // Player scrambles back up where the body landed (clamped into the yard).
    const b = this.ctx.boundary;
    const p = this.group.position;
    this.ctx.player.pos.x = Math.max(b.minX, Math.min(b.maxX, p.x));
    this.ctx.player.pos.z = Math.max(b.minZ, Math.min(b.maxZ, p.z));
    this.ctx.player.pos.y = 1.5;
    this._teardown();
    this.ctx.player.isRagdolled = false;
    this.ctx.player.controlsEnabled = true;
  }

  _teardown() {
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) o.material.dispose();
      });
    }
    this.group = null;
    this.body = null;
    this.joint = null;
    this.active = false;
    this.mode = null;
  }

  isActive() {
    return this.active;
  }
}
