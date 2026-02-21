'use client';

import { useRef, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Environment } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from '@/providers/ThemeProvider';

function TransparentBackground() {
  const { scene, gl } = useThree();
  useEffect(() => {
    scene.background = null;
    gl.setClearColor(0x000000, 0);
  }, [scene, gl]);
  return null;
}

function AnvilModel({
  isDayMode,
  isHovering,
}: {
  isDayMode: boolean;
  isHovering: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const dayScene = useGLTF('/models/3Danvil02.glb').scene;
  const nightScene = useGLTF('/models/3Danvil01.glb').scene;

  // Clone scene so this card viewer doesn't conflict with the hero (shared scene = only one can render)
  const clonedScene = useMemo(() => {
    const src = isDayMode ? dayScene : nightScene;
    return src.clone(true);
  }, [isDayMode, dayScene, nightScene]);

  const clockRef = useRef(0);
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (isHovering) {
      clockRef.current += delta * 1.2;
      const angle = Math.PI * 0.25 * (0.1 - 0.05 * Math.sin(clockRef.current));
      groupRef.current.rotation.y = angle;
    }
    // When not hovering: do nothing – keep current rotation (no snap back)
  });

  return (
    <group ref={groupRef} scale={1.4} position={[0, -1.2, 0]}>
      <primitive object={clonedScene} />
    </group>
  );
}

export function CardAnvilModel({ isHovering = false }: { isHovering?: boolean }) {
  const { theme } = useTheme();
  const isDayMode = theme === 'light';

  return (
    <div className="card-model-container w-40 h-40 min-w-[10rem] min-h-[10rem] flex-shrink-0">
      <Canvas
        camera={{ position: [4, 1.5, 5], fov: 42 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 4, 4]} intensity={0.9} />
        <directionalLight position={[-2, 1, 2]} intensity={0.4} />
        <pointLight position={[0, 1, 2]} intensity={0.5} color="#c4b5fd" />
        <TransparentBackground />
        <Environment preset="city" background={false} />
        <AnvilModel isDayMode={isDayMode} isHovering={isHovering} />
      </Canvas>
    </div>
  );
}

useGLTF.preload('/models/3Danvil01.glb');
useGLTF.preload('/models/3Danvil02.glb');
