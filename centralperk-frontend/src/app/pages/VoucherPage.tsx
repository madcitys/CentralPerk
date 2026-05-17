import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, MapPin, QrCode, ShieldCheck } from "lucide-react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Badge } from "../../components/ui/badge";
import { Toaster } from "../../components/ui/sonner";
import { generateVoucherQrDataUrl } from "../lib/voucher-qr";
import { loadVoucherViaApi, validateVoucherViaApi } from "../lib/api";
import type { RedemptionVoucher } from "../types/voucher";

export default function VoucherPage() {
  const { voucherId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const [voucher, setVoucher] = useState<RedemptionVoucher | null>(null);
  const [voucherCode, setVoucherCode] = useState(() => searchParams.get("code") || "");
  const [qrImageUrl, setQrImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [validating, setValidating] = useState(false);

  useEffect(() => {
    let active = true;

    const loadVoucher = async () => {
      try {
        setLoading(true);
        const response = await loadVoucherViaApi(voucherId);
        if (!active) return;
        setVoucher(response.voucher);
      } catch (error) {
        if (!active) return;
        toast.error(error instanceof Error ? error.message : "Unable to load voucher.");
      } finally {
        if (active) setLoading(false);
      }
    };

    if (voucherId) {
      void loadVoucher();
    }

    return () => {
      active = false;
    };
  }, [voucherId]);

  useEffect(() => {
    let active = true;

    if (!voucher?.qrValue) {
      setQrImageUrl(null);
      return;
    }

    void generateVoucherQrDataUrl(voucher.qrValue)
      .then((value) => {
        if (active) setQrImageUrl(value);
      })
      .catch(() => {
        if (active) setQrImageUrl(null);
      });

    return () => {
      active = false;
    };
  }, [voucher?.qrValue]);

  const voucherStatus = useMemo(() => {
    if (!voucher) return null;
    if (voucher.status === "validated") return { label: "Validated", className: "bg-[#ecfdf3] text-[#166534]" };
    if (voucher.status === "processing") return { label: "Delivery Processing", className: "bg-[#eff6ff] text-[#1d4ed8]" };
    return { label: "Ready to Scan", className: "bg-[#eef6ff] text-[#183153]" };
  }, [voucher]);

  const handleValidate = async () => {
    if (!voucherId || !voucherCode.trim()) {
      toast.error("Enter the voucher code first.");
      return;
    }

    try {
      setValidating(true);
      const response = await validateVoucherViaApi(voucherId, voucherCode.trim());
      setVoucher(response.voucher);
      toast.success("Voucher validated.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Voucher validation failed.");
    } finally {
      setValidating(false);
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#eefcfc_0%,#ffffff_42%,#f3f6ff_100%)] px-4 py-8 lg:px-8">
      <div className="mx-auto grid w-full max-w-5xl gap-6">
        <div className="flex flex-col gap-3 rounded-[30px] border border-[#d5e6f7] bg-white/85 p-6 shadow-[0_18px_56px_rgba(16,33,58,0.08)] backdrop-blur">
          <Badge className="w-fit bg-[#eef8fb] text-[#0f766e]">Voucher Validation</Badge>
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-[#10213a] lg:text-4xl">Scannable Reward Voucher</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-[#5a6f8d]">
                This page is generated from the QR itself, so a partner or staff member can verify the voucher after scan instead of reading a raw text payload only.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link to="/login" className="rounded-full border border-[#d5e2ef] bg-white px-4 py-2 text-sm font-semibold text-[#173555]">
                Back to Login
              </Link>
              <Link to="/customer/rewards" className="rounded-full bg-[#10213a] px-4 py-2 text-sm font-semibold text-white">
                Open Rewards
              </Link>
            </div>
          </div>
        </div>

        {loading ? (
          <Card className="rounded-[28px] border border-[#d6e0f7] bg-white p-8 text-sm text-[#5a6f8d]">Loading voucher details...</Card>
        ) : voucher ? (
          <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
            <Card className="rounded-[28px] border-0 bg-[linear-gradient(135deg,#10213a_0%,#183153_58%,#255d68_100%)] p-6 text-white shadow-[0_20px_55px_rgba(16,33,58,0.16)]">
              <div className="rounded-[24px] border border-white/12 bg-white/8 p-5 text-center">
                {qrImageUrl ? (
                  <img src={qrImageUrl} alt={`Voucher QR for ${voucher.rewardName}`} className="mx-auto h-72 w-72 rounded-[24px] bg-white p-4" />
                ) : (
                  <div className="mx-auto flex h-72 w-72 items-center justify-center rounded-[24px] bg-white/12">
                    <QrCode className="h-16 w-16 text-white/80" />
                  </div>
                )}
                <p className="mt-5 text-xl font-semibold">{voucher.voucherCode}</p>
                <p className="mt-1 text-sm text-white/72">Order {voucher.orderId}</p>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/66">Status</p>
                  <p className="mt-3 text-2xl font-bold">{voucher.status === "validated" ? "Used" : voucher.status === "processing" ? "Pending" : "Ready"}</p>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/8 p-4">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/66">Points</p>
                  <p className="mt-3 text-2xl font-bold">{voucher.pointsCost.toLocaleString()}</p>
                </div>
              </div>
            </Card>

            <div className="grid gap-6">
              <Card className="rounded-[28px] border border-[#d6e0f7] bg-white p-6 shadow-[0_12px_32px_rgba(16,33,58,0.07)]">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-[#eef8fb] text-[#0f766e]">Voucher Details</Badge>
                  {voucherStatus ? <Badge className={voucherStatus.className}>{voucherStatus.label}</Badge> : null}
                </div>
                <h2 className="mt-4 text-2xl font-semibold text-[#10213a]">{voucher.rewardName}</h2>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-[#f7fafc] p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#6d829e]">Method</p>
                    <p className="mt-2 text-sm font-semibold text-[#10213a]">{voucher.method === "in-store" ? "In-store pickup" : "Delivery"}</p>
                  </div>
                  <div className="rounded-2xl bg-[#f7fafc] p-4">
                    <p className="text-xs uppercase tracking-[0.16em] text-[#6d829e]">Partner</p>
                    <p className="mt-2 text-sm font-semibold text-[#10213a]">{voucher.deliveryPartner || voucher.partnerLabel || "Counter pickup"}</p>
                  </div>
                </div>

                {voucher.deliveryAddress ? (
                  <div className="mt-4 rounded-2xl border border-[#dce7f2] bg-[#fbfdff] p-4">
                    <div className="flex items-start gap-3">
                      <MapPin className="mt-0.5 h-4 w-4 text-[#10213a]" />
                      <div>
                        <p className="text-sm font-semibold text-[#10213a]">Delivery destination</p>
                        <p className="mt-1 text-sm text-[#5a6f8d]">{voucher.deliveryAddress}</p>
                        {voucher.contactNumber ? <p className="mt-1 text-xs text-[#7a8da7]">Contact: {voucher.contactNumber}</p> : null}
                      </div>
                    </div>
                  </div>
                ) : null}

                {voucher.validatedAt ? (
                  <div className="mt-4 rounded-2xl border border-[#cce8d7] bg-[#f4fcf7] p-4 text-sm text-[#166534]">
                    Validated on {new Date(voucher.validatedAt).toLocaleString()}.
                  </div>
                ) : null}
              </Card>

              <Card className="rounded-[28px] border border-[#d6e0f7] bg-white p-6 shadow-[0_12px_32px_rgba(16,33,58,0.07)]">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 text-[#10213a]" />
                  <div>
                    <h3 className="text-lg font-semibold text-[#10213a]">Validation</h3>
                    <p className="mt-1 text-sm leading-6 text-[#5a6f8d]">
                      The QR already points to this voucher record. Final validation still checks the voucher code before marking it as used.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_auto]">
                  <Input
                    value={voucherCode}
                    onChange={(event) => setVoucherCode(event.target.value)}
                    placeholder="Enter voucher code"
                    disabled={voucher.status === "validated"}
                  />
                  <Button
                    onClick={handleValidate}
                    disabled={validating || voucher.status === "validated"}
                    className="bg-[#10213a] text-white hover:bg-[#1c3558]"
                  >
                    {voucher.status === "validated" ? (
                      <>
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Validated
                      </>
                    ) : validating ? (
                      <>
                        <Clock3 className="mr-2 h-4 w-4" />
                        Validating...
                      </>
                    ) : (
                      "Validate voucher"
                    )}
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        ) : (
          <Card className="rounded-[28px] border border-[#f0d3d3] bg-[#fff8f8] p-8 text-sm text-[#a14d4d]">Voucher not found.</Card>
        )}
      </div>
      <Toaster position="top-right" richColors />
    </div>
  );
}
