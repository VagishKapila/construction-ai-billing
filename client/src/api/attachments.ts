/**
 * Attachments API — Upload, list, and delete pay app attachments
 * Supports PDF, JPG, PNG, DOCX, and other document types
 */

import type { ApiResponse, Attachment } from '@/types';
import { api } from './client';

/**
 * Upload an attachment to a pay app
 * Images over 500KB are compressed client-side before upload
 */
export async function uploadAttachment(
  payAppId: number,
  file: File,
): Promise<ApiResponse<Attachment>> {
  // Compress images client-side if over 500KB (matching old app.html behavior)
  const processedFile = await compressImageFile(file);

  const formData = new FormData();
  formData.append('file', processedFile);

  return api.upload<Attachment>(`/api/payapps/${payAppId}/attachments`, formData);
}

/**
 * Delete an attachment
 */
export async function deleteAttachment(
  attachmentId: number,
): Promise<ApiResponse<void>> {
  return api.del<void>(`/api/attachments/${attachmentId}`);
}

/**
 * Client-side image compression (matching old app.html compressImageFile)
 * Compresses images > 500KB to max 1200px width at 85% quality
 */
async function compressImageFile(file: File): Promise<File> {
  // Only compress images over 500KB
  if (!file.type.startsWith('image/') || file.size <= 500 * 1024) {
    return file;
  }

  try {
    return await new Promise<File>((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxW = 1200;
        let w = img.width;
        let h = img.height;

        if (w > maxW) {
          h = Math.round((h * maxW) / w);
          w = maxW;
        }

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }
            resolve(new File([blob], file.name, { type: 'image/jpeg' }));
          },
          'image/jpeg',
          0.85,
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(file);
      };

      img.src = url;
    });
  } catch {
    return file;
  }
}
