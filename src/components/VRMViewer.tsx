'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, useProgress } from '@react-three/drei';
import { Suspense, useEffect, useRef, useState } from 'react';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm';
import * as THREE from 'three';

// ── Mixamo rig name (from FBX track) → VRM humanoid bone name ──
// Matches osa-gallery / three-vrm example format
const MIXAMO_VRM_RIG_MAP: Record<string, string> = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder',
  mixamorigLeftArm: 'leftUpperArm',
  mixamorigLeftForeArm: 'leftLowerArm',
  mixamorigLeftHand: 'leftHand',
  mixamorigRightShoulder: 'rightShoulder',
  mixamorigRightArm: 'rightUpperArm',
  mixamorigRightForeArm: 'rightLowerArm',
  mixamorigRightHand: 'rightHand',
  mixamorigLeftUpLeg: 'leftUpperLeg',
  mixamorigLeftLeg: 'leftLowerLeg',
  mixamorigLeftFoot: 'leftFoot',
  mixamorigLeftToeBase: 'leftToes',
  mixamorigRightUpLeg: 'rightUpperLeg',
  mixamorigRightLeg: 'rightLowerLeg',
  mixamorigRightFoot: 'rightFoot',
  mixamorigRightToeBase: 'rightToes',
};

interface Props {
  url: string;
  height?: number | string;
  /** Called when the model has finished loading (for smooth transition UX) */
  onLoaded?: () => void;
  /** URL to a Mixamo FBX animation file (e.g. "/animations/Bored.fbx") */
  animationUrl?: string;
  /** When true, show T-pose instead of playing the animation */
  tPose?: boolean;
  /** When false, hide the grid floor (for compact/card layouts) */
  showGrid?: boolean;
  /** When true, disable orbit controls (fixed view for compact layouts) */
  staticView?: boolean;
  /** When true, use transparent background (for card/overlay use) */
  transparent?: boolean;
  /** When true (with staticView), rotate model on hover - for card viewers */
  isHovering?: boolean;
  /** Scale factor for the model (e.g. 0.7 for compact card view) */
  modelScale?: number;
  /** Override camera position for compact views e.g. [0, 0.9, 2.2] */
  cameraPosition?: [number, number, number];
  /** Override camera look-at target when staticView (default: humanoid center [0, 0.9, 0]) */
  cameraTarget?: [number, number, number];
  /** Camera FOV in degrees (wider = more of scene visible, e.g. 50 for card to show feet) */
  cameraFov?: number;
  /** When true, use forge/tool lighting (warm rim, industrial feel) */
  toolLighting?: boolean;
  /** When true, reframe camera on model load: fit avatar in full view, angled 3/4 perspective (disabled for staticView/cards) */
  fitCameraOnLoad?: boolean;
}

// ── Transparent background helper ──
function TransparentBackground() {
  const { scene, gl } = useThree();
  useEffect(() => {
    scene.background = null;
    gl.setClearColor(0x000000, 0);
  }, [scene, gl]);
  return null;
}

// ── Static camera lookAt (when no OrbitControls) ──
function StaticCameraTarget({ target }: { target: [number, number, number] }) {
  const { camera } = useThree();
  useEffect(() => {
    camera.lookAt(...target);
  }, [camera, target]);
  useFrame(() => {
    camera.lookAt(...target);
  });
  return null;
}

// ── Camera framing: after model loads, smoothly move to a 3/4 view showing the full avatar ──
//
// Distance formula uses the standard "fit bounding sphere to frustum" approach, the same
// method used by Three.js Editor, Babylon Inspector, Unity "Frame Selected", and drei Bounds:
//
//   distance = sphere.radius / sin(halfFov)
//
// halfFov is the SMALLER of the vertical and horizontal half-angles so the sphere fits on
// whichever axis the viewport shape constrains first (handles portrait/landscape automatically).
//
const CAMERA_FRAME_AZIMUTH   = 0.45;   // rad (~26°) – camera sits to the right for a 3/4 angle
// Elevation must stay very small. Any significant upward angle causes perspective distortion:
// things below the look-at point get stretched toward the bottom of the viewport, so the
// avatar consistently reads "too low" even though the target is mathematically centred.
// At ≈4° the camera is nearly level → head and feet subtend equal angles → truly centred.
const CAMERA_FRAME_ELEVATION = 0.07;   // rad (~4°)  – near-level, no perspective sink
const CAMERA_FRAME_PADDING   = 1.28;   // breathing room multiplier on the exact fit distance
// With near-level camera the sphere centre IS the visual centre → no bias needed.
const CAMERA_FRAME_TARGET_BIAS = 0.0;  // fraction of sphere.radius (0 = look at exact centre)
const CAMERA_FRAME_DELAY_FRAMES = 8;   // skinned meshes need several frames for matrixWorld
const CAMERA_FRAME_DURATION    = 1.6;  // seconds

type OrbitControlsLike = { target: THREE.Vector3 } | null;

// cubic ease-in-out: smooth gentle start, peak speed mid-way, smooth deceleration to rest
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Standard bounding-sphere camera fit.
 * Returns the camera distance from sphere.center so the sphere is fully visible.
 * Uses the more constrained FOV axis so the model fits on both screen axes.
 */
function computeFrameDistance(
  sphere: THREE.Sphere,
  fovVDeg: number,
  aspect: number,
): number {
  const fovV = (fovVDeg * Math.PI) / 180;
  const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect);
  const halfFov = Math.min(fovV / 2, fovH / 2); // more constrained axis
  return (sphere.radius / Math.sin(halfFov)) * CAMERA_FRAME_PADDING;
}

function CameraFrameController({
  sceneRef,
  fov,
  enabled,
}: {
  sceneRef: React.MutableRefObject<THREE.Object3D | null>;
  fov: number;
  enabled: boolean;
}) {
  const { camera, controls, size: canvasSize } = useThree<{
    controls: OrbitControlsLike;
    size: { width: number; height: number };
  }>((s) => ({ camera: s.camera, controls: s.controls, size: s.size }));

  const stateRef = useRef<{
    animating: boolean;
    startPos: THREE.Vector3;
    startTarget: THREE.Vector3;
    endPos: THREE.Vector3;
    endTarget: THREE.Vector3;
    t: number;
  } | null>(null);
  const lastSceneRef = useRef<THREE.Object3D | null>(null);
  const frameCountRef = useRef(0);

  useFrame((_, delta) => {
    if (!enabled || !sceneRef.current) return;

    const scene = sceneRef.current;
    const orbitControls = controls as OrbitControlsLike;

    // Reset when a new scene is loaded
    if (scene !== lastSceneRef.current) {
      lastSceneRef.current = scene;
      stateRef.current = null;
      frameCountRef.current = 0;
    }

    let state = stateRef.current;
    if (!state) {
      // Wait several frames so skinned mesh bones have updated matrixWorld
      frameCountRef.current += 1;
      if (frameCountRef.current < CAMERA_FRAME_DELAY_FRAMES) return;

      // Build an accurate bounding box by sampling bone world positions.
      // SkinnedMesh.computeBoundingBox() is unreliable for animated VRM models — it can
      // compute bounds in the wrong space or miss geometry when the pose differs from bind pose.
      // Bone world positions are always correct (updated every frame by the animation mixer
      // + vrm.update()) and the skeleton envelopes the whole body, so this is the most
      // reliable source of truth for the visual extent of a humanoid character.
      scene.updateMatrixWorld(true);

      const box = new THREE.Box3();
      const _bonePos = new THREE.Vector3();
      let hasBones = false;

      scene.traverse((obj) => {
        if ((obj as THREE.Bone).isBone) {
          obj.getWorldPosition(_bonePos);
          box.expandByPoint(_bonePos);
          hasBones = true;
        }
      });

      if (hasBones) {
        // Bones sit at joint centres, not at skin surface extremities.
        // Expand by ~12% of the largest dimension to include the surrounding geometry.
        const boneSize = box.getSize(new THREE.Vector3());
        const margin = Math.max(boneSize.x, boneSize.y, boneSize.z) * 0.12;
        box.expandByScalar(margin);
      } else {
        // Non-skinned GLB: standard bounding box is accurate
        box.setFromObject(scene);
      }

      if (box.isEmpty()) return;

      // All models stand with feet at y = 0 (VRM convention; GLB loader snaps floor to 0).
      // Snap here in case the lowest bone is at ankle height rather than foot tip.
      box.min.y = Math.min(box.min.y, 0);

      // Bounding sphere: centre = box centre, radius = half box diagonal.
      // Using the sphere (not raw box dims) is the standard approach — it's rotation-invariant
      // and maps directly to the "fit to frustum" formula without per-axis projection math.
      const sphere = new THREE.Sphere();
      box.getBoundingSphere(sphere);
      if (sphere.radius < 0.001) return;

      const aspect = canvasSize.width / Math.max(canvasSize.height, 1);
      const distance = computeFrameDistance(sphere, fov, aspect);

      const cosAz = Math.cos(CAMERA_FRAME_AZIMUTH);
      const sinAz = Math.sin(CAMERA_FRAME_AZIMUTH);
      const cosEl = Math.cos(CAMERA_FRAME_ELEVATION);
      const sinEl = Math.sin(CAMERA_FRAME_ELEVATION);

      const endPos = new THREE.Vector3(
        sphere.center.x + distance * cosEl * sinAz,
        sphere.center.y + distance * sinEl,
        sphere.center.z + distance * cosEl * cosAz,
      );
      // Look-at target: sphere centre offset downward by a fraction of the radius.
      // Negative bias → camera looks below centre → avatar drifts upward in the viewport.
      const endTarget = new THREE.Vector3(
        sphere.center.x,
        sphere.center.y + sphere.radius * CAMERA_FRAME_TARGET_BIAS,
        sphere.center.z,
      );

      const startTarget = orbitControls?.target
        ? orbitControls.target.clone()
        : new THREE.Vector3(0, 0.9, 0);

      state = {
        animating: true,
        startPos: camera.position.clone(),
        startTarget,
        endPos,
        endTarget,
        t: 0,
      };
      stateRef.current = state;
    }

    if (!state.animating) return;

    state.t += delta / CAMERA_FRAME_DURATION;
    const eased = easeInOutCubic(Math.min(1, state.t));
    camera.position.lerpVectors(state.startPos, state.endPos, eased);
    if (orbitControls?.target) {
      orbitControls.target.lerpVectors(state.startTarget, state.endTarget, eased);
    }

    if (state.t >= 1) {
      state.animating = false;
    }
  });

  return null;
}

// ── Retarget Mixamo FBX to VRM (osa-gallery / three-vrm example approach) ──
// Animates normalized bones; VRM update() propagates to raw bones

function retargetMixamoClipToVRM(
  vrm: VRM,
  clip: THREE.AnimationClip,
  fbxScene: THREE.Group
): THREE.AnimationClip | null {
  const tracks: THREE.KeyframeTrack[] = [];
  const restRotationInverse = new THREE.Quaternion();
  const parentRestWorldRotation = new THREE.Quaternion();
  const quatA = new THREE.Quaternion();
  const vec3 = new THREE.Vector3();

  const isVRM0 = vrm.meta?.metaVersion === '0';

  // Hips position scale for VectorKeyframeTrack
  const hipsNode = fbxScene.getObjectByName('mixamorigHips');
  let hipsPositionScale = 1;
  if (hipsNode) {
    const motionHipsHeight = hipsNode.position.y;
    const vrmHipsY = vrm.humanoid?.getNormalizedBoneNode('hips')?.getWorldPosition(vec3).y;
    const vrmRootY = vrm.scene.getWorldPosition(vec3).y;
    if (typeof vrmHipsY === 'number' && typeof vrmRootY === 'number' && motionHipsHeight !== 0) {
      hipsPositionScale = Math.abs(vrmHipsY - vrmRootY) / Math.abs(motionHipsHeight);
    }
  }

  fbxScene.updateMatrixWorld(true);

  for (const track of clip.tracks) {
    const parts = track.name.split('.');
    const mixamoRigName = parts[0];
    const propertyName = parts[1];
    if (!propertyName) continue;

    // Normalize "mixamorig:Hips" -> "mixamorigHips" for lookup
    const mapKey = mixamoRigName.replace(':', '');
    const vrmBoneName = MIXAMO_VRM_RIG_MAP[mapKey] ?? MIXAMO_VRM_RIG_MAP[mixamoRigName];
    if (!vrmBoneName) continue;

    const vrmNode = vrm.humanoid?.getNormalizedBoneNode(vrmBoneName as 'hips');
    const vrmNodeName = vrmNode?.name;
    const mixamoRigNode = fbxScene.getObjectByName(mixamoRigName) ?? fbxScene.getObjectByName(mapKey);
    if (!vrmNodeName || !mixamoRigNode) continue;

    if (track instanceof THREE.QuaternionKeyframeTrack) {
      mixamoRigNode.getWorldQuaternion(restRotationInverse).invert();
      if (mixamoRigNode.parent) {
        mixamoRigNode.parent.getWorldQuaternion(parentRestWorldRotation);
      } else {
        parentRestWorldRotation.identity();
      }

      const qTrack = track as THREE.QuaternionKeyframeTrack;
      const newValues = new Float32Array(qTrack.values.length);

      for (let i = 0; i < qTrack.values.length; i += 4) {
        quatA.fromArray(qTrack.values, i);
        quatA.premultiply(parentRestWorldRotation).multiply(restRotationInverse);
        quatA.toArray(newValues, i);
      }

      const mappedValues = isVRM0
        ? Array.from(newValues).map((v, i) => (i % 2 === 0 ? -v : v))
        : newValues;

      tracks.push(
        new THREE.QuaternionKeyframeTrack(
          `${vrmNodeName}.${propertyName}`,
          qTrack.times,
          mappedValues
        )
      );
    } else if (track instanceof THREE.VectorKeyframeTrack && propertyName === 'position') {
      const vTrack = track as THREE.VectorKeyframeTrack;
      const value = Array.from(vTrack.values).map((v, i) =>
        (isVRM0 && i % 3 !== 1 ? -v : v) * hipsPositionScale
      );
      tracks.push(
        new THREE.VectorKeyframeTrack(`${vrmNodeName}.${propertyName}`, vTrack.times, value)
      );
    }
  }

  if (tracks.length === 0) return null;
  return new THREE.AnimationClip('vrmAnimation', clip.duration, tracks);
}

// ── 3D Model component (VRM + GLB, with optional animation) ──

// ── Hover-rotate wrapper: ping-pong ±90° when hovering, keeps position on unhover ──
function HoverRotateGroup({
  children,
  isHovering,
}: {
  children: React.ReactNode;
  isHovering: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const clockRef = useRef(0);

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    if (isHovering) {
      clockRef.current += delta * 0.6;
      const angle = (Math.PI / 2) * Math.sin(clockRef.current);
      groupRef.current.rotation.y = angle;
    }
    // When not hovering: do nothing – keep current rotation (no snap back)
  });

  return <group ref={groupRef}>{children}</group>;
}

function Model3D({
  url,
  onLoaded,
  onSceneLoaded,
  animationUrl,
  tPose,
  modelScale = 1,
}: {
  url: string;
  onLoaded?: () => void;
  /** Called with the loaded scene for camera framing (optional) */
  onSceneLoaded?: (scene: THREE.Object3D) => void;
  animationUrl?: string;
  tPose?: boolean;
  modelScale?: number;
}) {
  const [scene, setScene] = useState<THREE.Group | null>(null);
  const vrmRef = useRef<VRM | null>(null);
  const sceneRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionRef = useRef<THREE.AnimationAction | null>(null);
  // Save rest (T-pose) quaternions so we can restore them when toggling to T-pose
  const restPosesRef = useRef<Map<string, THREE.Quaternion>>(new Map());

  // Load model + animation
  useEffect(() => {
    let cancelled = false;

    // ── Cleanup previous ──
    if (mixerRef.current) {
      mixerRef.current.stopAllAction();
      mixerRef.current = null;
    }
    actionRef.current = null;
    restPosesRef.current.clear();

    if (vrmRef.current) {
      VRMUtils.deepDispose(vrmRef.current.scene);
      vrmRef.current = null;
    } else if (sceneRef.current) {
      sceneRef.current.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
          const mats = Array.isArray(child.material) ? child.material : [child.material];
          mats.forEach((m) => m?.dispose());
        }
      });
      sceneRef.current = null;
    }

    // ── Load model ──
    const gltfLoader = new GLTFLoader();
    gltfLoader.register((parser) => new VRMLoaderPlugin(parser));

    gltfLoader.load(
      url,
      (gltf) => {
        if (cancelled) return;

        const loadedVrm = gltf.userData.vrm as VRM | undefined;

        if (loadedVrm) {
          // ── VRM model ──
          loadedVrm.scene.rotation.y = Math.PI;
          vrmRef.current = loadedVrm;
          sceneRef.current = loadedVrm.scene;
          setScene(loadedVrm.scene);
          onSceneLoaded?.(loadedVrm.scene);

          // Load animation if provided
          if (animationUrl) {
            const fbxLoader = new FBXLoader();
            fbxLoader.load(
              animationUrl,
              (fbx) => {
                if (cancelled || !vrmRef.current) return;

                const clip =
                  THREE.AnimationClip.findByName(fbx.animations, 'mixamo.com') ??
                  fbx.animations[0];
                if (!clip) return;

                const retargeted = retargetMixamoClipToVRM(vrmRef.current, clip, fbx);
                if (!retargeted) return;

                // Save rest poses (T-pose) for all animated bones
                const restPoses = new Map<string, THREE.Quaternion>();
                for (const track of retargeted.tracks) {
                  const nodeName = track.name.split('.')[0];
                  const node = loadedVrm.scene.getObjectByName(nodeName);
                  if (node && !restPoses.has(nodeName)) {
                    restPoses.set(nodeName, node.quaternion.clone());
                  }
                }
                restPosesRef.current = restPoses;

                // Create mixer and start playing
                const mixer = new THREE.AnimationMixer(loadedVrm.scene);
                const action = mixer.clipAction(retargeted);
                action.play();

                mixerRef.current = mixer;
                actionRef.current = action;
              },
              undefined,
              (err) => console.warn('Failed to load animation:', err)
            );
          }

          onLoaded?.();
        } else {
          // ── Plain GLB ── auto-center & scale
          const model = gltf.scene;
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);

          if (maxDim > 0) {
            const targetHeight = 1.6;
            const scaleFactor = size.y > 0 ? targetHeight / size.y : targetHeight / maxDim;
            model.scale.setScalar(scaleFactor);
            box.setFromObject(model);
            const center = box.getCenter(new THREE.Vector3());
            model.position.x -= center.x;
            model.position.z -= center.z;
            model.position.y -= box.min.y;
          }

          vrmRef.current = null;
          sceneRef.current = model;
          setScene(model);
          onSceneLoaded?.(model);
          onLoaded?.();
        }
      },
      undefined,
      (error) => console.error('Error loading model:', error)
    );

    return () => {
      cancelled = true;
      if (mixerRef.current) {
        mixerRef.current.stopAllAction();
        mixerRef.current = null;
      }
      actionRef.current = null;
      restPosesRef.current.clear();

      if (vrmRef.current) {
        VRMUtils.deepDispose(vrmRef.current.scene);
        vrmRef.current = null;
      } else if (sceneRef.current) {
        sceneRef.current.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach((m) => m?.dispose());
          }
        });
        sceneRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, animationUrl]);

  // ── T-pose toggle: stop/start animation ──
  useEffect(() => {
    if (!actionRef.current || !mixerRef.current) return;

    if (tPose) {
      // Stop animation and restore rest poses
      actionRef.current.stop();
      mixerRef.current.stopAllAction();

      // Restore saved T-pose quaternions
      if (vrmRef.current) {
        restPosesRef.current.forEach((quat, nodeName) => {
          const node = vrmRef.current!.scene.getObjectByName(nodeName);
          if (node) node.quaternion.copy(quat);
        });
      }
    } else {
      // Resume animation from start
      actionRef.current.reset();
      actionRef.current.play();
    }
  }, [tPose]);

  // ── Per-frame update ──
  useFrame((_, delta) => {
    const vrm = vrmRef.current;

    if (vrm) {
      if (mixerRef.current && actionRef.current?.isRunning()) {
        // Animation targets normalized bones; mixer updates them first
        mixerRef.current.update(delta);
      }
      // Always run VRM update: copies normalized -> raw bones, updates spring bones
      vrm.update(delta);
    }
  });

  if (!scene) return null;
  if (modelScale !== 1) {
    return (
      <group scale={modelScale}>
        <primitive object={scene} />
      </group>
    );
  }
  return <primitive object={scene} />;
}


// ── Grid floor ──

function GridFloor() {
  return (
    <group>
      {[0.5, 1.0, 1.5, 2.0].map((radius, i) => (
        <mesh key={i} rotation-x={-Math.PI / 2} position-y={0.001}>
          <ringGeometry args={[radius - 0.005, radius + 0.005, 64]} />
          <meshBasicMaterial color="#888888" transparent opacity={0.3} />
        </mesh>
      ))}
      {Array.from({ length: 8 }).map((_, i) => {
        const angle = (i / 8) * Math.PI * 2;
        const points = [
          new THREE.Vector3(0, 0.001, 0),
          new THREE.Vector3(Math.cos(angle) * 2, 0.001, Math.sin(angle) * 2),
        ];
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        return (
          <lineSegments key={i} geometry={geometry}>
            <lineBasicMaterial color="#888888" transparent opacity={0.2} />
          </lineSegments>
        );
      })}
    </group>
  );
}

// ── Loader ──

function Loader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="text-gray-900 dark:text-gray-100 bg-[#EBE7E0] dark:bg-[#141311] px-4 py-2 text-small font-mono">
        Loading {progress.toFixed(0)}%
      </div>
    </Html>
  );
}

// ── Main viewer component ──

export function VRMViewer({
  url,
  height = 400,
  onLoaded,
  animationUrl,
  tPose,
  showGrid = true,
  staticView = false,
  transparent = false,
  isHovering = false,
  modelScale = 1,
  cameraPosition = [0, 1.2, 2.5],
  cameraTarget = [0, 0.9, 0],
  cameraFov = 45,
  toolLighting = false,
  fitCameraOnLoad = !staticView,
}: Props) {
  const heightStyle = typeof height === 'number' ? `${height}px` : height;
  const loadedSceneRef = useRef<THREE.Object3D | null>(null);

  useEffect(() => {
    loadedSceneRef.current = null;
  }, [url]);

  const modelContent = (
    <Model3D
      url={url}
      onLoaded={onLoaded}
      onSceneLoaded={(scene) => { loadedSceneRef.current = scene; }}
      animationUrl={animationUrl}
      tPose={tPose}
      modelScale={modelScale}
    />
  );

  return (
    <div
      style={{ width: '100%', height: heightStyle }}
      className={transparent ? 'rounded-none' : 'bg-gray-100/10 dark:bg-gray-900/10 rounded-none'}
    >
      <Canvas
        camera={{ position: cameraPosition, fov: cameraFov }}
        style={{ background: 'transparent' }}
        gl={{ alpha: true, antialias: true }}
      >
        <TransparentBackground />
        {staticView && <StaticCameraTarget target={cameraTarget} />}
        {toolLighting ? (
          <>
            <ambientLight intensity={0.55} />
            <directionalLight position={[2, 3, 2]} intensity={1.0} color="#fff8f0" />
            <directionalLight position={[-1.2, 1, -2]} intensity={0.45} color="#c4a574" />
            <directionalLight position={[0.5, -0.3, -2.5]} intensity={0.6} color="#e8c878" />
            <pointLight position={[-1.5, 1.5, 2]} intensity={0.35} color="#d4a574" decay={2} distance={8} />
            <pointLight position={[0, 0.5, -1.5]} intensity={0.25} color="#f0d090" decay={2} distance={6} />
          </>
        ) : (
          <>
            <ambientLight intensity={0.7} />
            <directionalLight position={[1, 2, 1]} intensity={1.0} />
            <directionalLight position={[-1, 1, -1]} intensity={0.3} />
            <directionalLight position={[0, 0, -5]} intensity={0.2} color="#ffcc88" />
          </>
        )}

        <Suspense fallback={<Loader />}>
          {staticView ? (
            <HoverRotateGroup isHovering={isHovering}>{modelContent}</HoverRotateGroup>
          ) : (
            modelContent
          )}
          {showGrid && <GridFloor />}
        </Suspense>

        {!staticView && (
          <>
            <OrbitControls
              makeDefault
              target={[0, 0.9, 0]}
              enablePan={true}
              enableDamping
              dampingFactor={0.05}
              minDistance={0.8}
              maxDistance={5}
              maxPolarAngle={Math.PI / 1.8}
            />
            {fitCameraOnLoad && (
              <CameraFrameController
                sceneRef={loadedSceneRef}
                fov={cameraFov}
                enabled={true}
              />
            )}
          </>
        )}
      </Canvas>
    </div>
  );
}
