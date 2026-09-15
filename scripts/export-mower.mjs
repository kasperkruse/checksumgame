import * as THREE from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { writeFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

globalThis.self = globalThis;
globalThis.FileReader = class FileReader {
  constructor() {
    this.result = null;
    this.onload = null;
    this.onloadend = null;
    this.onerror = null;
  }
  readAsArrayBuffer(blob) {
    Promise.resolve(blob.arrayBuffer()).then((buf) => {
      this.result = buf;
      this.onload?.({ target: this });
      this.onloadend?.({ target: this });
    }).catch((err) => this.onerror?.(err));
  }
};

const red = new THREE.MeshStandardMaterial({ color: 0xCC2222, metalness: 0.2, roughness: 0.45 });
const black = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.3, roughness: 0.6 });
const dark = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.4, roughness: 0.5 });
const silver = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.7, roughness: 0.3 });
const gripMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
const hubMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.4 });

const mower = new THREE.Group();
mower.name = 'lawn-mower';

function add(mesh, x, y, z, rotX = 0, rotY = 0, rotZ = 0) {
  mesh.position.set(x, y, z);
  mesh.rotation.set(rotX, rotY, rotZ);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mower.add(mesh);
}

add(new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.1, 0.9), black), 0, 0.12, 0);
add(new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.28, 0.55), red), 0, 0.32, -0.05);
add(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.08, 0.38), red), 0, 0.5, -0.08);
add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.16, 12), black), 0, 0.6, -0.12);
add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.08, 8), silver), 0, 0.72, -0.12);
add(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.12, 0.22), dark), 0, 0.42, 0.22);
add(new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.22, 0.08), red), 0, 0.28, 0.38);

[[-0.32, -0.32], [0.32, -0.32], [-0.32, 0.32], [0.32, 0.32]].forEach(([x, z]) => {
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.07, 16), black), x, 0.11, z, 0, 0, Math.PI / 2);
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 10), hubMat), x, 0.11, z, 0, 0, Math.PI / 2);
});

const leftPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.05, 8), dark);
leftPole.rotation.x = 0.55;
leftPole.position.set(-0.22, 0.72, -0.55);
mower.add(leftPole);
const rightPole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.05, 8), dark);
rightPole.rotation.x = 0.55;
rightPole.position.set(0.22, 0.72, -0.55);
mower.add(rightPole);

const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.52, 10), gripMat);
grip.rotation.z = Math.PI / 2;
grip.position.set(0, 1.12, -0.95);
mower.add(grip);

const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.44, 8), dark);
bar.rotation.z = Math.PI / 2;
bar.position.set(0, 0.55, -0.42);
mower.add(bar);

const outDir = dirname(fileURLToPath(import.meta.url)) + '/../public/models';
mkdirSync(outDir, { recursive: true });

const exporter = new GLTFExporter();
const glb = await exporter.parseAsync(mower, { binary: true });
writeFileSync(`${outDir}/mower.glb`, Buffer.from(glb));
console.log('Wrote', `${outDir}/mower.glb`, Buffer.from(glb).length, 'bytes');
