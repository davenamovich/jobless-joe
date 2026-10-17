import ZAI from "z-ai-web-dev-sdk";
import fs from "node:fs/promises";

async function main() {
  const zai = await ZAI.create();
  const response = await zai.audio.tts.create({
    input: "Hello world. This is Joe, the crooner of unemployment.",
    voice: "jam",
    speed: 0.9,
    response_format: "wav",
    stream: false,
  });
  const buf = Buffer.from(new Uint8Array(await response.arrayBuffer()));
  console.log("Buffer length:", buf.length, "bytes");
  console.log("First 64 bytes (hex):", buf.subarray(0, 64).toString("hex"));
  console.log("First 64 bytes (ascii):", buf.subarray(0, 64).toString("ascii"));
  // Inspect RIFF header
  if (buf.subarray(0, 4).toString("ascii") === "RIFF") {
    const chunkSize = buf.readUInt32LE(4);
    const format = buf.subarray(8, 12).toString("ascii");
    const subchunk1Id = buf.subarray(12, 16).toString("ascii");
    const subchunk1Size = buf.readUInt32LE(16);
    const audioFormat = buf.readUInt16LE(20);
    const numChannels = buf.readUInt16LE(22);
    const sampleRate = buf.readUInt32LE(24);
    const byteRate = buf.readUInt32LE(28);
    const bitsPerSample = buf.readUInt16LE(34);
    const subchunk2Id = buf.subarray(36, 40).toString("ascii");
    const subchunk2Size = buf.readUInt32LE(40);
    console.log("RIFF header analysis:");
    console.log("  chunkSize:", chunkSize);
    console.log("  format:", format);
    console.log("  subchunk1Id:", subchunk1Id);
    console.log("  subchunk1Size:", subchunk1Size);
    console.log("  audioFormat:", audioFormat, "(1=PCM)");
    console.log("  numChannels:", numChannels);
    console.log("  sampleRate:", sampleRate);
    console.log("  byteRate:", byteRate);
    console.log("  bitsPerSample:", bitsPerSample);
    console.log("  subchunk2Id:", subchunk2Id);
    console.log("  subchunk2Size:", subchunk2Size);
  } else {
    console.log("Not a RIFF/WAV file!");
  }
  await fs.writeFile("/tmp/test_tts.wav", buf);
  console.log("Saved to /tmp/test_tts.wav");
}

main().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
