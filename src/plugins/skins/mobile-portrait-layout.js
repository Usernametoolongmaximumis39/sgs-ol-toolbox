const seatTemplate = { width: 138, height: 253, overhang: 32 };
const prepared = new WeakMap();
const noSeatOverhang = { top: 0, hasArtworkAbove: false };

// The official seat PNGs include about 32 px of headdress above the card body.
// Keep the pixels and identify the row that belongs at the top of the OL card.
export function mobileSeatLayout(document, image, nativePortrait) {
  if (!nativePortrait) return noSeatOverhang;
  const { naturalWidth: width, naturalHeight: height } = image;
  if (!width || !height || width * seatTemplate.height !== height * seatTemplate.width) return noSeatOverhang;
  if (prepared.has(image)) return prepared.get(image);

  const scale = height / seatTemplate.height;
  const first = seatTemplate.overhang - 2, sampleRows = seatTemplate.overhang + 3;
  const canvas = document.createElement('canvas');
  canvas.width = seatTemplate.width;
  canvas.height = sampleRows;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return noSeatOverhang;
  context.drawImage(image, 0, 0, width, sampleRows * scale, 0, 0, canvas.width, canvas.height);
  let pixels;
  try { pixels = context.getImageData(0, 0, canvas.width, canvas.height).data; }
  catch { return noSeatOverhang; }
  const coverage = new Uint16Array(sampleRows);
  let bestRow = 0, bestDifference = canvas.width * .16;
  for (let y = 0; y < sampleRows; y++) {
    for (let x = 0; x < canvas.width; x++) {
      if (pixels[(y * canvas.width + x) * 4 + 3] >= 128) coverage[y]++;
    }
    const difference = coverage[y] - coverage[y - 1];
    if (y > first && coverage[y] >= canvas.width * .85 && difference > bestDifference) {
      bestRow = y;
      bestDifference = difference;
    }
  }
  // A full-bleed illustration can have the same aspect ratio. Verify the
  // authored boundary rather than removing the top from every tall image.
  const layout = bestRow ? {
    top: Math.round(bestRow * scale),
    hasArtworkAbove: coverage.subarray(0, bestRow - 2).some(pixels => pixels >= 2),
  } : noSeatOverhang;
  prepared.set(image, layout);
  return layout;
}
