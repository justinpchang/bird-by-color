const Jimp = require("jimp");

async function onRuntimeInitialized() {
  // Get image
  const jimpSrc = await Jimp.read("./bird.jpg");
  let src = cv.matFromImageData(jimpSrc.bitmap);

  // Get subject dimensions
  const crop = findSubject({ mat: src, width: 100, height: 100});
  console.log(crop);
  
  // Get foreground
  cv.cvtColor(src, src, cv.COLOR_RGBA2RGB, 0);
  let mask = new cv.Mat();
  let bgdModel = new cv.Mat();
  let fgdModel = new cv.Mat();
  let rect = new cv.Rect(50, 50, 300, 300);
  cv.grabCut(src, mask, rect, bgdModel, fgdModel, 1, cv.GC_INIT_WITH_RECT);

  // Remove background
  for (let i = 0; i < src.rows; i++) {
    for (let j = 0; j < src.cols; j++) {
      if (mask.ucharPtr(i, j)[0] == 0 || mask.ucharPtr(i, j)[0] == 2) {
        src.ucharPtr(i, j)[0] = 0;
        src.ucharPtr(i, j)[1] = 0;
        src.ucharPtr(i, j)[2] = 0;
      }
    }
  }

  // Draw crop
  let color = new cv.Scalar(255, 0, 0);
  let point1 = new cv.Point(crop.x, crop.y);
  let point2 = new cv.Point(crop.x + crop.width, crop.y + crop.height);
  cv.rectangle(src, point1, point2, color);

  // Write to file
  new Jimp({
    width: src.cols,
    height: src.rows,
    data: Buffer.from(src.data),
  }).write("output.png");

  // Clean up
  src.delete();
  mask.delete();
  bgdModel.delete();
  fgdModel.delete();
}
// Finally, load the open.js as before. The function `onRuntimeInitialized` contains our program.
Module = {
  onRuntimeInitialized,
};
cv = require("./opencv.js");

// Find dimensions surround the subject in the photo
// options: mat, width, height
function findSubject(options) {
  const { mat, width, height } = options;
  // [... r, g, b, a ...]
  const input = new ImgData(mat.size().width, mat.size().height, mat.data);
  // [... skin, detail, saturation, boost? ...]
  const output = new ImgData(mat.size().width, mat.size().height);

  const { cropWidth, cropHeight} = getCropDimensions(input, width, height);
  skinDetect(input, output);
  edgeDetect(input, output);
  saturationDetect(input, output);

  const scoreOutput = downSample(output, 8);
  const crops = generateCrops(cropWidth, cropHeight, input.width, input.height);
  let topScore = -Infinity;
  let topCrop = null;

  // Score crop windows
  for (let i = 0; i < crops.length; i++) {
    const crop = crops[i];
    crop.score = score(scoreOutput, crop);

    if (crop.score.total > topScore) {
      topCrop = crop;
      topScore = crop.score.total;
    }
  }

  return topCrop;
}

// Object representing image dimensions and buffer
function ImgData(width, height, data) {
  this.width = width;
  this.height = height;
  if (data) {
    this.data = new Uint8ClampedArray(data);
  } else {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

// input ImgData, target crop width, target crop height
// returns scaled crop dimensions
function getCropDimensions(input, width, height) {
  // Calculate crop dimensions
  const scale = Math.min(
    input.width / width,
    input.height / height,
  );
  return {
    cropWidth: ~~(width * scale),
    cropHeight: ~~(height * scale),
  };
}

// Find regions of skin color (NEED TO MODIFY)
// input ImgData, output ImgData
// mutates output
function skinDetect(input, output) {
  const id = input.data;
  const od = output.data;
  const w = input.width;
  const h = input.height;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const lightness = cie(id[p], id[p + 1], id[p + 2]) / 255;
      const skin = skinColor(id[p], id[p + 1], id[p + 2]);

      const isSkinColor = skin > 0.8;
      const isSkinLightness =
        lightness >= 0.2 &&
        lightness <= 1.0;
      
      if (isSkinColor && isSkinLightness) {
        od[p] =
          (skin - 0.8) *
          (255 / (1 - 0.8));
      } else {
        od[p] = 0;
      }
    }
  }
}

// Find edges using laplace
// input ImgData, output ImgData
// mutates output
function edgeDetect(input, output) {
  const id = input.data;
  const od = output.data;
  const w = input.width;
  const h = input.height;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      let lightness;

      if (x === 0 || x >= w - 1 || y === 0 || y >= h) {
        lightness = sample(id, p);
      } else {
        lightness =
          sample(id, p) * 4 -
          sample(id, p - w * 4) -
          sample(id, p - 4) -
          sample(id, p + 4) -
          sample(id, p + w * 4);
      }

      od[p + 1] = lightness;
    }
  }
}

// Find areas with high saturation
// input ImgData, output ImgData
// mutates output
function saturationDetect(input, output) {
  const id = input.data;
  const od = output.data;
  const w = input.width;
  const h = input.height;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = (y * w + x) * 4;
      const lightness = cie(id[p], id[p + 1], id[p + 2]) / 255;
      const sat = saturation(id[p], id[p + 1], id[p + 2]);
      
      const isAcceptableSaturation = sat > 0.4;
      const isAcceptableLightness =
        lightness >= 0.05 &&
        lightness <= 0.9;

      if (isAcceptableSaturation && isAcceptableLightness) {
        od[p + 2] =
          (sat - 0.4) *
          (255 / (1 - 0.4));
      } else {
        od[p + 2] = 0;
      }
    }
  }
}

function downSample(input, factor) {
  const idata = input.data;
  const iwidth = input.width;
  const iheight = input.height;
  const width = Math.floor(iwidth / factor);
  const height = Math.floor(iheight / factor);
  const output = new ImgData(width, height);
  const data = output.data;
  const ifactor2 = 1 / (factor * factor);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      let skin = 0;
      let detail = 0;
      let saturation = 0;
      let mskin = 0;
      let mdetail = 0;
      let msaturation = 0;

      for (let v = 0; v < factor; v++) {
        for (let u = 0; u < factor; u++) {
          const q = ((y * factor + v) * iwidth + (x * factor + u)) * 4;
          skin += idata[q];
          detail += idata[q + 1];
          saturation += idata[q + 2];
          mskin = Math.max(mdetail, idata[q]);
          mdetail = Math.max(mdetail, idata[q + 1]);
          msaturation = Math.max(msaturation, idata[q + 2]);
        }
      }

      data[p] = skin * ifactor2 * 0.5 + mskin * 0.5;
      data[p + 1] = detail * ifactor2 * 0.7 + mdetail * 0.3;
      data[p + 2] = saturation * ifactor2 * 0.8 + msaturation * 0.2;
    }
  }

  return output;
}

// Generates sliding windows of crops
function generateCrops(cropWidth, cropHeight, width, height) {
  const results = [];
  for (let scale = 1.0; scale >= 1.0; scale -= 0.1) {
    for (let y = 0; y + cropHeight * scale <= height; y += 8) {
      for (let x = 0; x + cropWidth * scale <= width; x += 8) {
        results.push({
          x: x,
          y: y,
          width: cropWidth * scale,
          height: cropHeight * scale,
        });
      }
    }
  }
  return results;
}

// Scores output on a crop
function score(output, crop) {
  const result = {
    skin: 0,
    detail: 0,
    saturation: 0,
    total: 0,
  };

  const od = output.data;
  const downSample = 8;
  const invDownSample = 1 / downSample;
  const outputWidthDownSample = output.width * downSample;
  const outputHeightDownSample = output.height * downSample;
  const outputWidth = output.width;

  for (let y = 0; y < outputHeightDownSample; y += downSample) {
    for (let x = 0; x < outputWidthDownSample; x += downSample) {
      const p = (~~(y * invDownSample) * outputWidth + ~~(x * invDownSample)) * 4;
      const i = importance(crop, x, y);
      const detail = od[p + 1] / 255;

      result.skin += (od[p] / 255) * (detail + 0.01) * i;
      result.detail += detail * i;
      result.saturation += (od[p + 2] / 255) * (detail + 0.2) * i;
    }
  }

  result.total =
    (result.detail * 0.2 +
      result.skin * 1.8 +
      result.saturation * 0.1) /
    (crop.width * crop.height);

  return result;
}
      
function importance(crop, x, y) {
  if (
    crop.x > x ||
    x >= crop.x + crop.width ||
    crop.y > y ||
    y >= crop.y + crop.height
  ) {
    return -0.5;
  }

  x = (x - crop.x) / crop.width;
  y = (y - crop.y) / crop.height;
  const px = Math.abs(0.5 - x) * 2;
  const py = Math.abs(0.5 - y) * 2;
  const dx = Math.max(px - 1.0 + 0.4, 0);
  const dy = Math.max(py - 1.0 + 0.4, 0);
  const d = (dx * dx + dy * dy) * -20.0;
  const s = 1.41 - Math.sqrt(px * px + py * py);

  return d + s;
}


/**
 * HELPERS
 */

function cie(r, g, b) {
  return 0.5126 * b + 0.7152 * g + 0.0722 * r;
}

function sample(id, p) {
  return cie(id[p], id[p + 1], id[p + 2]);
}

function skinColor(r, g, b) {
  const mag = Math.sqrt(r * r + g * g + b * b);
  const rd = r / mag - 0.78;
  const gd = g / mag - 0.57;
  const bd = b / mag - 0.44;
  const d = Math.sqrt(rd * rd + gd * gd + bd * bd);
  return 1 - d;
}

function saturation(r, g, b) {
  const max = Math.max(r / 255, g / 255, b / 255);
  const min = Math.min(r / 255, g / 255, b / 255);

  if (max === min) {
    return 0;
  }

  const l = (max + min) / 2;
  const d = max - min;

  return l > 0.5 ? d / (2 - max - min) : d / (max + min);
}