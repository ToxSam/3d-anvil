'use client';

import { VRMViewer } from './VRMViewer';

export function CardVRMModel({ isHovering = false }: { isHovering?: boolean }) {
  return (
    <div className="card-model-container w-40 h-40 min-w-[10rem] min-h-[10rem] flex-shrink-0 overflow-hidden">
      <VRMViewer
        url="/models/CoolBanana.vrm"
        animationUrl="/animations/Bored.fbx"
        height="100%"
        showGrid={false}
        staticView
        transparent
        isHovering={isHovering}
        modelScale={0.85}
        cameraPosition={[0.35, 0.95, 2.4]}
        cameraTarget={[0.15, 0.75, 0]}
        cameraFov={50}
        toolLighting
      />
    </div>
  );
}
