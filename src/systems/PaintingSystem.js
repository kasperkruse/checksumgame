import * as THREE from 'three';
import { GameEvents } from './EventBus.js';
import { Phase } from './GameStateManager.js';

/**
 * PaintingSystem - all of Level 2. The player repaints the front of the house
 * from 0% -> 100% while the neighbor tries to wreck it.
 *
 * The wall is divided into a grid of small paint "patches". Painting is done by
 * aiming the paint tool and firing: a raycast from the camera paints whatever
 * patch it hits (plus a small splash), and a paint blob projectile is launched
 * in the same direction. That blob is what BLINDS the neighbor if it hits him
 * (handled by ProjectileSystem -> NEIGHBOR_BLINDED).
 *
 * Interactions with other systems:
 *   - NeighborAI calls ctx.onSabotage() -> sabotage() removes 5% per second.
 *   - NeighborAI calls ctx.getNearestWallPoint() -> tells him where to stand.
 *   - reaching 100% emits LEVEL2_COMPLETE, which the GameStateManager turns into
 *     a victory.
 */
export class PaintingSystem {
  constructor(ctx) {
    this.ctx = ctx;
    this.bus = ctx.bus;
    this.scene = ctx.scene;

    this.active = false;
    this.patches = [];
    this.sabotageAccum = 0;

    this.raycaster = new THREE.Raycaster();
    this._center = new THREE.Vector2(0, 0);

    this._buildPatches();

    this.bus.on(GameEvents.PHASE_CHANGED, (phase) => {
      if (phase === Phase.PAINTING) this.activate();
      else this.deactivate();
    });
    this.bus.on(GameEvents.RESTART, () => this.reset());
  }

  // Front wall of the main house (group at (0,0,-5), 8 wide x 6 deep) -> the
  // +z face sits at z = -2, spanning x[-4,4], y[0.3,4.3].
  _buildPatches() {
    this.group = new THREE.Group();
    this.group.visible = false;
    this.scene.add(this.group);

    const cols = 8;
    const rows = 5;
    const x0 = -3.6, x1 = 3.6;
    const y0 = 0.7, y1 = 4.0;
    const w = (x1 - x0) / cols;
    const h = (y1 - y0) / rows;
    const z = -2 + 0.03; // just in front of the wall

    this.unpaintedColor = new THREE.Color(0xcfc7bd);
    this.paintedColor = new THREE.Color(0x3aa0ff);

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const geo = new THREE.PlaneGeometry(w * 0.96, h * 0.96);
        const mat = new THREE.MeshLambertMaterial({ color: this.unpaintedColor.clone() });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x0 + w * (c + 0.5), y0 + h * (r + 0.5), z);
        this.group.add(mesh);
        const patch = { mesh, painted: false, col: c, row: r };
        mesh.userData.patch = patch;
        this.patches.push(patch);
      }
    }
    this.cols = cols;
    this.rows = rows;
  }

  activate() {
    this.active = true;
    this.group.visible = true;
    this.reset();
    if (this.ctx.onEquipPaintTool) this.ctx.onEquipPaintTool(true);
  }

  deactivate() {
    this.active = false;
    if (this.ctx.onEquipPaintTool) this.ctx.onEquipPaintTool(false);
    this.group.visible = false;
  }

  reset() {
    this.sabotageAccum = 0;
    for (const p of this.patches) {
      p.painted = false;
      p.mesh.material.color.copy(this.unpaintedColor);
    }
    this._emitProgress();
  }

  /**
   * Fire the paint tool. Called by main on click while in the painting phase.
   * Paints the aimed patch (+splash) and launches a paint blob that can blind
   * the neighbor.
   */
  fire() {
    if (!this.active) return;

    const cam = this.ctx.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);

    // 1) Instant wall painting via raycast (satisfying + reliable).
    this.raycaster.set(cam.getWorldPosition(new THREE.Vector3()), dir);
    const hits = this.raycaster.intersectObjects(this.group.children, false);
    if (hits.length && hits[0].distance < 9) {
      const patch = hits[0].object.userData.patch;
      this._paintPatch(patch);
      // Splash: also paint the 4-neighbours for a chunkier roller feel.
      this._paintNeighbours(patch);
      this._emitProgress();
    }

    // 2) Launch a visible paint blob in the same direction. If it strikes the
    // neighbor, ProjectileSystem emits NEIGHBOR_BLINDED.
    const origin = cam.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 0.4);
    if (this.ctx.projectiles) this.ctx.projectiles.spawnPaint(origin, dir, 0x3aa0ff);
  }

  _paintPatch(patch) {
    if (!patch || patch.painted) return;
    patch.painted = true;
    patch.mesh.material.color.copy(this.paintedColor);
  }

  _paintNeighbours(patch) {
    for (const p of this.patches) {
      if (Math.abs(p.col - patch.col) + Math.abs(p.row - patch.row) === 1) {
        // 50% chance so edges look organic rather than a perfect plus-sign.
        if (Math.random() < 0.5) this._paintPatch(p);
      }
    }
  }

  /** Neighbor sabotage: strip `amountPercent` of paint back off the wall. */
  sabotage(amountPercent) {
    if (!this.active) return;
    const perPatch = 100 / this.patches.length;
    this.sabotageAccum += amountPercent;
    while (this.sabotageAccum >= perPatch) {
      this.sabotageAccum -= perPatch;
      const painted = this.patches.filter((p) => p.painted);
      if (!painted.length) break;
      const victim = painted[Math.floor(Math.random() * painted.length)];
      victim.painted = false;
      victim.mesh.material.color.copy(this.unpaintedColor);
    }
    this._emitProgress();
  }

  getPercent() {
    const painted = this.patches.reduce((n, p) => n + (p.painted ? 1 : 0), 0);
    return (painted / this.patches.length) * 100;
  }

  /** Where should the neighbor stand to sabotage? Nearest point on the wall. */
  getNearestWallPoint(fromPos) {
    const x = Math.max(-3.4, Math.min(3.4, fromPos.x));
    return { point: new THREE.Vector3(x, 0, -2), standoff: 1.3 };
  }

  _emitProgress() {
    const percent = this.getPercent();
    this.bus.emit(GameEvents.PAINT_PROGRESS, percent);
    if (percent >= 100) this.bus.emit(GameEvents.LEVEL2_COMPLETE);
  }
}
