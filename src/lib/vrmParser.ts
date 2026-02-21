import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM } from '@pixiv/three-vrm';
import * as THREE from 'three';

const GLB_MAGIC = 0x46546c67; // "glTF"
const GLB_CHUNK_JSON = 0x4e4f534a; // "JSON"
const GLB_CHUNK_BIN = 0x004e4942; // "BIN"

interface GLTFImage {
  uri?: string;
  bufferView?: number;
  mimeType?: string;
}

interface GLTFJson {
  images?: GLTFImage[];
  textures?: { source?: number }[];
  extensions?: {
    VRM?: { meta?: { texture?: number } };
    VRMC_vrm?: { meta?: { thumbnailImage?: number } };
  };
}

/**
 * Extract thumbnail directly from VRM/GLB file by parsing the binary.
 * VRM 0.x: extensions.VRM.meta.texture → textures[].source → images[]
 * VRM 1.0: extensions.VRMC_vrm.meta.thumbnailImage → images[]
 */
function extractThumbnailFromGLB(arrayBuffer: ArrayBuffer): string | null {
  try {
    const view = new DataView(arrayBuffer);
    if (view.byteLength < 20) return null;

    const magic = view.getUint32(0, true);
    if (magic !== GLB_MAGIC) return null;

    // First chunk is JSON (at offset 12)
    const chunk0Length = view.getUint32(12, true);
    const chunk0Type = view.getUint32(16, true);
    if (chunk0Type !== GLB_CHUNK_JSON) return null;

    const jsonBytes = new Uint8Array(arrayBuffer, 20, chunk0Length);
    const jsonText = new TextDecoder().decode(jsonBytes);
    const json: GLTFJson = JSON.parse(jsonText);

    const images = json.images;
    const textures = json.textures;
    const ext = json.extensions;
    if (!images || images.length === 0) return null;

    let imageIndex: number | undefined;

    // VRM 1.0: thumbnailImage is direct image index
    const vrm1Meta = ext?.VRMC_vrm?.meta;
    if (vrm1Meta != null && typeof vrm1Meta.thumbnailImage === 'number') {
      imageIndex = vrm1Meta.thumbnailImage;
    }

    // VRM 0.x: texture index → textures[].source → image index
    if (imageIndex == null && textures) {
      const vrm0Meta = ext?.VRM?.meta;
      const textureIndex = vrm0Meta?.texture;
      if (typeof textureIndex === 'number' && textureIndex >= 0 && textures[textureIndex]) {
        const texSource = textures[textureIndex].source;
        if (typeof texSource === 'number') imageIndex = texSource;
      }
    }

    if (imageIndex == null || imageIndex < 0 || imageIndex >= images.length) return null;

    const image = images[imageIndex];
    if (!image) return null;

    // Case 1: Image has data URI
    if (image.uri) {
      if (image.uri.startsWith('data:')) return image.uri;
      // External URI in GLB is rare; skip
      return null;
    }

    // Case 2: Image is in bufferView (embedded in BIN chunk)
    const bufferViewIndex = image.bufferView;
    if (typeof bufferViewIndex !== 'number') return null;

    const bufferViews = (json as Record<string, unknown>).bufferViews as
      | { buffer?: number; byteOffset?: number; byteLength?: number }[]
      | undefined;
    const buffers = (json as Record<string, unknown>).buffers as
      | { byteLength?: number }[]
      | undefined;
    if (!bufferViews || !bufferViews[bufferViewIndex] || !buffers) return null;

    const bv = bufferViews[bufferViewIndex];
    const byteOffset = bv.byteOffset ?? 0;
    const byteLength = bv.byteLength ?? 0;
    const bufferIndex = bv.buffer ?? 0;

    if (bufferIndex > 0) return null; // Multi-buffer not typical in GLB

    // Find BIN chunk (follows JSON chunk)
    let offset = 20 + chunk0Length;
    while (offset + 8 <= view.byteLength) {
      const len = view.getUint32(offset, true);
      const type = view.getUint32(offset + 4, true);
      if (type === GLB_CHUNK_BIN) {
        const binStart = offset + 8;
        const binEnd = binStart + len;
        const sliceStart = binStart + byteOffset;
        const sliceEnd = sliceStart + byteLength;
        if (sliceEnd <= binEnd && sliceStart >= binStart) {
          const mime = image.mimeType || 'image/png';
          const bytes = new Uint8Array(arrayBuffer.slice(sliceStart, sliceEnd));
          const b64 =
            typeof Buffer !== 'undefined'
              ? Buffer.from(bytes).toString('base64')
              : btoa(
                  Array.from(bytes)
                    .map((b) => String.fromCharCode(b))
                    .join('')
                );
          return `data:${mime};base64,${b64}`;
        }
        return null;
      }
      offset += 8 + len;
    }
    return null;
  } catch {
    return null;
  }
}

export interface VRMTextureInfo {
  name: string;
  type: string;
  dataUri: string;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface VRMMetadata {
  /** Discriminator: 'vrm' for VRM files, 'glb' for plain GLB files */
  fileType: 'vrm' | 'glb';
  title: string;
  version: string;
  author: string;
  license: string;
  commercialUse: string;
  violentUse: string;
  sexualUse: string;
  thumbnail: string | null;
  blendShapeCount: number;
  boneCount: number;
  // Extended metadata for Step 1 confirmation
  contactInformation: string;
  reference: string;
  allowedUserName: string;
  otherPermissionUrl: string;
  otherLicenseUrl: string;
  /** 'VRM 0.x' | 'VRM 1.0' for VRM files, 'GLB' for plain GLB */
  vrmType: string;
  fileSizeBytes: number;
  heightMeters: number;
  vertexCount: number;
  triangleCount: number;
  materialCount: number;
  textureCount: number;
  /** Texture list for display (preview, dimensions, type) — no download */
  textures: VRMTextureInfo[];
  /** Number of animation clips embedded in the GLB (GLB only, 0 for VRM) */
  animationCount: number;
  /** Skeleton / armature bone count from scene traversal (more accurate for GLB) */
  skeletonBoneCount: number;
}

function formatAllowedUser(value: string): string {
  const map: Record<string, string> = {
    OnlyAuthor: 'Only Author',
    ExplicitlyLicensedPerson: 'Explicitly Licensed Person',
    Everyone: 'Everyone',
  };
  return map[value] || value;
}

function computeModelStats(gltf: { scene: THREE.Object3D }): {
  vertexCount: number;
  triangleCount: number;
  materialCount: number;
  textureCount: number;
  heightMeters: number;
} {
  const meshes: THREE.Mesh[] = [];
  const materialSet = new Set<THREE.Material>();
  const textureSet = new Set<THREE.Texture>();

  gltf.scene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh) {
      const mesh = obj as THREE.Mesh;
      meshes.push(mesh);
      if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          materialSet.add(m);
          const mat = m as THREE.MeshStandardMaterial & { map?: THREE.Texture };
          if (mat.map) textureSet.add(mat.map);
          if (mat.normalMap) textureSet.add(mat.normalMap);
          if (mat.roughnessMap) textureSet.add(mat.roughnessMap);
          if (mat.metalnessMap) textureSet.add(mat.metalnessMap);
        });
      }
    }
  });

  let vertexCount = 0;
  let triangleCount = 0;

  meshes.forEach((mesh) => {
    const geom = mesh.geometry;
    if (!geom) return;
    const pos = geom.attributes.position;
    if (pos) vertexCount += pos.count;
    if (geom.index) {
      triangleCount += geom.index.count / 3;
    } else if (pos) {
      triangleCount += pos.count / 3;
    }
  });

  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = new THREE.Vector3();
  box.getSize(size);
  const heightMeters = size.y;

  return {
    vertexCount: Math.round(vertexCount),
    triangleCount: Math.round(triangleCount),
    materialCount: materialSet.size,
    textureCount: textureSet.size,
    heightMeters,
  };
}

const TEXTURE_TYPE_MAP: Record<string, string> = {
  map: 'Albedo/Diffuse',
  normalMap: 'Normal',
  emissiveMap: 'Emissive',
  metalnessMap: 'Metalness',
  roughnessMap: 'Roughness',
  aoMap: 'Ambient Occlusion',
  displacementMap: 'Displacement/Height',
  alphaMap: 'Alpha/Transparency',
};

function textureToDataUri(tex: THREE.Texture): string | null {
  try {
    const img = (tex as THREE.Texture & { image?: HTMLImageElement | HTMLCanvasElement | ImageBitmap }).image;
    if (!img) return null;
    const w = (img as { width?: number }).width ?? 0;
    const h = (img as { height?: number }).height ?? 0;
    if (w <= 0 || h <= 0) return null;
    const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!canvas) return null;
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img as CanvasImageSource, 0, 0);
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function extractTexturesFromScene(gltf: { scene: THREE.Object3D }): VRMTextureInfo[] {
  const seen = new Set<string>();
  const out: VRMTextureInfo[] = [];
  const props = [
    'map',
    'normalMap',
    'emissiveMap',
    'metalnessMap',
    'roughnessMap',
    'aoMap',
    'displacementMap',
    'alphaMap',
  ] as const;

  gltf.scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach((m) => {
      const mat = m as THREE.MeshStandardMaterial & Record<string, THREE.Texture | undefined>;
      props.forEach((prop) => {
        const tex = mat[prop];
        if (!tex || !tex.image || seen.has(tex.uuid)) return;
        seen.add(tex.uuid);
        const img = tex.image as { width?: number; height?: number };
        const w = img.width ?? 0;
        const h = img.height ?? 0;
        if (w <= 0 || h <= 0) return;
        const dataUri = textureToDataUri(tex);
        if (!dataUri) return;
        const type = TEXTURE_TYPE_MAP[prop] ?? prop;
        const name = tex.name || `${mat.name || 'Material'}_${prop}`;
        const bytesPerPixel = tex.format === THREE.RedFormat ? 1 : tex.format === THREE.RGFormat ? 2 : 4;
        const sizeBytes = Math.round(w * h * bytesPerPixel);
        out.push({ name, type, dataUri, width: w, height: h, sizeBytes });
      });
    });
  });

  return out;
}

export async function parseVRM(file: File): Promise<VRMMetadata> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));

      // Extract thumbnail directly from GLB (most reliable - avoids async texture loading)
      const thumbnail = extractThumbnailFromGLB(arrayBuffer);

      loader.parse(
        arrayBuffer,
        '',
        (gltf) => {
          const vrm = gltf.userData.vrm as VRM;

          if (!vrm) {
            reject(new Error('Invalid VRM file'));
            return;
          }

          const meta = vrm.meta as unknown as Record<string, unknown>;
          const stats = computeModelStats(gltf);
          const textures = extractTexturesFromScene(gltf);
          const metaVersion = (meta?.metaVersion as string) || (meta?.version as string) || '';
          const vrmType = metaVersion.startsWith('1') || metaVersion.startsWith('1.') ? 'VRM 1.0' : 'VRM 0.x';

          const metadata: VRMMetadata = {
            fileType: 'vrm',
            title: (meta?.name as string) || (meta?.title as string) || 'Untitled',
            // version = model version (e.g. "v2.0"); metaVersion = spec version ("0" or "1")
            version: (meta?.version as string) || (meta?.metaVersion as string) || '—',
            author: Array.isArray(meta?.authors) ? (meta.authors[0] as string) : (meta?.author as string) || '',
            license: (meta?.licenseName as string) || (meta?.allowedUserName as string) || 'Unknown',
            commercialUse: (meta?.commercialUssageName as string) || (meta?.commercialUsage as string) || 'Unknown',
            violentUse: (meta?.violentUssageName as string) || (meta?.allowExcessivelyViolentUsage ? 'Allow' : 'Disallow') || 'Unknown',
            sexualUse: (meta?.sexualUssageName as string) || (meta?.allowExcessivelySexualUsage ? 'Allow' : 'Disallow') || 'Unknown',
            thumbnail,
            blendShapeCount: Object.keys(vrm.expressionManager?.expressionMap || {}).length,
            boneCount: vrm.humanoid?.humanBones ? Object.keys(vrm.humanoid.humanBones).length : 0,
            contactInformation: (meta?.contactInformation as string) || '',
            reference: (meta?.reference as string) || '',
            allowedUserName: formatAllowedUser((meta?.allowedUserName as string) || 'Everyone'),
            otherPermissionUrl: (meta?.otherPermissionUrl as string) || '',
            otherLicenseUrl: (meta?.otherLicenseUrl as string) || '',
            vrmType,
            fileSizeBytes: file.size,
            heightMeters: stats.heightMeters,
            vertexCount: stats.vertexCount,
            triangleCount: stats.triangleCount,
            materialCount: stats.materialCount,
            textureCount: stats.textureCount,
            textures,
            animationCount: 0,
            skeletonBoneCount: 0,
          };

          resolve(metadata);
        },
        (error) => reject(error)
      );
    };

    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Count skeleton bones in a GLTF scene by traversing for Bone objects.
 */
function countSkeletonBones(scene: THREE.Object3D): number {
  let count = 0;
  scene.traverse((obj) => {
    if ((obj as THREE.Bone).isBone) count++;
  });
  return count;
}

/**
 * Extract a title/name from GLB JSON metadata.
 */
function extractGLBTitle(json: Record<string, unknown>): string {
  const asset = json.asset as Record<string, unknown> | undefined;
  const extras = asset?.extras as Record<string, unknown> | undefined;
  if (extras?.title && typeof extras.title === 'string') return extras.title;
  if (extras?.name && typeof extras.name === 'string') return extras.name;
  const scenes = json.scenes as { name?: string }[] | undefined;
  if (scenes?.[0]?.name) return scenes[0].name;
  const nodes = json.nodes as { name?: string }[] | undefined;
  if (nodes?.[0]?.name) return nodes[0].name;
  return '';
}

/**
 * Extract author/generator info from GLB asset metadata.
 */
function extractGLBAuthor(json: Record<string, unknown>): string {
  const asset = json.asset as Record<string, unknown> | undefined;
  const extras = asset?.extras as Record<string, unknown> | undefined;
  if (extras?.author && typeof extras.author === 'string') return extras.author;
  if (extras?.creator && typeof extras.creator === 'string') return extras.creator;
  return '';
}

/**
 * Parse a plain GLB file (non-VRM) and extract metadata comparable to VRM.
 * License fields are left empty — user must select a license via the UI.
 */
export async function parseGLB(file: File): Promise<VRMMetadata> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      const loader = new GLTFLoader();

      let glbTitle = '';
      let glbAuthor = '';
      let glbVersion = '';
      try {
        const view = new DataView(arrayBuffer);
        if (view.byteLength >= 20) {
          const magic = view.getUint32(0, true);
          if (magic === GLB_MAGIC) {
            const chunk0Length = view.getUint32(12, true);
            const chunk0Type = view.getUint32(16, true);
            if (chunk0Type === GLB_CHUNK_JSON) {
              const jsonBytes = new Uint8Array(arrayBuffer, 20, chunk0Length);
              const jsonText = new TextDecoder().decode(jsonBytes);
              const json = JSON.parse(jsonText) as Record<string, unknown>;
              glbTitle = extractGLBTitle(json);
              glbAuthor = extractGLBAuthor(json);
              const asset = json.asset as Record<string, unknown> | undefined;
              glbVersion = (asset?.version as string) || '';
            }
          }
        }
      } catch {
        // Non-critical
      }

      loader.parse(
        arrayBuffer,
        '',
        (gltf) => {
          const stats = computeModelStats(gltf);
          const textures = extractTexturesFromScene(gltf);
          const skeletonBoneCount = countSkeletonBones(gltf.scene);
          const animationCount = gltf.animations?.length ?? 0;

          const metadata: VRMMetadata = {
            fileType: 'glb',
            title: glbTitle || file.name.replace(/\.glb$/i, ''),
            version: glbVersion || '—',
            author: glbAuthor,
            license: '',
            commercialUse: '',
            violentUse: '',
            sexualUse: '',
            thumbnail: null,
            blendShapeCount: 0,
            boneCount: skeletonBoneCount,
            contactInformation: '',
            reference: '',
            allowedUserName: '',
            otherPermissionUrl: '',
            otherLicenseUrl: '',
            vrmType: 'GLB',
            fileSizeBytes: file.size,
            heightMeters: stats.heightMeters,
            vertexCount: stats.vertexCount,
            triangleCount: stats.triangleCount,
            materialCount: stats.materialCount,
            textureCount: stats.textureCount,
            textures,
            animationCount,
            skeletonBoneCount,
          };

          resolve(metadata);
        },
        (error) => reject(error)
      );
    };

    reader.onerror = () => reject(new Error('Failed to read GLB file'));
    reader.readAsArrayBuffer(file);
  });
}

/** Common 3D model licenses for the GLB license picker */
export const GLB_LICENSE_OPTIONS = [
  { value: 'CC0', label: 'CC0 (Public Domain)' },
  { value: 'CC_BY_4.0', label: 'CC BY 4.0' },
  { value: 'CC_BY_SA_4.0', label: 'CC BY-SA 4.0' },
  { value: 'CC_BY_NC_4.0', label: 'CC BY-NC 4.0' },
  { value: 'CC_BY_NC_SA_4.0', label: 'CC BY-NC-SA 4.0' },
  { value: 'CC_BY_ND_4.0', label: 'CC BY-ND 4.0' },
  { value: 'CC_BY_NC_ND_4.0', label: 'CC BY-NC-ND 4.0' },
  { value: 'MIT', label: 'MIT License' },
  { value: 'Apache_2.0', label: 'Apache 2.0' },
  { value: 'GPL_3.0', label: 'GPL 3.0' },
  { value: 'All_Rights_Reserved', label: 'All Rights Reserved' },
] as const;

export type GLBLicenseValue = (typeof GLB_LICENSE_OPTIONS)[number]['value'];

/**
 * Metadata for each GLB license: description, official URL, and whether the user
 * must choose commercial use (only for All Rights Reserved).
 */
export const GLB_LICENSE_INFO: Record<
  GLBLicenseValue,
  { description: string; infoUrl: string; showCommercialChoice: boolean; impliedCommercialUse?: 'Allow' | 'Disallow' }
> = {
  CC0: {
    description: 'Public domain. Anyone may use commercially and modify; no attribution required.',
    infoUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
    showCommercialChoice: false,
    impliedCommercialUse: 'Allow',
  },
  'CC_BY_4.0': {
    description: 'Commercial use and modifications allowed; attribution required.',
    infoUrl: 'https://creativecommons.org/licenses/by/4.0/',
    showCommercialChoice: false,
    impliedCommercialUse: 'Allow',
  },
  'CC_BY_SA_4.0': {
    description: 'Commercial use and modifications allowed; attribution and share-alike required.',
    infoUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    showCommercialChoice: false,
    impliedCommercialUse: 'Allow',
  },
  'CC_BY_NC_4.0': {
    description: 'Non-commercial only; attribution required. Commercial use not permitted.',
    infoUrl: 'https://creativecommons.org/licenses/by-nc/4.0/',
    showCommercialChoice: false,
    impliedCommercialUse: 'Disallow',
  },
  'CC_BY_NC_SA_4.0': {
    description: 'Non-commercial only; attribution and share-alike. Commercial use not permitted.',
    infoUrl: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
    showCommercialChoice: false,
    impliedCommercialUse: 'Disallow',
  },
  'CC_BY_ND_4.0': {
    description: 'Commercial use allowed but no derivative works; attribution required.',
    infoUrl: 'https://creativecommons.org/licenses/by-nd/4.0/',
    showCommercialChoice: false,
    impliedCommercialUse: 'Allow',
  },
  'CC_BY_NC_ND_4.0': {
    description: 'Non-commercial only, no derivatives. Most restrictive CC license.',
    infoUrl: 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
    showCommercialChoice: false,
    impliedCommercialUse: 'Disallow',
  },
  MIT: {
    description: 'Permissive open source. Commercial use and modifications allowed with license notice.',
    infoUrl: 'https://opensource.org/licenses/MIT',
    showCommercialChoice: false,
    impliedCommercialUse: 'Allow',
  },
  'Apache_2.0': {
    description: 'Permissive open source. Commercial use and modifications allowed under Apache 2.0 terms.',
    infoUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
    showCommercialChoice: false,
    impliedCommercialUse: 'Allow',
  },
  'GPL_3.0': {
    description: 'Copyleft. Commercial use allowed; derivatives must be GPL 3.0 and source shared.',
    infoUrl: 'https://www.gnu.org/licenses/gpl-3.0.html',
    showCommercialChoice: false,
    impliedCommercialUse: 'Allow',
  },
  All_Rights_Reserved: {
    description: 'You retain all rights. Specify whether commercial use is allowed below.',
    infoUrl: '',
    showCommercialChoice: true,
  },
};

/**
 * Auto-detect file type and parse accordingly.
 * Accepts both .vrm and .glb files.
 */
export async function parse3DModel(file: File): Promise<VRMMetadata> {
  const ext = file.name.toLowerCase();
  if (ext.endsWith('.vrm')) {
    return parseVRM(file);
  }
  if (ext.endsWith('.glb')) {
    return parseGLB(file);
  }
  throw new Error(`Unsupported file type: ${file.name}. Please use .vrm or .glb files.`);
}
