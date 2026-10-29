const MAX_IMAGE_DATA_URL_LENGTH = 180 * 1024;
const MAX_PRODUCT_IMAGES_LENGTH = 700 * 1024;
const MAX_IMAGE_DIMENSION = 1280;

function leerBlobComoDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo procesar la fotografía seleccionada.'));
    reader.readAsDataURL(blob);
  });
}

function convertirCanvasABlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo comprimir la fotografía en este navegador.'));
    }, 'image/jpeg', quality);
  });
}

export async function comprimirImagenProducto(file) {
  if (!(file instanceof File) || !file.type.startsWith('image/')) {
    throw new Error('Selecciona un archivo de imagen válido.');
  }

  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    image.src = objectUrl;
    await image.decode();
  } catch {
    throw new Error('No se pudo abrir la fotografía. Selecciona una imagen JPG, PNG o WebP.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
  let width = Math.max(1, Math.round(image.naturalWidth * scale));
  let height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Este navegador no permite procesar la fotografía.');

  for (let resize = 0; resize < 7; resize += 1) {
    canvas.width = width;
    canvas.height = height;
    context.drawImage(image, 0, 0, width, height);

    for (const quality of [0.82, 0.72, 0.62, 0.52, 0.42]) {
      const blob = await convertirCanvasABlob(canvas, quality);
      const dataUrlLength = `data:image/jpeg;base64,`.length + 4 * Math.ceil(blob.size / 3);
      if (dataUrlLength <= MAX_IMAGE_DATA_URL_LENGTH) {
        return await leerBlobComoDataUrl(blob);
      }
    }

    if (width <= 320 && height <= 320) break;
    width = Math.max(320, Math.round(width * 0.8));
    height = Math.max(320, Math.round(height * 0.8));
  }

  const error = new Error('La fotografía no se pudo comprimir lo suficiente. Usa una imagen más pequeña.');
  error.code = 'image/too-large';
  throw error;
}

export function validarTamanoFotosProducto(producto) {
  const fotos = [
    producto?.imagenUrl,
    ...(Array.isArray(producto?.variantes) ? producto.variantes.map((variante) => variante?.imagenUrl) : [])
  ];
  const tamanoTotal = fotos.reduce((total, foto) => (
    typeof foto === 'string' && foto.startsWith('data:image/') ? total + foto.length : total
  ), 0);

  if (tamanoTotal > MAX_PRODUCT_IMAGES_LENGTH) {
    const error = new Error('Las fotos comprimidas de este producto superan el límite de Firestore. Reduce la cantidad de variantes o usa imágenes más pequeñas.');
    error.code = 'image/product-too-large';
    throw error;
  }
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
