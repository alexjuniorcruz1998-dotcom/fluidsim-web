const root = "./";
const boot = document.querySelector("#boot");
const status = document.querySelector("#status");
const files = document.querySelector("#files");

// Configure os três URLs para iniciar automaticamente ao publicar.
const deployment = window.fluidSimLocalConfig ?? null;

function start({ disk, cd, snapshot }) {
  files.hidden = true;
  status.textContent = "Abrindo o FluidSIM…";
  const emulator = new V86({
    memory_size: 512 * 1024 * 1024,
    vga_memory_size: 8 * 1024 * 1024,
    wasm_path: root + "v86.wasm",
    bios: { url: root + "seabios.bin" },
    vga_bios: { url: root + "vgabios.bin" },
    screen: { container: document.querySelector("#screen"), use_graphical_text: false },
    hda: disk,
    cdrom: cd,
    initial_state: snapshot,
    autostart: true,
  });
  emulator.add_listener("emulator-started", () => {
    document.querySelector("#screen").hidden = false;
    boot.hidden = true;
  });
  emulator.add_listener("download-error", () => {
    status.textContent = "Falha ao carregar os arquivos do FluidSIM.";
  });
}

async function loadParts(paths) {
  const parts = [];
  for (const path of paths) {
    const response = await fetch(path);
    if (!response.ok) throw new Error("HTTP " + response.status + " em " + path);
    parts.push(await response.blob());
  }
  return new Blob(parts);
}

async function loadDiskOverlay() {
  const response = await fetch("./disk-overlay.bin");
  if (!response.ok) throw new Error("Falha ao carregar as alterações do disco");
  const data = await response.arrayBuffer();
  const offsets = new DataView(data);
  const blocksByChunk = new Map();
  const chunkSize = 262144;
  for (let position = 0; position < data.byteLength; position += 260) {
    const offset = offsets.getUint32(position, true);
    const start = Math.floor(offset / chunkSize) * chunkSize;
    if (!blocksByChunk.has(start)) blocksByChunk.set(start, []);
    blocksByChunk.get(start).push({ offset: offset - start, bytes: new Uint8Array(data, position + 4, 256) });
  }
  return (start, data) => {
    for (const block of blocksByChunk.get(start) ?? []) data.set(block.bytes, block.offset);
  };
}

async function launch(images) {
  try {
    if (images.snapshotParts) {
      const cd = await loadParts(images.cdParts);
      const snapshot = await loadParts(images.snapshotParts);
      const disk = { ...images.disk, patchChunk: await loadDiskOverlay() };
      start({ disk, cd: { buffer: await cd.arrayBuffer() }, snapshot: { buffer: await snapshot.arrayBuffer() } });
    } else {
      start(images);
    }
  } catch (error) {
    status.textContent = "Falha ao iniciar o FluidSIM.";
    console.error(error);
  }
}

if (deployment) {
  launch(deployment);
} else {
  status.textContent = "Selecione os arquivos da sua máquina para abrir o FluidSIM.";
  files.hidden = false;
  files.addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(files);
    launch({
      disk: { buffer: data.get("disk"), async: true },
      cd: { buffer: data.get("cd"), async: true },
      snapshot: { buffer: data.get("snapshot") },
    });
  });
}




