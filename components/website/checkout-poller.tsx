"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

/** Re-checks the server a limited number of times while a payment settles. */
export function CheckoutPoller() {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (tries >= 10) return;
    const t = setTimeout(() => {
      router.refresh();
      setTries((n) => n + 1);
    }, 4000 + tries * 1500);
    return () => clearTimeout(t);
  }, [tries, router]);
  return tries >= 10 ? <p className="mt-6 text-sm">Still processing. We&apos;ll email you as soon as it&apos;s confirmed — you can safely close this page.</p> : null;
}
