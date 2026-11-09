"use client";

import * as React from "react";
import { useEffect, useRef, useState } from "react";

interface TalentLens3DSceneProps {
  className?: string;
  children?: React.ReactNode;
  variant?: "hero" | "compact";
}

const emptySubscribe = () => () => {};
function useMounted() {
  return React.useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

export function TalentLens3DScene({
  className = "",
  children,
  variant = "hero",
}: TalentLens3DSceneProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const mounted = useMounted();
  const [hasWebGL, setHasWebGL] = useState(true);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    let isCancelled = false;
    let animationFrameId: number;
    let renderer: any = null;
    let scene: any = null;
    let camera: any = null;

    // Disposables tracking
    const geometries: any[] = [];
    const materials: any[] = [];

    async function initThree() {
      try {
        const THREE = await import("three");
        if (isCancelled || !mountRef.current) return;

        const container = mountRef.current;
        const width = container.clientWidth || 800;
        const height = container.clientHeight || 500;

        // 1. Scene
        scene = new THREE.Scene();

        // 2. Camera
        camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        camera.position.set(0, 0, 7.5);

        // 3. Renderer with antialiasing and alpha
        renderer = new THREE.WebGLRenderer({
          alpha: true,
          antialias: true,
          powerPreference: "high-performance",
        });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x000000, 0); // Transparent canvas

        container.appendChild(renderer.domElement);

        // 4. Lighting — Nordic Instrumentarium Warm Bronze & Alpine Sage
        const ambientLight = new THREE.AmbientLight(0x252927, 2.5);
        scene.add(ambientLight);

        // Key light: Warm Anodized Bronze (#E69124)
        const bronzeLight = new THREE.DirectionalLight(0xe69124, 3.2);
        bronzeLight.position.set(5, 6, 4);
        scene.add(bronzeLight);

        // Rim light: Alpine Telemetry Sage (#10B981)
        const sageLight = new THREE.DirectionalLight(0x10b981, 2.0);
        sageLight.position.set(-5, -4, -2);
        scene.add(sageLight);

        // Core refraction point light
        const coreLight = new THREE.PointLight(0xe69124, 2.5, 8);
        coreLight.position.set(0, 0, 0);
        scene.add(coreLight);

        // 5. Central Optical Prism Assembly
        const prismGroup = new THREE.Group();
        scene.add(prismGroup);

        // A. Outer Wireframe Icosahedron (Precision measurement cage)
        const outerGeo = new THREE.IcosahedronGeometry(variant === "compact" ? 1.4 : 1.95, 0);
        const wireframeGeo = new THREE.WireframeGeometry(outerGeo);
        const wireframeMat = new THREE.LineBasicMaterial({
          color: 0xe69124,
          transparent: true,
          opacity: 0.65,
          linewidth: 1.5,
        });
        const outerWire = new THREE.LineSegments(wireframeGeo, wireframeMat);
        prismGroup.add(outerWire);
        geometries.push(outerGeo, wireframeGeo);
        materials.push(wireframeMat);

        // B. Inner Faceted Crystalline Core
        const coreGeo = new THREE.OctahedronGeometry(variant === "compact" ? 0.95 : 1.3, 0);
        const coreMat = new THREE.MeshStandardMaterial({
          color: 0x1a1d1c,
          emissive: 0x3d2710,
          emissiveIntensity: 0.45,
          roughness: 0.2,
          metalness: 0.85,
          transparent: true,
          opacity: 0.88,
        });
        const coreMesh = new THREE.Mesh(coreGeo, coreMat);
        prismGroup.add(coreMesh);
        geometries.push(coreGeo);
        materials.push(coreMat);

        // C. Concentric Coordinate Rings (Rotational optical reticles)
        const ring1Geo = new THREE.RingGeometry(2.35, 2.38, 64);
        const ring1Mat = new THREE.MeshBasicMaterial({
          color: 0x10b981,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.35,
        });
        const ring1 = new THREE.Mesh(ring1Geo, ring1Mat);
        ring1.rotation.x = Math.PI / 3;
        prismGroup.add(ring1);

        const ring2Geo = new THREE.RingGeometry(2.8, 2.82, 64);
        const ring2Mat = new THREE.MeshBasicMaterial({
          color: 0xe69124,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.25,
        });
        const ring2 = new THREE.Mesh(ring2Geo, ring2Mat);
        ring2.rotation.y = Math.PI / 4;
        prismGroup.add(ring2);

        geometries.push(ring1Geo, ring2Geo);
        materials.push(ring1Mat, ring2Mat);

        // D. Orbiting Candidate Qualification Nodes
        const nodesGroup = new THREE.Group();
        scene.add(nodesGroup);

        const nodeCount = 7;
        const nodePositions: { x: number; y: number; z: number; speed: number; angle: number; radius: number }[] = [];
        const nodeMeshes: any[] = [];

        const nodeGeo = new THREE.SphereGeometry(0.085, 16, 16);
        const nodeMat = new THREE.MeshStandardMaterial({
          color: 0xf7f6f2,
          emissive: 0xe69124,
          emissiveIntensity: 0.8,
          roughness: 0.1,
          metalness: 0.9,
        });
        geometries.push(nodeGeo);
        materials.push(nodeMat);

        for (let i = 0; i < nodeCount; i++) {
          const mesh = new THREE.Mesh(nodeGeo, nodeMat);
          nodesGroup.add(mesh);
          nodeMeshes.push(mesh);

          const radius = 2.4 + (i * 0.35);
          const speed = (0.35 + (i * 0.12)) * (i % 2 === 0 ? 1 : -1);
          nodePositions.push({
            x: 0,
            y: 0,
            z: 0,
            speed,
            angle: (i / nodeCount) * Math.PI * 2,
            radius,
          });
        }

        // 6. Mouse Interaction tracking (normalized)
        let mouseX = 0;
        let mouseY = 0;
        let targetX = 0;
        let targetY = 0;

        const onMouseMove = (e: MouseEvent) => {
          const rect = container.getBoundingClientRect();
          const x = (e.clientX - rect.left) / rect.width - 0.5;
          const y = (e.clientY - rect.top) / rect.height - 0.5;
          targetX = x * 1.5;
          targetY = y * 1.5;
        };

        window.addEventListener("mousemove", onMouseMove, { passive: true });

        // 7. Responsive ResizeObserver
        const resizeObserver = new ResizeObserver((entries) => {
          for (const entry of entries) {
            const { width: w, height: h } = entry.contentRect;
            if (w > 0 && h > 0 && camera && renderer) {
              camera.aspect = w / h;
              camera.updateProjectionMatrix();
              renderer.setSize(w, h);
            }
          }
        });
        resizeObserver.observe(container);

        // 8. Animation Loop
        let clock = new THREE.Clock();

        const animate = () => {
          if (isCancelled) return;
          animationFrameId = requestAnimationFrame(animate);

          const delta = clock.getDelta();
          const elapsedTime = clock.getElapsedTime();

          // Smooth mouse lerp
          mouseX += (targetX - mouseX) * 0.05;
          mouseY += (targetY - mouseY) * 0.05;

          // Prism rotation
          prismGroup.rotation.y = elapsedTime * 0.28 + mouseX * 0.7;
          prismGroup.rotation.x = Math.sin(elapsedTime * 0.2) * 0.15 - mouseY * 0.7;

          // Inner core counter-rotation
          coreMesh.rotation.y = -elapsedTime * 0.42;
          coreMesh.rotation.z = Math.cos(elapsedTime * 0.3) * 0.2;

          // Rings tilt
          ring1.rotation.z = elapsedTime * 0.35;
          ring2.rotation.x = -elapsedTime * 0.25;

          // Nodes orbit
          for (let i = 0; i < nodeCount; i++) {
            const node = nodePositions[i];
            node.angle += node.speed * delta;
            const x = Math.cos(node.angle) * node.radius;
            const z = Math.sin(node.angle) * node.radius;
            const y = Math.sin(elapsedTime * 1.2 + i) * 0.65;

            nodeMeshes[i].position.set(x, y, z);
          }

          renderer.render(scene, camera);
        };

        animate();

        // Cleanup listener references
        return () => {
          window.removeEventListener("mousemove", onMouseMove);
          resizeObserver.disconnect();
        };
      } catch (err) {
        console.warn("TalentLens 3D WebGL initialization skipped:", err);
        setHasWebGL(false);
      }
    }

    const cleanupInit = initThree();

    return () => {
      isCancelled = true;
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      cleanupInit.then((cleanupFn) => cleanupFn && cleanupFn());

      // Dispose Three.js objects
      geometries.forEach((g) => g.dispose && g.dispose());
      materials.forEach((m) => m.dispose && m.dispose());

      if (renderer) {
        try {
          renderer.dispose();
          if (renderer.domElement && renderer.domElement.parentNode) {
            renderer.domElement.parentNode.removeChild(renderer.domElement);
          }
        } catch {}
      }
    };
  }, [variant]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* 3D WebGL Canvas Layer */}
      <div
        ref={mountRef}
        className="absolute inset-0 z-0 transition-opacity duration-700 pointer-events-none"
        style={{ opacity: mounted && hasWebGL ? 1 : 0 }}
        aria-hidden="true"
      />

      {/* Directional Scrim: Deep Warm Basalt text protection on the left, open 3D on right */}
      <div
        className="absolute inset-0 z-[1] pointer-events-none bg-gradient-to-r from-background via-background/70 to-transparent"
        aria-hidden="true"
      />
      <div
        className="absolute inset-0 z-[1] pointer-events-none bg-gradient-to-t from-background via-transparent to-background/50"
        aria-hidden="true"
      />

      {/* Static Fallback (if WebGL is unsupported or reduced motion is active) */}
      {(!mounted || !hasWebGL) && (
        <div
          className="absolute inset-0 z-0 subtle-grid opacity-40 pointer-events-none"
          aria-hidden="true"
        />
      )}

      {/* Foreground Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

