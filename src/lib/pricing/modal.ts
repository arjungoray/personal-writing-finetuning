export type ModalGpuRate = {
  gpu: "Nvidia L4" | "Nvidia A100 40 GB" | "Nvidia A100 80 GB";
  dollarsPerSecond: number;
  dollarsPerHour: number;
};

export const MODAL_PRICING = {
  sourceUrl: "https://modal.com/pricing",
  lastVerified: "2026-05-19",
  notes: [
    "Starter includes $30/month free compute.",
    "Region selection can be 1.5-1.75x base prices.",
    "Non-preemptible execution can be 3x base prices.",
  ],
  gpuRates: [
    { gpu: "Nvidia L4", dollarsPerSecond: 0.000222, dollarsPerHour: 0.7992 },
    { gpu: "Nvidia A100 40 GB", dollarsPerSecond: 0.000583, dollarsPerHour: 2.0988 },
    { gpu: "Nvidia A100 80 GB", dollarsPerSecond: 0.000694, dollarsPerHour: 2.4984 },
  ] satisfies ModalGpuRate[],
};
