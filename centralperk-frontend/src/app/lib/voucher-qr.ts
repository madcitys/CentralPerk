import QRCode from "qrcode";

export async function generateVoucherQrDataUrl(value: string) {
  return QRCode.toDataURL(value, {
    width: 320,
    margin: 1,
    errorCorrectionLevel: "M",
    color: {
      dark: "#10213a",
      light: "#ffffff",
    },
  });
}
