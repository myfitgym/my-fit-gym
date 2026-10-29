import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from './firebase.js';

export async function subirImagenProducto(file, ruta) {
  if (!(file instanceof File) || !file.type.startsWith('image/')) {
    throw new Error('Selecciona un archivo de imagen válido.');
  }

  const imageRef = ref(storage, `${ruta}/${Date.now()}-${crypto.randomUUID()}`);
  const snapshot = await uploadBytes(imageRef, file, { contentType: file.type });
  return getDownloadURL(snapshot.ref);
}

export function escaparHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

export function miniaturaImagenHTML(url, className = '') {
  const safeUrl = typeof url === 'string' && /^(https:\/\/|data:image\/|blob:)/i.test(url)
    ? escaparHtml(url)
    : '';
  return safeUrl
    ? `<img src="${safeUrl}" alt="" class="${className} object-cover">`
    : `<span class="material-symbols-outlined ${className} flex items-center justify-center bg-zinc-100 text-zinc-400">image</span>`;
}
