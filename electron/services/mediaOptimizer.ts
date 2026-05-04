import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export interface OptimizationResult {
  optimized: boolean;
  wasTranscoded: boolean;
  originalPath: string;
  optimizedPath?: string;
  duration: number;
  width: number;
  height: number;
  reason?: string;
}

const OPTIMIZATION_DEFAULTS = {
  maxWidth: 1280,
  maxHeight: 720,
  maxDuration: 8,
  targetBitrate: '2M',
  maxBitrate: '3M',
  crf: 23,
  timeout: 30000,
};

let ffmpegAvailable: boolean | null = null;

async function checkFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    await exec('ffmpeg', ['-version'], { timeout: 5000 });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
    console.log('[MediaOptimizer] FFmpeg not found - skipping video optimization');
  }
  return ffmpegAvailable;
}

export async function optimizeMedia(
  sourcePath: string,
  options?: Partial<typeof OPTIMIZATION_DEFAULTS>,
): Promise<OptimizationResult> {
  const opts = { ...OPTIMIZATION_DEFAULTS, ...options };
  const ext = path.extname(sourcePath).toLowerCase();

  const result: OptimizationResult = {
    optimized: true,
    wasTranscoded: false,
    originalPath: sourcePath,
    duration: 0,
    width: 0,
    height: 0,
  };

  // For non-video files, just probe and return
  if (!['.mp4', '.webm', '.gif'].includes(ext)) {
    result.optimized = false;
    result.reason = 'unsupported format';
    return result;
  }

  const hasFfmpeg = await checkFfmpeg();
  if (!hasFfmpeg) {
    result.optimized = false;
    result.reason = 'ffmpeg not available';
    return result;
  }

  try {
    // Probe source file
    const probe = await exec('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,duration',
      '-of', 'csv=p=0',
      sourcePath,
    ], { timeout: opts.timeout });

    const [widthStr, heightStr, durationStr] = (probe.stdout || '').trim().split(',');
    const srcWidth = parseInt(widthStr, 10) || 0;
    const srcHeight = parseInt(heightStr, 10) || 0;
    const srcDuration = parseFloat(durationStr) || 0;

    result.duration = srcDuration;
    result.width = srcWidth;
    result.height = srcHeight;

    // Skip optimization if source is already within limits
    const needsResize = srcWidth > opts.maxWidth || srcHeight > opts.maxHeight;
    const needsDurationTrim = srcDuration > opts.maxDuration;
    const needsGifConvert = ext === '.gif';

    if (!needsResize && !needsDurationTrim && !needsGifConvert) {
      result.wasTranscoded = false;
      result.reason = 'within limits';
      return result;
    }

    // Generate optimized output path
    const dir = path.dirname(sourcePath);
    const baseName = path.basename(sourcePath, ext);
    const outExt = ext === '.gif' ? '.mp4' : '.mp4';
    const optimizedPath = path.join(dir, `${baseName}_opt${outExt}`);

    // Build FFmpeg args
    const args: string[] = ['-y', '-i', sourcePath];

    // Duration trim
    if (needsDurationTrim) {
      args.push('-t', String(opts.maxDuration));
    }

    // Scale filter if needed
    const filters: string[] = [];
    if (needsResize) {
      filters.push(`scale='min(${opts.maxWidth},iw)':'min(${opts.maxHeight},ih)':force_original_aspect_ratio=decrease`);
    }
    // Force even dimensions
    filters.push('pad=ceil(iw/2)*2:ceil(ih/2)*2');
    args.push('-vf', filters.join(','));

    // Encoding settings for H.264
    args.push('-c:v', 'libx264');
    args.push('-preset', 'fast');
    args.push('-crf', String(opts.crf));
    args.push('-b:v', opts.targetBitrate);
    args.push('-maxrate', opts.maxBitrate);
    args.push('-bufsize', '4M');
    args.push('-pix_fmt', 'yuv420p');
    args.push('-movflags', '+faststart');
    args.push('-an'); // Strip audio for gift media

    args.push(optimizedPath);

    console.log(`[MediaOptimizer] Transcoding: ${path.basename(sourcePath)} -> ${path.basename(optimizedPath)}`);
    await exec('ffmpeg', args, { timeout: opts.timeout * 2 });

    result.wasTranscoded = true;
    result.optimizedPath = optimizedPath;
    return result;
  } catch (e: any) {
    console.error('[MediaOptimizer] Optimization failed:', e?.message || e);
    result.optimized = false;
    result.wasTranscoded = false;
    result.reason = e?.message || 'optimization failed';
    return result;
  }
}

export function getOptimizedMediaPath(originalPath: string): string | undefined {
  const ext = path.extname(originalPath).toLowerCase();
  const dir = path.dirname(originalPath);
  const baseName = path.basename(originalPath, ext);
  const optPath = path.join(dir, `${baseName}_opt.mp4`);
  return fs.existsSync(optPath) ? optPath : undefined;
}
