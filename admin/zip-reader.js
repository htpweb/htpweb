(() => {
  "use strict";

  function fail(message) {
    throw new Error("HTPWEB ZIP: " + message);
  }

  function u16(view, offset) {
    return view.getUint16(offset, true);
  }

  function u32(view, offset) {
    return view.getUint32(offset, true);
  }

  function decodeName(bytes) {
    try {
      return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    } catch {
      let text = "";
      for (const byte of bytes) text += String.fromCharCode(byte);
      return text;
    }
  }

  async function inflateRaw(bytes) {
    if (typeof DecompressionStream === "undefined") {
      fail("este navegador no soporta descompresión ZIP local. Actualiza Chrome/Edge.");
    }

    let stream;
    try {
      stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    } catch (error) {
      fail("no se pudo iniciar la descompresión Deflate: " + (error?.message || error));
    }

    const response = new Response(stream);
    return new Uint8Array(await response.arrayBuffer());
  }

  function makeEntry(buffer, meta) {
    let cache = null;

    async function bytes() {
      if (cache) return cache;

      cache = (async () => {
        if (meta.dir) return new Uint8Array(0);
        if (meta.flags & 0x0001) fail("el ZIP contiene archivos cifrados y no se admite.");

        const view = new DataView(buffer);
        const offset = meta.localOffset;
        if (u32(view, offset) !== 0x04034b50) {
          fail("cabecera local inválida para " + meta.name + ".");
        }

        const localNameLen = u16(view, offset + 26);
        const localExtraLen = u16(view, offset + 28);
        const dataStart = offset + 30 + localNameLen + localExtraLen;
        const dataEnd = dataStart + meta.compressedSize;

        if (dataEnd > buffer.byteLength) {
          fail("datos incompletos para " + meta.name + ".");
        }

        const compressed = new Uint8Array(buffer, dataStart, meta.compressedSize);

        if (meta.method === 0) {
          return new Uint8Array(compressed);
        }
        if (meta.method === 8) {
          const out = await inflateRaw(compressed);
          if (meta.uncompressedSize && out.byteLength !== meta.uncompressedSize) {
            fail("tamaño descomprimido inesperado para " + meta.name + ".");
          }
          return out;
        }

        fail("método de compresión no compatible (" + meta.method + ") en " + meta.name + ".");
      })();

      return cache;
    }

    return {
      name: meta.name,
      dir: meta.dir,
      async: async type => {
        const data = await bytes();

        if (type === "uint8array") return data;
        if (type === "arraybuffer") {
          return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
        }
        if (type === "blob") return new Blob([data]);
        if (type === "string" || type === "text") {
          return new TextDecoder("utf-8", { fatal: false }).decode(data);
        }

        fail("tipo de lectura no compatible: " + type + ".");
      }
    };
  }

  function findEocd(view) {
    const min = Math.max(0, view.byteLength - 22 - 65535);
    for (let offset = view.byteLength - 22; offset >= min; offset--) {
      if (u32(view, offset) === 0x06054b50) return offset;
    }
    return -1;
  }

  async function loadAsync(input) {
    const buffer = input instanceof ArrayBuffer
      ? input
      : ArrayBuffer.isView(input)
        ? input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength)
        : await input.arrayBuffer();

    const view = new DataView(buffer);
    const eocd = findEocd(view);
    if (eocd < 0) fail("no se encontró el directorio central. El archivo puede estar dañado.");

    const diskNumber = u16(view, eocd + 4);
    const centralDisk = u16(view, eocd + 6);
    const entriesOnDisk = u16(view, eocd + 8);
    const totalEntries = u16(view, eocd + 10);
    const centralSize = u32(view, eocd + 12);
    const centralOffset = u32(view, eocd + 16);

    if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== totalEntries) {
      fail("ZIP multidisco no compatible.");
    }
    if (totalEntries === 0xffff || centralOffset === 0xffffffff || centralSize === 0xffffffff) {
      fail("ZIP64 no compatible en esta carga.");
    }
    if (centralOffset + centralSize > buffer.byteLength) {
      fail("directorio central fuera de rango.");
    }

    const files = {};
    let offset = centralOffset;

    for (let index = 0; index < totalEntries; index++) {
      if (offset + 46 > buffer.byteLength || u32(view, offset) !== 0x02014b50) {
        fail("entrada del directorio central inválida.");
      }

      const flags = u16(view, offset + 8);
      const method = u16(view, offset + 10);
      const compressedSize = u32(view, offset + 20);
      const uncompressedSize = u32(view, offset + 24);
      const nameLen = u16(view, offset + 28);
      const extraLen = u16(view, offset + 30);
      const commentLen = u16(view, offset + 32);
      const localOffset = u32(view, offset + 42);

      const nameStart = offset + 46;
      const nameEnd = nameStart + nameLen;
      if (nameEnd > buffer.byteLength) fail("nombre de archivo ZIP incompleto.");

      const name = decodeName(new Uint8Array(buffer, nameStart, nameLen));
      const dir = name.endsWith("/");

      const entry = makeEntry(buffer, {
        name,
        dir,
        flags,
        method,
        compressedSize,
        uncompressedSize,
        localOffset
      });

      files[name] = entry;
      offset = nameEnd + extraLen + commentLen;
    }

    return {
      files,
      file(name) {
        return files[String(name || "")] || null;
      }
    };
  }

  window.HTPWEBZip = { loadAsync };
})();