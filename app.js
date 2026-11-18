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

async function launch(images) {
  try {
    if (images.snapshotParts) {
      const cd = await loadParts(images.cdParts);
      const snapshot = await loadParts(images.snapshotParts);
      start({ disk: images.disk, cd: { buffer: await cd.arrayBuffer() }, snapshot: { buffer: await snapshot.arrayBuffer() } });
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




