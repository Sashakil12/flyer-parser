declare module '@/lib/storage-admin' {
  export function getImageDataUrl(storagePath: string): Promise<string>;
}
