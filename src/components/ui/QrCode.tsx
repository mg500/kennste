"use client";

import { QRCodeSVG } from "qrcode.react";

/** QR code on a white tile (scanners need contrast regardless of theme). */
export function QrCode({ value, size = 96 }: { value: string; size?: number }) {
  return (
    <div className="shrink-0 rounded-xl bg-white p-2" style={{ width: size, height: size }}>
      <QRCodeSVG value={value} size={size - 16} bgColor="#ffffff" fgColor="#1a0b2e" level="M" title="QR-Code zum Beitreten" />
    </div>
  );
}
