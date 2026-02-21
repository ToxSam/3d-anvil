import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import path from 'path';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
const MAX_JSON_SIZE = 1 * 1024 * 1024; // 1 MB
const ALLOWED_EXTENSIONS = new Set(['.glb', '.vrm', '.png', '.jpg', '.jpeg', '.gif', '.webp']);

/**
 * Local file upload API — only active when NEXT_PUBLIC_USE_LOCAL_STORAGE=true.
 * Saves files to public/uploads/ so they're served by Next.js dev server.
 *
 * POST /api/upload
 * - FormData with "file" field → saves file, returns URL
 * - JSON body with "metadata" field → saves JSON, returns URL
 */
export async function POST(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_USE_LOCAL_STORAGE !== 'true') {
    return NextResponse.json(
      { error: 'Local uploads are disabled in this environment' },
      { status: 404 }
    );
  }

  try {
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const rawLength = Number(request.headers.get('content-length') || 0);
      if (rawLength > MAX_JSON_SIZE) {
        return NextResponse.json(
          { error: `Metadata too large (max ${MAX_JSON_SIZE / 1024}KB)` },
          { status: 413 }
        );
      }

      const body = await request.json();
      const metadata = body.metadata;

      if (!metadata) {
        return NextResponse.json(
          { error: 'Missing metadata field' },
          { status: 400 }
        );
      }

      const serialized = JSON.stringify(metadata, null, 2);
      if (Buffer.byteLength(serialized) > MAX_JSON_SIZE) {
        return NextResponse.json(
          { error: `Metadata too large (max ${MAX_JSON_SIZE / 1024}KB)` },
          { status: 413 }
        );
      }

      const timestamp = Date.now();
      const fileName = `${timestamp}.json`;
      const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'metadata');

      await mkdir(uploadDir, { recursive: true });

      const filePath = path.join(uploadDir, fileName);
      await writeFile(filePath, serialized);

      const url = `/uploads/metadata/${fileName}`;
      return NextResponse.json({ url });
    }

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file') as File;

      if (!file) {
        return NextResponse.json(
          { error: 'Missing file field' },
          { status: 400 }
        );
      }

      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)` },
          { status: 413 }
        );
      }

      const ext = path.extname(file.name).toLowerCase();
      if (!ALLOWED_EXTENSIONS.has(ext)) {
        return NextResponse.json(
          { error: `File type "${ext}" not allowed. Accepted: ${[...ALLOWED_EXTENSIONS].join(', ')}` },
          { status: 415 }
        );
      }

      const timestamp = Date.now();
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
      const fileName = `${timestamp}-${safeName}`;
      const uploadDir = path.join(process.cwd(), 'public', 'uploads');

      await mkdir(uploadDir, { recursive: true });

      const filePath = path.join(uploadDir, fileName);
      const buffer = Buffer.from(await file.arrayBuffer());
      await writeFile(filePath, buffer);

      const url = `/uploads/${fileName}`;
      return NextResponse.json({ url, fileName, size: file.size });
    }

    return NextResponse.json(
      { error: 'Unsupported content type' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Upload failed: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
