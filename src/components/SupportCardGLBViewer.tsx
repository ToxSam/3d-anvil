'use client';

import { useRef, useMemo, Suspense, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF, Environment } from '@react-three/drei';
import * as THREE from 'three';

function TransparentBackground() {
  const { scene, gl } = useThree();
  useEffect(() => {
    scene.background = null;
    gl.setClearColor(0x000000, 0);
  }, [scene, gl]);
  return null;
}

function GLBScene({ url, isHovering }: { url: string; isHovering: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const { scene } = useGLTF(url);
  const clonedScene = useMemo(() => scene.clone(true), [scene]);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (isHovering) {
      groupRef.current.rotation.y += delta * 0.8;
    }
  });

  return (
    <group ref={groupRef} scale={1.2} position={[0, -0.8, 0]}>
      <primitive object={clonedScene} />
    </group>
  );
}

export function SupportCardGLBViewer({
  modelUrl,
  isHovering,
}: {
  modelUrl: string | null;
  isHovering: boolean;
}) {
  if (!modelUrl) return null;

  return (
    <div className="card-model-container w-36 h-36 min-w-[9rem] min-h-[9rem] flex-shrink-0 rounded-lg overflow-hidden bg-gray-900/20 dark:bg-gray-950/40">
      <Canvas
        camera={{ position: [3, 1, 4], fov: 42 }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
      >
        <TransparentBackground />
        <ambientLight intensity={0.7} />
        <directionalLight position={[4, 4, 4]} intensity={0.9} />
        <directionalLight position={[-2, 1, 2]} intensity={0.4} />
        <pointLight position={[0, 1, 2]} intensity={0.4} color="#fb923c" />
        <Environment preset="city" background={false} />
        <Suspense fallback={null}>
          <GLBScene url={modelUrl} isHovering={isHovering} />
        </Suspense>
      </Canvas>
    </div>
  );
}
