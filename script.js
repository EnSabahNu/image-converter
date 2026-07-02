const fileInput = document.querySelector("#fileInput");
const uploadButton = document.querySelector("#uploadButton");
const dropzone = document.querySelector("#dropzone");
const formatSelect = document.querySelector("#formatSelect");
const qualityRange = document.querySelector("#qualityRange");
const qualityValue = document.querySelector("#qualityValue");
const convertButton = document.querySelector("#convertButton");
const previewImage = document.querySelector("#previewImage");
const previewBox = document.querySelector(".previewBox");
const statusText = document.querySelector("#statusText");
const fileName = document.querySelector("#fileName");
const fileSize = document.querySelector("#fileSize");
const imageDimensions = document.querySelector("#imageDimensions");

let selectedFile = null;
let loadedImage = null;
let previewUrl = null;

const extensions = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "application/pdf": "pdf"
};

uploadButton.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", () => {
  const [file] = fileInput.files;
  if (file) {
    loadFile(file);
  }
});

qualityRange.addEventListener("input", () => {
  qualityValue.textContent = qualityRange.value + "%";
});

dropzone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropzone.classList.add("dragover");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("dragover");
});

dropzone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropzone.classList.remove("dragover");

  const [file] = event.dataTransfer.files;
  if (file) {
    loadFile(file);
  }
});

convertButton.addEventListener("click", async () => {
  if (!selectedFile || !loadedImage) {
    return;
  }

  setStatus("Convertendo...");
  convertButton.disabled = true;

  try {
    const quality = Number(qualityRange.value) / 100;
    const blob = await convertImage(loadedImage, formatSelect.value, quality);
    downloadBlob(blob, selectedFile.name, formatSelect.value);
    setStatus("Baixado");
  } catch (error) {
    setStatus("Erro ao converter", true);
  } finally {
    convertButton.disabled = false;
  }
});

function loadFile(file) {
  if (!file.type.startsWith("image/")) {
    setStatus("Escolha uma imagem", true);
    return;
  }

  selectedFile = file;

  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
  }

  previewUrl = URL.createObjectURL(file);
  const image = new Image();

  image.onload = () => {
    loadedImage = image;
    previewImage.src = previewUrl;
    previewImage.alt = "Previa de " + file.name;
    previewBox.classList.add("hasImage");
    convertButton.disabled = false;
    fileName.textContent = file.name;
    fileSize.textContent = formatBytes(file.size);
    imageDimensions.textContent = image.naturalWidth + " x " + image.naturalHeight + "px";
    setStatus("Imagem carregada");
  };

  image.onerror = () => {
    selectedFile = null;
    loadedImage = null;
    convertButton.disabled = true;
    setStatus("Nao foi possivel abrir", true);
  };

  image.src = previewUrl;
}

function convertImage(image, mimeType, quality) {
  if (mimeType === "image/svg+xml") {
    return createSvgBlob(image);
  }

  if (mimeType === "application/pdf") {
    return createPdfBlob(image, quality);
  }

  return createRasterBlob(image, mimeType, quality);
}

function createRasterBlob(image, mimeType, quality) {
  return new Promise((resolve, reject) => {
    const canvas = createCanvasFromImage(image);

    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("Conversion failed"));
      }
    }, mimeType, quality);
  });
}

function createSvgBlob(image) {
  const canvas = createCanvasFromImage(image);
  const dataUrl = canvas.toDataURL("image/png");
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '"><image href="' + dataUrl + '" width="' + width + '" height="' + height + '"/></svg>';

  return new Blob([svg], { type: "image/svg+xml" });
}

async function createPdfBlob(image, quality) {
  const canvas = createCanvasFromImage(image);
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  const imageBytes = dataUrlToBytes(dataUrl);
  const width = image.naturalWidth;
  const height = image.naturalHeight;
  const content = "q\n" + width + " 0 0 " + height + " 0 0 cm\n/Im0 Do\nQ\n";

  return buildPdf(width, height, imageBytes, content);
}

function createCanvasFromImage(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);

  return canvas;
}

function buildPdf(width, height, imageBytes, content) {
  const encoder = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let position = 0;

  const appendText = (text) => {
    const bytes = encoder.encode(text);
    chunks.push(bytes);
    position += bytes.length;
  };

  const appendBytes = (bytes) => {
    chunks.push(bytes);
    position += bytes.length;
  };

  const addObject = (id, bodyParts) => {
    offsets[id] = position;
    appendText(id + " 0 obj\n");
    for (const part of bodyParts) {
      if (typeof part === "string") {
        appendText(part);
      } else {
        appendBytes(part);
      }
    }
    appendText("\nendobj\n");
  };

  appendText("%PDF-1.4\n");
  addObject(1, ["<< /Type /Catalog /Pages 2 0 R >>"]);
  addObject(2, ["<< /Type /Pages /Kids [3 0 R] /Count 1 >>"]);
  addObject(3, ["<< /Type /Page /Parent 2 0 R /MediaBox [0 0 " + width + " " + height + "] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>"]);
  addObject(4, ["<< /Type /XObject /Subtype /Image /Width " + width + " /Height " + height + " /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length " + imageBytes.length + " >>\nstream\n", imageBytes, "\nendstream"]);
  addObject(5, ["<< /Length " + encoder.encode(content).length + " >>\nstream\n" + content + "endstream"]);

  const xrefStart = position;
  appendText("xref\n0 6\n0000000000 65535 f \n");

  for (let id = 1; id <= 5; id += 1) {
    appendText(String(offsets[id]).padStart(10, "0") + " 00000 n \n");
  }

  appendText("trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n" + xrefStart + "\n%%EOF");

  return new Blob(chunks, { type: "application/pdf" });
}

function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(",")[1];
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function downloadBlob(blob, originalName, mimeType) {
  const link = document.createElement("a");
  const baseName = originalName.replace(/\.[^.]+$/, "");
  const extension = extensions[mimeType] || "png";
  const url = URL.createObjectURL(blob);

  link.href = url;
  link.download = baseName + "." + extension;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function formatBytes(bytes) {
  if (bytes === 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** index;

  return value.toFixed(value >= 10 || index === 0 ? 0 : 1) + " " + units[index];
}

function setStatus(message, isError = false) {
  statusText.textContent = message;
  statusText.classList.toggle("error", isError);
}
