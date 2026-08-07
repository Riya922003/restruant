"use client";

import { useParams } from "next/navigation";
import { ErrorState } from "@/components/ui/primitives";
import { OrderDetailClient } from "@/components/orders/order-detail-client";

export default function OrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = Number(params.id);

  if (!Number.isFinite(orderId)) {
    return (
      <div className="mx-auto max-w-4xl">
        <ErrorState message="Invalid order id" />
      </div>
    );
  }

  return <OrderDetailClient orderId={orderId} />;
}