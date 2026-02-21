'use client';

import { useRef, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Environment, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useTheme } from '@/providers/ThemeProvider';

/** Ensures the scene background is always transparent */
function TransparentBackground() {
  const { scene, gl } = useThree();
  useEffect(() => {
    scene.background = null;
    gl.setClearColor(0x000000, 0);
  }, [scene, gl]);
  return null;
}

// Rotation config
const ROTATION = {
  speed: 1.2,
  range: Math.PI / 1,
  mode: 'ping-pong' as 'ping-pong' | 'continuous' | 'none',
};

/** Pulsing rim/glow light for the anvil */
function PulsingGlow({ isDayMode }: { isDayMode: boolean }) {
  const lightRef = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    if (!lightRef.current) return;
    const t = state.clock.getElapsedTime();
    const pulse = 0.7 + 0.3 * Math.sin(t * 1.5);
    lightRef.current.intensity = pulse * 1.2;
  });
  const color = isDayMode ? '#a78bfa' : '#818cf8';
  return (
    <pointLight ref={lightRef} position={[0, 2, 4]} color={color} intensity={1} distance={12} decay={2} />
  );
}

function AnvilModel({ isDayMode }: { isDayMode: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const dayScene = useGLTF('/models/3Danvil02.glb').scene;
  const nightScene = useGLTF('/models/3Danvil01.glb').scene;

  useFrame((state) => {
    if (!groupRef.current || ROTATION.mode === 'none') return;
    const t = state.clock.getElapsedTime();
    let angle: number;
    if (ROTATION.mode === 'continuous') {
      angle = t * ROTATION.speed;
    } else {
      angle = ROTATION.range * (0.1 + -0.05 * Math.sin(t * ROTATION.speed));
    }
    groupRef.current.rotation.y = angle;
  });

  return (
    <group ref={groupRef} scale={2.8} position={[0, -2, 0]}>
      <primitive object={isDayMode ? dayScene : nightScene} />
    </group>
  );
}

export function HeroModel() {
  const { theme } = useTheme();
  const isDayMode = theme === 'light';

  return (
    <div className="hero-model-container">
      <Canvas
        camera={{ position: [7.5, 2.5, 10], fov: 42 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
      >
        <TransparentBackground />
        <ambientLight intensity={0.5} />
        <directionalLight position={[6, 6, 5]} intensity={1.1} />
        <directionalLight position={[-4, 2, 3]} intensity={0.5} />
        <pointLight position={[-2, 1, 3]} intensity={0.4} color="#c4b5fd" />
        <PulsingGlow isDayMode={isDayMode} />
        <Environment preset="city" background={false} />
        <AnvilModel isDayMode={isDayMode} />
        <OrbitControls
          target={[0, -1, 0]}
          enablePan={false}
          enableZoom={false}
          enableRotate={true}
          enableDamping
          dampingFactor={0.08}
          rotateSpeed={0.5}
          minPolarAngle={Math.PI / 5}
          maxPolarAngle={Math.PI / 1.4}
        />
      </Canvas>
    </div>
  );
}

// Preload both models
useGLTF.preload('/models/3Danvil01.glb');
useGLTF.preload('/models/3Danvil02.glb');
