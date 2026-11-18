const floppySize = 1474560;
const rootStart = 19 * 512;
const dataStart = 33 * 512;
const guestPath = "A:\\CIRCUITO.CT";

function createFloppy() {
  const bytes = new Uint8Array(floppySize);
  const view = new DataView(bytes.buffer);
  const writeText = (offset, value) => bytes.set(new TextEncoder().encode(value), offset);
  bytes.set([0xeb, 0x3c, 0x90]);
  writeText(3, "MSDOS5.0");
  view.setUint16(11, 512, true);
  bytes[13] = 1;
  view.setUint16(14, 1, true);
  bytes[16] = 2;
  view.setUint16(17, 224, true);
  view.setUint16(19, 2880, true);
  bytes[21] = 0xf0;
  view.setUint16(22, 9, true);
  view.setUint16(24, 18, true);
  view.setUint16(26, 2, true);
  bytes[38] = 0x29;
  view.setUint32(39, 0x4653494d, true);
  writeText(43, "FLUIDSIM   ");
  writeText(54, "FAT12   ");
  bytes.set([0x55, 0xaa], 510);
  bytes.set([0xf0, 0xff, 0xff], 512);
  bytes.set([0xf0, 0xff, 0xff], 10 * 512);
  return bytes.buffer;
}

function readCircuit(buffer) {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(bytes.buffer);
  const decoder = new TextDecoder();
  for (let entry = rootStart; entry < dataStart; entry += 32) {
    if (!bytes[entry]) break;
    if (bytes[entry] === 0xe5 || (bytes[entry + 11] & 0x18)) continue;
    if (decoder.decode(bytes.subarray(entry, entry + 11)) !== "CIRCUITOCT ") continue;
    const size = view.getUint32(entry + 28, true);
    if (!size || size > floppySize - dataStart) throw Error("Tamanho de arquivo inválido.");
    const result = new Uint8Array(size);
    const visited = new Set();
    let cluster = view.getUint16(entry + 26, true);
    for (let offset = 0; offset < size; offset += 512) {
      const start = dataStart + (cluster - 2) * 512;
      if (cluster < 2 || start + 512 > bytes.length || visited.has(cluster)) {
        throw Error("O arquivo no disquete está incompleto.");
      }
      visited.add(cluster);
      result.set(bytes.subarray(start, start + Math.min(512, size - offset)), offset);
      const next = view.getUint16(512 + Math.floor(cluster * 1.5), true);
      cluster = cluster % 2 ? next >> 4 : next & 0xfff;
    }
    return result;
  }
}

function download(bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "circuito.ct";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function addCircuitExport(emulator) {
  const controls = document.querySelector("#preview-controls");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "view-button";
  button.textContent = "Baixar circuito .ct";
  const instructions = document.createElement("div");
  instructions.setAttribute("role", "status");
  instructions.hidden = true;
  instructions.style.cssText = "max-width:320px;padding:8px";
  controls.append(button, instructions);
  let mounted = false;
  button.addEventListener("click", async () => {
    button.disabled = true;
    instructions.hidden = false;
    try {
      if (!mounted) {
        await emulator.set_fda({ buffer: createFloppy() });
        mounted = true;
      } else {
        const circuit = readCircuit(emulator.get_disk_fda());
        if (circuit) {
          download(circuit);
          instructions.textContent = "Download iniciado. Para exportar outra versão, salve novamente no mesmo caminho.";
          return;
        }
      }
      instructions.textContent = "No FluidSIM, use Arquivo → Salvar como e digite " + guestPath +
        " no nome do arquivo. Depois volte ao botão Baixar circuito .ct.";
    } catch (error) {
      instructions.textContent = "Falha ao exportar o circuito. " + error.message;
    } finally {
      button.disabled = false;
    }
  });
}
