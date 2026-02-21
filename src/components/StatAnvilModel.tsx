'use client';

import { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
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

function AnvilModel({ isDayMode }: { isDayMode: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const dayScene = useGLTF('/models/3Danvil02.glb').scene;
  const nightScene = useGLTF('/models/3Danvil01.glb').scene;

  const clonedScene = useMemo(() => {
    const src = isDayMode ? dayScene : nightScene;
    return src.clone(true);
  }, [isDayMode, dayScene, nightScene]);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();
    const angle = Math.PI * 0.2 * (0.1 - 0.05 * Math.sin(t * 1.2));
    groupRef.current.rotation.y = angle;
  });

  return (
    <group ref={groupRef} scale={1.8} position={[0, -1, 0]}>
      <primitive object={clonedScene} />
    </group>
  );
}

export function StatAnvilModel() {
  const { theme } = useTheme();
  const isDayMode = theme === 'light';

  return (
    <div className="stat-anvil-container w-14 h-14 min-w-[3.5rem] min-h-[3.5rem] flex-shrink-0">
      <Canvas
        camera={{ position: [4, 1.5, 5], fov: 42 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[4, 4, 4]} intensity={0.9} />
        <directionalLight position={[-2, 1, 2]} intensity={0.4} />
        <pointLight position={[0, 1, 2]} intensity={0.5} color="#a78bfa" />
        <TransparentBackground />
        <AnvilModel isDayMode={isDayMode} />
      </Canvas>
    </div>
  );
}

useGLTF.preload('/models/3Danvil01.glb');
useGLTF.preload('/models/3Danvil02.glb');
