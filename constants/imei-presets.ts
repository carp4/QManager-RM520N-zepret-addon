// =============================================================================
// imei-presets.ts — IMEI TAC (Type Allocation Code) Presets
// =============================================================================
// Device presets for the IMEI Generator. Each entry provides an 8-digit TAC
// that seeds the generator. The "Custom" option allows free-form entry.
//
// To add a new device preset: append an entry to IMEI_TAC_PRESETS below.
// =============================================================================

export interface ImeiTacPreset {
  /** Unique key for this preset (used as Select value) */
  id: string;
  /** Display name in the dropdown */
  label: string;
  /** Exactly 8 digits — the Type Allocation Code */
  tac: string;
}

/**
 * Device TAC preset list.
 * Add new devices here — the Generator dropdown picks them up automatically.
 */
export const IMEI_TAC_PRESETS: ImeiTacPreset[] = [
  { id: "samsung_s24", label: "Samsung Galaxy S24", tac: "35367911" },
  { id: "samsung_s23", label: "Samsung Galaxy S23", tac: "35232511" },
  { id: "iphone_15", label: "Apple iPhone 15", tac: "35332310" },
  { id: "iphone_14", label: "Apple iPhone 14", tac: "35349010" },
  { id: "pixel_8", label: "Google Pixel 8", tac: "35269310" },
  { id: "oneplus_12", label: "OnePlus 12", tac: "86839205" },
  { id: "xiaomi_14", label: "Xiaomi 14", tac: "86826004" },
  { id: "rm520n", label: "Quectel RM520N-GL (Modem)", tac: "86932904" },
];

/** Sentinel value for the custom prefix option in the Select dropdown */
export const IMEI_CUSTOM_ID = "custom";

/** Look up a preset by ID. Returns undefined for IMEI_CUSTOM_ID or unknown IDs. */
export function getImeiTacPreset(id: string): ImeiTacPreset | undefined {
  return IMEI_TAC_PRESETS.find((p) => p.id === id);
}
