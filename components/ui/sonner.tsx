"use client";

import { Toaster as Sonner, type ToasterProps } from "sonner";

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!bg-[#18233a] !text-white !border-0 !rounded-xl",
        },
      }}
      {...props}
    />
  );
}

export { Toaster };
