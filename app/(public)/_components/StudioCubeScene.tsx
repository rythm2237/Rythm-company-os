"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

type Face = { name: string; roles: string[]; preview?: boolean };
type Props = { faces: Face[]; selected: number; playing: boolean; reduced: boolean; variant: string; onEngineChange: (engine: "webgl" | "fallback") => void };

/** Original geometry and textures. No third-party scene, HDRI, fonts or models are downloaded. */
export default function StudioCubeScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const state = useRef(props);
  useEffect(() => { state.current = props; });

  useEffect(() => {
    const container = host.current;
    if (!container) return;
    const element: HTMLDivElement = container;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); }
    catch { state.current.onEngineChange("fallback"); return; }
    renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth < 760 ? 1.35 : 1.75));
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = .85;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.domElement.setAttribute("aria-hidden", "true");
    element.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 60);
    camera.position.set(5.6, 4.1, 7.7);
    camera.lookAt(0, -.28, 0);
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environmentMap = pmrem.fromScene(environment, .04);
    scene.environment = environmentMap.texture;
    scene.environmentIntensity = .4;
    environment.dispose(); pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0xffffff, 0xb7c3d9, .9));
    const key = new THREE.DirectionalLight(0xfffcf5, 2.4);
    key.position.set(-3, 7, 5); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: .5, far: 20 });
    key.shadow.bias = -.001; key.shadow.normalBias = .025; key.shadow.radius = 5; key.shadow.blurSamples = 8;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xe5edff, .7); fill.position.set(5, 3, 4); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xc0caff, 1); rim.position.set(2, 4, -5); scene.add(rim);

    const rig = new THREE.Group(), upperRow = new THREE.Group();
    rig.rotation.set(.1, -.12, .02); rig.add(upperRow); scene.add(rig);
    const geometry = new RoundedBoxGeometry(.945, .945, .945, 5, .105);
    const coreGeometry = new RoundedBoxGeometry(2.73, 2.73, 2.73, 4, .16);
    const coreMaterial = new THREE.MeshStandardMaterial({ color: 0x35425a, roughness: .72, metalness: .12 });
    const core = new THREE.Mesh(coreGeometry, coreMaterial); rig.add(core);
    const textures: THREE.Texture[] = [], materials: THREE.Material[] = [coreMaterial];
    const innerMaterial = new THREE.MeshPhysicalMaterial({ color: 0xcad2df, roughness: .48, metalness: .18 });
    materials.push(innerMaterial);
    const labels = props.variant === "templates" ? ["AI AGENCY", "SOFTWARE", "SAAS", "CUSTOM"] : ["READY AI", "CUSTOM AI", "ENTERPRISE", "HUMAN CEO"];
    const faceNames = [...props.faces.map((face) => face.name), "Company context", "Traceable work"];
    const words = props.faces.map((face) => face.roles);
    words.push(["Context", "Memory", "Agents"], ["Review", "Decision", "Evidence"]);
    const facePalettes = ["#e5e9f0", "#20304d", "#a1acd4", "#d6dfe9", "#edf0f5", "#bac6d9"];
    const materialCache = new Map<string, THREE.MeshPhysicalMaterial>();

    function surface(face: number, cell: number) {
      const cacheKey = `${face}-${cell}`;
      const cached = materialCache.get(cacheKey); if (cached) return cached;
      const canvas = document.createElement("canvas"), bump = document.createElement("canvas");
      canvas.width = canvas.height = bump.width = bump.height = 256;
      const c = canvas.getContext("2d")!, b = bump.getContext("2d")!;
      c.fillStyle = facePalettes[face]; c.fillRect(0, 0, 256, 256);
      b.fillStyle = "#303030"; b.fillRect(0, 0, 256, 256);
      const ink = face === 1 ? "#ecf2fc" : "#233553";
      function drawMark(context: CanvasRenderingContext2D, relief: boolean) {
        context.fillStyle = relief ? "#ededed" : ink;
        context.strokeStyle = relief ? "#ededed" : ink;
        context.lineWidth = 4; context.lineCap = "round"; context.lineJoin = "round";
        if (cell === 4) {
          const title = (labels[face] ?? (face === 4 ? "COMPANY OS" : "WORK TRACE")).split(" ");
          context.textAlign = "center"; context.font = "800 27px Arial, sans-serif";
          title.forEach((word, index) => context.fillText(word, 128, 112 + index * 34));
          context.fillRect(108, 170, 40, 3);
        } else {
          const glyph = cell % 4;
          if (glyph === 0) {
            context.strokeRect(103, 77, 50, 50);
            for (let i = 0; i < 3; i++) { context.beginPath(); context.moveTo(94, 85 + i * 17); context.lineTo(103, 85 + i * 17); context.moveTo(153, 85 + i * 17); context.lineTo(162, 85 + i * 17); context.stroke(); }
            context.fillRect(117, 91, 22, 22);
          } else if (glyph === 1) {
            context.beginPath(); context.moveTo(91, 114); context.lineTo(112, 132); context.lineTo(162, 80); context.stroke();
          } else if (glyph === 2) {
            for (let i = 0; i < 3; i++) context.fillRect(93 + i * 28, 131 - i * 15, 17, 22 + i * 15);
          } else {
            context.beginPath(); context.moveTo(99, 77); context.lineTo(145, 77); context.lineTo(161, 93); context.lineTo(161, 135); context.lineTo(99, 135); context.closePath(); context.stroke();
            context.fillRect(111, 98, 34, 3); context.fillRect(111, 110, 24, 3); context.fillRect(111, 122, 30, 3);
          }
          context.textAlign = "center"; context.font = "600 17px Arial, sans-serif";
          const role = words[face][cell % 3]; context.fillText(role, 128, 177);
        }
      }
      drawMark(c, false); drawMark(b, true);
      if (cell !== 4 && cell % 3 === 0) {
        c.fillStyle = face === 1 ? "#71c4cf" : "#668eaa"; c.beginPath(); c.arc(128, 205, 4, 0, Math.PI * 2); c.fill();
      }
      const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
      const bumpMap = new THREE.CanvasTexture(bump); textures.push(map, bumpMap);
      const finishes = [.24, .64, .36, .75, .32, .5, .22, .7, .42];
      const material = new THREE.MeshPhysicalMaterial({ map, bumpMap, bumpScale: .018,
        color: 0xffffff, metalness: cell % 3 === 0 ? .36 : .12, roughness: finishes[(cell + face) % 9],
        clearcoat: cell % 3 === 0 ? .65 : .15, clearcoatRoughness: .22, envMapIntensity: .65 });
      materialCache.set(cacheKey, material); materials.push(material); return material;
    }
    // Box material order: +X, -X, +Y, -Y, +Z, -Z. Each external tile has original page-specific artwork.
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      const row = 1 - y, col = x + 1;
      const faces = [x === 1 ? surface(1, row * 3 + 1 - z) : innerMaterial,
        x === -1 ? surface(3, row * 3 + z + 1) : innerMaterial,
        y === 1 ? surface(4, (z + 1) * 3 + col) : innerMaterial,
        y === -1 ? surface(5, (1 - z) * 3 + col) : innerMaterial,
        z === 1 ? surface(0, row * 3 + col) : innerMaterial,
        z === -1 ? surface(2, row * 3 + 1 - x) : innerMaterial];
      const cubie = new THREE.Mesh(geometry, faces); cubie.position.set(x, y, z); cubie.castShadow = true; cubie.receiveShadow = true;
      (y === 1 ? upperRow : rig).add(cubie);
    }

    const floorGeometry = new THREE.PlaneGeometry(200, 200);
    const floorMaterial = new THREE.ShadowMaterial({ color: 0x3d4b67, opacity: .13 });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = -2.22; floor.receiveShadow = true; scene.add(floor);
    // Soft ambient contact beneath the moving object; the directional light also casts the actual geometry shadow.
    const shadowCanvas = document.createElement("canvas"); shadowCanvas.width = shadowCanvas.height = 128;
    const shadowContext = shadowCanvas.getContext("2d")!, gradient = shadowContext.createRadialGradient(64, 64, 2, 64, 64, 64);
    gradient.addColorStop(0, "rgba(28,43,67,.28)"); gradient.addColorStop(.45, "rgba(38,56,83,.12)"); gradient.addColorStop(1, "rgba(38,56,83,0)");
    shadowContext.fillStyle = gradient; shadowContext.fillRect(0, 0, 128, 128);
    const shadowTexture = new THREE.CanvasTexture(shadowCanvas); textures.push(shadowTexture);
    const contactMaterial = new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }); materials.push(contactMaterial);
    const contact = new THREE.Mesh(new THREE.PlaneGeometry(5.8, 5.8), contactMaterial); contact.rotation.x = -Math.PI / 2; contact.position.y = -2.215; scene.add(contact);

    let visible = true, disposed = false, lost = false, phase = 0, lastTime = 0, frame = 0, lastSelected = props.selected, transitioning = false, yaw = -.12, pitch = .1, roll = .02;
    const rotation = new THREE.Euler();
    const target = new THREE.Quaternion(), pointer = new THREE.Vector2(), smoothedPointer = new THREE.Vector2();
    function resize() {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(width, height, false); camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    }
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; lastTime = 0; }); intersection.observe(element);
    const move = (event: PointerEvent) => { const rect = element.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width - .5, (event.clientY - rect.top) / rect.height - .5); };
    const leave = () => pointer.set(0, 0);
    const contextLost = (event: Event) => { event.preventDefault(); lost = true; element.dataset.engine = "fallback"; state.current.onEngineChange("fallback"); };
    element.addEventListener("pointermove", move); element.addEventListener("pointerleave", leave); renderer.domElement.addEventListener("webglcontextlost", contextLost);
    element.dataset.engine = "webgl"; element.dataset.cubies = "27"; element.dataset.roundedRadius = ".105"; element.dataset.faceNames = faceNames.join("|");
    state.current.onEngineChange("webgl");
    function animate(time: number) {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      const dt = lastTime ? Math.min((time - lastTime) / 1000, .045) : 0; lastTime = time;
      if (!visible || document.hidden || lost) return;
      const current = state.current;
      if (current.selected !== lastSelected) {
        lastSelected = current.selected; transitioning = true;
        target.setFromEuler(new THREE.Euler(.1, -current.selected * Math.PI / 2 - .12, .02));
      }
      let dirty = false;
      if (transitioning) {
        if (current.reduced) { yaw = -current.selected * Math.PI / 2 - .12; pitch = .1; roll = .02; rig.quaternion.copy(target); upperRow.rotation.y = 0; transitioning = false; }
        else {
          rig.quaternion.slerp(target, 1 - Math.exp(-dt * 5)); upperRow.rotation.y *= Math.exp(-dt * 6);
          if (rig.quaternion.angleTo(target) < .001 && Math.abs(upperRow.rotation.y) < .001) { yaw = -current.selected * Math.PI / 2 - .12; pitch = .1; roll = .02; rig.quaternion.copy(target); upperRow.rotation.y = 0; transitioning = false; }
        }
        dirty = true;
      } else if (current.playing && !current.reduced) {
        phase += dt; smoothedPointer.lerp(pointer, 1 - Math.exp(-dt * 3));
        yaw += dt * .105;
        pitch += (.13 + .085 * Math.sin(phase * .33) + smoothedPointer.y * .07 - pitch) * (1 - Math.exp(-dt * 2));
        roll += (.045 * Math.sin(phase * .25) + smoothedPointer.x * .05 - roll) * (1 - Math.exp(-dt * 2));
        rig.quaternion.setFromEuler(rotation.set(pitch, yaw, roll));
        const slice = Math.pow((1 - Math.cos(phase * .43)) / 2, 2) * Math.PI / 2;
        upperRow.rotation.y += (slice - upperRow.rotation.y) * (1 - Math.exp(-dt * 4)); dirty = true;
      }
      if (dirty) renderer.render(scene, camera);
      element.dataset.selected = String(current.selected);
      element.dataset.pose = [rig.quaternion.x, rig.quaternion.y, rig.quaternion.z, rig.quaternion.w, upperRow.rotation.y].map((value) => value.toFixed(5)).join(",");
    }
    frame = requestAnimationFrame(animate);
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect();
      element.removeEventListener("pointermove", move); element.removeEventListener("pointerleave", leave); renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      geometry.dispose(); coreGeometry.dispose(); floorGeometry.dispose(); contact.geometry.dispose(); floorMaterial.dispose();
      textures.forEach((texture) => texture.dispose()); materials.forEach((material) => material.dispose()); environmentMap.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
    // The scene is built once per page variant; selection and motion are read from a ref without recreating GPU resources.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.variant]);
  return <div className="studio-cube-canvas" ref={host} aria-hidden="true" />;
}
