"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { Reflector } from "three/addons/objects/Reflector.js";
import { TextGeometry } from "three/addons/geometries/TextGeometry.js";
import { FontLoader } from "three/addons/loaders/FontLoader.js";
import titleFontData from "@/lib/public-experience/assets/helvetiker-bold.typeface.json";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { advanceCubeRotation } from "@/lib/public-experience/cube-motion";

type Face = { name: string; roles: string[]; preview?: boolean };
type Props = { faces: Face[]; selected: number; playing: boolean; reduced: boolean; variant: string; onEngineChange: (engine: "webgl" | "fallback") => void };

/** Original scene and textures; the licensed font is bundled, with no runtime asset downloads. */
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
    renderer.domElement.setAttribute("aria-hidden", "true");
    element.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, .1, 60);
    camera.position.set(5.6, 4.1, 7.7);
    camera.lookAt(0, -.8, 0);
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const environmentMap = pmrem.fromScene(environment, .04);
    scene.environment = environmentMap.texture;
    scene.environmentIntensity = .4;
    environment.dispose(); pmrem.dispose();

    scene.add(new THREE.HemisphereLight(0xffffff, 0xb7c3d9, .9));
    const key = new THREE.DirectionalLight(0xfffcf5, 2.4);
    key.position.set(-3, 7, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xe5edff, .7); fill.position.set(5, 3, 4); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xc0caff, 1); rim.position.set(2, 4, -5); scene.add(rim);

    const rig = new THREE.Group();
    rig.rotation.set(.1, -.12, .02); scene.add(rig);
    // One continuous rounded body: no tile grid, separate layers or open corners.
    const geometry = new RoundedBoxGeometry(3, 3, 3, 8, .28);
    const textures: THREE.Texture[] = [], materials: THREE.Material[] = [];
    const titles = props.variant === "templates"
      ? [["AI ADVERTISING", "AGENCY"], ["SOFTWARE", "COMPANY"], ["SAAS", "STARTUP"], ["CUSTOM", "COMPANY"]]
      : [["READY-MADE", "AI COMPANY"], ["CUSTOM", "AI COMPANY"], ["ENTERPRISE", "AI WORKFORCE"], ["HUMAN CEO", "CONTROL"]];
    titles.push(["SHARED", "CONTEXT"], ["TRACEABLE", "WORK"]);
    const faceNames = [...props.faces.map((face) => face.name), "Shared context", "Traceable work"];
    const words = [...props.faces.map((face) => face.roles), ["Context", "Memory", "Agents"], ["Review", "Decision", "Evidence"]];
    const faceColor = "#20304d";

    function surface(face: number) {
      const canvas = document.createElement("canvas"), bump = document.createElement("canvas");
      canvas.width = canvas.height = bump.width = bump.height = 1024;
      const c = canvas.getContext("2d")!, b = bump.getContext("2d")!;
      c.fillStyle = faceColor; c.fillRect(0, 0, 1024, 1024);
      b.fillStyle = "#505050"; b.fillRect(0, 0, 1024, 1024);
      const ink = "#dce6f6";
      function artwork(context: CanvasRenderingContext2D, relief: boolean) {
        const color = relief ? "#dedede" : ink;
        context.fillStyle = color; context.strokeStyle = color;
        context.lineWidth = 3; context.lineCap = "round"; context.lineJoin = "round";
        context.textAlign = "left"; context.font = "800 32px Arial, sans-serif";
        context.fillText("RYTHM", 115, 150);
        context.textAlign = "right"; context.font = "600 23px Arial, sans-serif";
        context.fillText(`0${face + 1} / COMPANY OS`, 909, 150);
        context.globalAlpha = relief ? 1 : .28;
        context.beginPath(); context.moveTo(115, 185); context.lineTo(909, 185); context.stroke(); context.globalAlpha = 1;
        // Titles are actual beveled geometry attached to this face, not flat printed marks.
        context.textAlign = "left";
        context.font = "600 24px Arial, sans-serif";
        context.fillText(face > 3 ? "CONNECTED COMPANY INTELLIGENCE" : props.variant === "templates" ? "SPECIALIZED AI TEAMS" : "YOUR OPERATING MODEL", 115, 470);
        // One coherent role composition per face; these are printed marks, not cubie seams.
        context.textAlign = "center"; context.font = "700 24px Arial, sans-serif";
        context.globalAlpha = relief ? 1 : .7;
        context.fillText(face === 3 && props.variant === "solutions" ? "HUMAN AUTHORITY" : "SHARED CONTEXT", 512, 558);
        context.globalAlpha = relief ? 1 : .35;
        context.beginPath(); context.moveTo(512, 580); context.lineTo(512, 615); context.moveTo(250, 646); context.lineTo(250, 615); context.lineTo(774, 615); context.lineTo(774, 646); context.moveTo(512, 615); context.lineTo(512, 646); context.stroke(); context.globalAlpha = 1;
        words[face].forEach((role, index) => {
          const x = 138 + index * 262;
          context.globalAlpha = relief ? 1 : .4;
          context.beginPath(); context.roundRect(x, 648, 224, 138, 24); context.stroke(); context.globalAlpha = 1;
          context.beginPath(); context.roundRect(x + 90, 668, 44, 37, 10); context.stroke();
          context.beginPath(); context.moveTo(x + 101, 682); context.lineTo(x + 123, 682); context.moveTo(x + 106, 693); context.lineTo(x + 118, 693); context.stroke();
          context.font = "700 24px Arial, sans-serif"; context.fillText(role, x + 112, 754, 202);
        });
        context.globalAlpha = relief ? 1 : .28;
        context.beginPath(); context.moveTo(115, 838); context.lineTo(909, 838); context.stroke(); context.globalAlpha = 1;
        context.textAlign = "left"; context.font = "700 23px Arial, sans-serif";
        context.fillText(props.faces[face]?.preview ? "PREVIEW / NOT LAUNCH-READY" : "GOVERNED BY YOUR HUMAN CEO", 115, 893);
        context.fillStyle = relief ? "#dedede" : "#6ad0db";
        context.beginPath(); context.arc(890, 884, 9, 0, Math.PI * 2); context.fill();
      }
      artwork(c, false); artwork(b, true);
      const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
      const bumpMap = new THREE.CanvasTexture(bump); textures.push(map, bumpMap);
      const material = new THREE.MeshPhysicalMaterial({ map, bumpMap, bumpScale: -.016,
        color: 0xffffff, metalness: .18, roughness: .31,
        clearcoat: .4, clearcoatRoughness: .3, envMapIntensity: .4 });
      materials.push(material); return material;
    }
    // Material order: +X, -X, +Y, -Y, +Z, -Z; each side is a full, uninterrupted face.
    const body = new THREE.Mesh(geometry, [surface(1), surface(3), surface(4), surface(5), surface(0), surface(2)]);
    rig.add(body);

    const titleFont = new FontLoader().parse(titleFontData);
    const titleGeometries: THREE.BufferGeometry[] = [];
    const titleCap = new THREE.MeshPhysicalMaterial({ color: 0xcbd8ec, metalness: .6, roughness: .3, clearcoat: .35 });
    const titleEdge = new THREE.MeshPhysicalMaterial({ color: 0x52698b, metalness: .7, roughness: .34 });
    materials.push(titleCap, titleEdge);
    const faceTransforms = [
      [0, 0, 1.494, 0, 0], [1.494, 0, 0, 0, Math.PI / 2],
      [0, 0, -1.494, 0, Math.PI], [-1.494, 0, 0, 0, -Math.PI / 2],
      [0, 1.494, 0, -Math.PI / 2, 0], [0, -1.494, 0, Math.PI / 2, 0],
    ];
    titles.forEach((lines, face) => {
      const panel = new THREE.Group();
      const [x, y, z, rx, ry] = faceTransforms[face];
      panel.position.set(x, y, z); panel.rotation.set(rx, ry, 0);
      lines.forEach((line, index) => {
        const lettering = new TextGeometry(line, { font: titleFont, size: .21, depth: .022,
          curveSegments: 5, bevelEnabled: true, bevelThickness: .006, bevelSize: .004, bevelSegments: 3 });
        lettering.computeBoundingBox();
        const width = lettering.boundingBox!.max.x - lettering.boundingBox!.min.x;
        const text = new THREE.Mesh(lettering, [titleCap, titleEdge]);
        text.scale.x = Math.min(1, 2.2 / width); text.position.set(-1.12, .55 - index * .26, 0);
        titleGeometries.push(lettering); panel.add(text);
      });
      rig.add(panel);
    });

    // Render the same lit scene through a mirrored camera, clipped at the glass plane.
    // Alpha keeps the white page visible; the reflected image fades gently across the floor.
    const floorY = -2.62;
    const floorGeometry = new THREE.PlaneGeometry(14, 14);
    const floor = new Reflector(floorGeometry, { textureWidth: innerWidth < 760 ? 512 : 768,
      textureHeight: innerWidth < 760 ? 512 : 768, multisample: 0, clipBias: .003,
      shader: {
        name: "RythmGlassReflection",
        uniforms: { color: { value: null }, tDiffuse: { value: null }, textureMatrix: { value: null }, uViewportHeight: { value: 1 } },
        vertexShader: `uniform mat4 textureMatrix;
          varying vec4 vReflectionUv; varying vec2 vFloorUv;
          void main() { vFloorUv = uv; vReflectionUv = textureMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform sampler2D tDiffuse; uniform float uViewportHeight;
          varying vec4 vReflectionUv; varying vec2 vFloorUv;
          void main() {
            vec4 reflected = texture2DProj(tDiffuse, vReflectionUv);
            float fade = 1.0 - smoothstep(0.04, 0.39, length(vFloorUv - vec2(0.5)));
            float edgeFade = smoothstep(0.0, 0.20, gl_FragCoord.y / uViewportHeight);
            gl_FragColor = vec4(reflected.rgb, reflected.a * 0.46 * fade * edgeFade);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }`,
      } });
    (floor.material as THREE.ShaderMaterial).transparent = true;
    (floor.material as THREE.ShaderMaterial).depthWrite = false;
    floor.rotation.x = -Math.PI / 2; floor.position.y = floorY; scene.add(floor);
    let reflectionFrames = 0;
    const reflect = floor.onBeforeRender;
    floor.onBeforeRender = (...args) => {
      reflect.apply(floor, args);
      element.dataset.reflectionFrames = String(++reflectionFrames);
      element.dataset.reflectionPose = rig.quaternion.toArray().map((value) => value.toFixed(5)).join(",");
    };
    function renderScene() {
      // Keep a small, consistent clearance above the glass as the rounded cube tumbles.
      rig.updateMatrix();
      const m = rig.matrix.elements;
      const halfHeight = .28 + 1.22 * (Math.abs(m[1]) + Math.abs(m[5]) + Math.abs(m[9]));
      rig.position.y = floorY + halfHeight + .14;
      renderer.render(scene, camera);
    }

    let visible = true, disposed = false, lost = false, phase = 0, lastTime = 0, frame = 0, lastSelected = props.selected, transitioning = false, yaw = -.12, pitch = .1, roll = .02;
    const rotation = new THREE.Euler();
    const target = new THREE.Quaternion(), pointer = new THREE.Vector2(), smoothedPointer = new THREE.Vector2();
    function resize() {
      const { width, height } = element.getBoundingClientRect();
      renderer.setSize(width, height, false);
      (floor.material as THREE.ShaderMaterial).uniforms.uViewportHeight.value = renderer.domElement.height;
      camera.aspect = width / Math.max(height, 1); camera.updateProjectionMatrix();
      renderScene();
    }
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; lastTime = 0; }); intersection.observe(element);
    const move = (event: PointerEvent) => { const rect = element.getBoundingClientRect(); pointer.set((event.clientX - rect.left) / rect.width - .5, (event.clientY - rect.top) / rect.height - .5); };
    const leave = () => pointer.set(0, 0);
    const contextLost = (event: Event) => { event.preventDefault(); lost = true; element.dataset.engine = "fallback"; state.current.onEngineChange("fallback"); };
    element.addEventListener("pointermove", move); element.addEventListener("pointerleave", leave); renderer.domElement.addEventListener("webglcontextlost", contextLost);
    element.dataset.finish = "navy"; element.dataset.faceColors = Array(6).fill(faceColor).join(","); element.dataset.titleGeometry = "extruded-bevel"; element.dataset.titleDepth = ".022"; element.dataset.reflectionMode = "planar-camera";
    element.dataset.engine = "webgl"; element.dataset.cubies = "1"; element.dataset.roundedRadius = ".28"; element.dataset.surface = "continuous"; element.dataset.rotationMode = "full-three-axis"; element.dataset.faceNames = faceNames.join("|");
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
        if (current.reduced) { yaw = -current.selected * Math.PI / 2 - .12; pitch = .1; roll = .02; rig.quaternion.copy(target); transitioning = false; }
        else {
          rig.quaternion.slerp(target, 1 - Math.exp(-dt * 5));
          if (rig.quaternion.angleTo(target) < .001) { yaw = -current.selected * Math.PI / 2 - .12; pitch = .1; roll = .02; rig.quaternion.copy(target); transitioning = false; }
        }
        dirty = true;
      } else if (current.playing && !current.reduced) {
        phase += dt; smoothedPointer.lerp(pointer, 1 - Math.exp(-dt * 3));
        [pitch, yaw, roll] = advanceCubeRotation([pitch, yaw, roll], phase, dt);
        rig.quaternion.setFromEuler(rotation.set(pitch + smoothedPointer.y * .04, yaw, roll + smoothedPointer.x * .035)); dirty = true;
      }
      if (dirty) renderScene();
      element.dataset.selected = String(current.selected);
      element.dataset.transitioning = String(transitioning);
      element.dataset.angles = [pitch, yaw, roll].map((value) => value.toFixed(5)).join(",");
      element.dataset.pose = [rig.quaternion.x, rig.quaternion.y, rig.quaternion.z, rig.quaternion.w].map((value) => value.toFixed(5)).join(",");
    }
    frame = requestAnimationFrame(animate);
    return () => {
      disposed = true; cancelAnimationFrame(frame); observer.disconnect(); intersection.disconnect();
      element.removeEventListener("pointermove", move); element.removeEventListener("pointerleave", leave); renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      geometry.dispose(); titleGeometries.forEach((item) => item.dispose()); floorGeometry.dispose(); floor.dispose();
      textures.forEach((texture) => texture.dispose()); materials.forEach((material) => material.dispose()); environmentMap.dispose();
      renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
    // The scene is built once per page variant; selection and motion are read from a ref without recreating GPU resources.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.variant]);
  return <div className="studio-cube-canvas" ref={host} aria-hidden="true" />;
}
